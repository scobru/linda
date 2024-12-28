import { useState, useCallback, useEffect, useRef } from "react";
import { messaging, gun, DAPP_NAME } from "linda-protocol";
import { toast } from "react-hot-toast";

export const useMessages = (selected) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const subscriptionRef = useRef(null);

  const loadMessages = useCallback(async () => {
    if (!selected?.roomId) return;

    setLoading(true);
    try {
      // Ottieni i messaggi in base al tipo di chat
      const path =
        selected.type === "channel"
          ? "channels"
          : selected.type === "board"
          ? "boards"
          : "chats";

      const messagesRef = gun
        .get(DAPP_NAME)
        .get(path)
        .get(selected.roomId)
        .get("messages");

      // Sottoscrizione ai messaggi
      const subscription = messagesRef.map().once((data, id) => {
        if (data) {
          setMessages((prev) => {
            // Evita duplicati
            const exists = prev.some((msg) => msg.id === id);
            if (!exists) {
              return [...prev, { ...data, id }].sort(
                (a, b) => a.timestamp - b.timestamp
              );
            }
            return prev;
          });
        }
      });

      // Salva il riferimento alla sottoscrizione
      subscriptionRef.current = subscription;
    } catch (error) {
      console.error("Errore caricamento messaggi:", error);
      setError(error);
      toast.error("Errore nel caricamento dei messaggi");
    } finally {
      setLoading(false);
    }
  }, [selected]);

  // Cleanup quando cambia la selezione
  useEffect(() => {
    loadMessages();

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.off();
      }
      setMessages([]);
    };
  }, [selected?.roomId, loadMessages]);

  return {
    messages,
    loading,
    error,
    loadMessages,
  };
};
