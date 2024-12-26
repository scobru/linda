import { useEffect, useState, useCallback } from "react";
import { gun, DAPP_NAME } from "linda-protocol";
import { useAppState } from "../context/AppContext";
import { toast } from "react-hot-toast";

export const useChat = (roomId, type = "friend") => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const { appState } = useAppState();

  useEffect(() => {
    if (!roomId || !appState.pub) return;

    let mounted = true;
    setLoading(true);

    // Sottoscrizione diretta alla chat
    const chatRef = gun.get(DAPP_NAME).get("private_messages").get(roomId);

    // Sottoscrizione ai messaggi
    const messagesHandler = chatRef.map().on((msg, id) => {
      if (!mounted || !msg || id === "_" || !msg.timestamp) return;

      setMessages((prev) => {
        // Evita duplicati
        const exists = prev.some((m) => m.id === id);
        if (exists) return prev;

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

        // Ordina i messaggi per timestamp
        const newMessages = [...prev, newMessage].sort(
          (a, b) => a.timestamp - b.timestamp
        );
        return newMessages;
      });

      setLoading(false);
    });

    return () => {
      mounted = false;
      if (typeof messagesHandler === "function") {
        messagesHandler();
      }
    };
  }, [roomId, appState.pub]);

  const sendMessage = useCallback(
    async (text) => {
      if (!appState.pub || !roomId || !text.trim()) {
        return false;
      }

      try {
        const messageData = {
          text: text.trim(),
          sender: appState.pub,
          timestamp: Date.now(),
          senderInfo: {
            pub: appState.pub,
            alias: appState.alias,
          },
        };

        const messageId = `msg_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;

        await new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get("private_messages")
            .get(roomId)
            .get(messageId)
            .put(messageData, (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            });
        });

        return true;
      } catch (error) {
        console.error("Errore nell'invio del messaggio:", error);
        toast.error("Errore nell'invio del messaggio");
        return false;
      }
    },
    [roomId, appState.pub, appState.alias]
  );

  return {
    messages,
    loading,
    sendMessage,
  };
};
