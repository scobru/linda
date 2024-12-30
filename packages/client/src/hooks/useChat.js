import { useEffect, useState, useCallback } from "react";
import { chatService } from "../protocol/services";
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

    // Carica messaggi iniziali
    chatService.loadMessages(roomId).then((initialMessages) => {
      if (mounted) {
        setMessages(initialMessages);
        setLoading(false);
      }
    });

    // Sottoscrizione ai nuovi messaggi
    const unsubscribe = chatService.subscribeToMessages(
      roomId,
      (newMessage) => {
        if (!mounted) return;

        setMessages((prev) => {
          // Evita duplicati
          const exists = prev.some((m) => m.id === newMessage.id);
          if (exists) {
            console.log(
              "useChat - Messaggio duplicato ignorato:",
              newMessage.id
            );
            return prev;
          }

          // Aggiungi il nuovo messaggio e ordina
          const newMessages = [...prev, newMessage].sort(
            (a, b) => a.timestamp - b.timestamp
          );
          return newMessages;
        });
      }
    );

    return () => {
      console.log("useChat - Pulizia sottoscrizione per roomId:", roomId);
      mounted = false;
      if (typeof unsubscribe === "function") {
        unsubscribe();
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
        const success = await chatService.sendMessage(roomId, text, {
          alias: appState.alias,
        });

        if (success) {
          console.log("useChat - Messaggio inviato con successo");
        }

        return success;
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
