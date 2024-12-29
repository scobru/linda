import { useEffect, useState, useCallback } from "react";
import { gun, DAPP_NAME } from "#protocol";
import { useAppState } from "../context/AppContext";
import { toast } from "react-hot-toast";

export const useChat = (roomId, type = "friend") => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const { appState } = useAppState();

  useEffect(() => {
    console.log("useChat - Parametri:", {
      roomId,
      userPub: appState.user?.is?.pub,
    });

    if (!roomId || !appState.user?.is?.pub) {
      console.log("useChat - Mancano parametri necessari");
      return;
    }

    let mounted = true;
    setLoading(true);
    console.log(
      "useChat - Inizializzazione sottoscrizione per roomId:",
      roomId
    );

    // Sottoscrizione diretta alla chat
    const chatRef = gun.get(DAPP_NAME).get("private_messages").get(roomId);

    // Sottoscrizione ai messaggi
    const messagesHandler = chatRef.map().on((msg, id) => {
      if (!mounted || !msg || id === "_" || !msg.timestamp) {
        console.log("useChat - Messaggio ignorato:", { msg, id });
        return;
      }

      console.log("useChat - Nuovo messaggio ricevuto:", { msg, id });

      setMessages((prev) => {
        // Evita duplicati
        const exists = prev.some((m) => m.id === id);
        if (exists) {
          console.log("useChat - Messaggio duplicato ignorato:", id);
          return prev;
        }

        // Aggiungi il nuovo messaggio
        const newMessage = {
          id,
          text: msg.text || msg.content,
          sender: msg.sender || msg.from,
          timestamp: msg.timestamp || msg.time,
          senderInfo: msg.senderInfo || {
            pub: msg.sender || msg.from,
            alias: msg.senderAlias,
          },
        };

        console.log("useChat - Aggiunto nuovo messaggio:", newMessage);

        // Ordina i messaggi per timestamp
        const newMessages = [...prev, newMessage].sort(
          (a, b) => a.timestamp - b.timestamp
        );
        return newMessages;
      });

      setLoading(false);
    });

    return () => {
      console.log("useChat - Pulizia sottoscrizione per roomId:", roomId);
      mounted = false;
      if (typeof messagesHandler === "function") {
        messagesHandler();
      }
    };
  }, [roomId, appState.user?.is?.pub]);

  const sendMessage = useCallback(
    async (text) => {
      console.log("useChat - Tentativo invio messaggio:", {
        roomId,
        userPub: appState.user?.is?.pub,
        text,
      });

      if (!appState.user?.is?.pub || !roomId || !text.trim()) {
        console.log("useChat - Mancano parametri necessari per invio");
        return false;
      }

      try {
        const messageData = {
          text: text.trim(),
          sender: appState.user.is.pub,
          timestamp: Date.now(),
          senderInfo: {
            pub: appState.user.is.pub,
            alias: appState.alias,
          },
        };

        const messageId = `msg_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;

        console.log("useChat - Invio messaggio:", { messageData, messageId });

        await new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get("private_messages")
            .get(roomId)
            .get(messageId)
            .put(messageData, (ack) => {
              if (ack.err) {
                console.error("useChat - Errore invio:", ack.err);
                reject(new Error(ack.err));
              } else {
                console.log("useChat - Messaggio inviato con successo");
                resolve();
              }
            });
        });

        return true;
      } catch (error) {
        console.error("useChat - Errore nell'invio del messaggio:", error);
        toast.error("Errore nell'invio del messaggio");
        return false;
      }
    },
    [roomId, appState.user?.is?.pub, appState.alias]
  );

  return {
    messages,
    loading,
    sendMessage,
  };
};
