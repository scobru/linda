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
    setError(null);

    try {
      console.log("Caricamento messaggi per:", {
        type: selected.type,
        roomId: selected.roomId,
        pub: selected.pub,
      });

      // Carica i messaggi dal nodo appropriato
      const messagesRef = gun
        .get(DAPP_NAME)
        .get("chats")
        .get(selected.roomId)
        .get("messages");

      // Carica tutti i messaggi
      const loadedMessages = await new Promise((resolve) => {
        const msgs = [];
        messagesRef.map().once((msg, id) => {
          if (msg && id !== "_" && msg.timestamp) {
            msgs.push({ ...msg, id });
          }
        });
        // Risolvi dopo un breve delay per assicurarti di aver caricato tutti i messaggi
        setTimeout(() => resolve(msgs), 500);
      });

      console.log("Messaggi caricati:", loadedMessages.length);

      // Processa i messaggi (decrittazione per chat private)
      const processedMessages = await Promise.all(
        loadedMessages.map(async (msg) => {
          try {
            // Per chat private, decrittazione
            if (selected.type === "friend") {
              console.log("Decrittazione messaggio:", msg);
              const decrypted = await messaging.messages.decrypt(
                msg,
                selected.pub
              );
              return {
                ...decrypted,
                id: msg.id,
                sender: msg.sender,
                timestamp: msg.timestamp,
                type: msg.type || "text",
              };
            }
            return msg;
          } catch (error) {
            console.error("Errore decrittazione messaggio:", error);
            return {
              ...msg,
              content: "[Errore decrittazione]",
              error: true,
            };
          }
        })
      );

      // Ordina i messaggi per timestamp
      const sortedMessages = processedMessages.sort(
        (a, b) => a.timestamp - b.timestamp
      );
      console.log("Messaggi processati:", sortedMessages);
      setMessages(sortedMessages);
    } catch (error) {
      console.error("Errore caricamento messaggi:", error);
      setError(error);
      toast.error("Errore nel caricamento dei messaggi");
    } finally {
      setLoading(false);
    }
  }, [selected]);

  // Effetto per sottoscriversi ai nuovi messaggi
  useEffect(() => {
    if (!selected?.roomId) return;

    console.log("Sottoscrizione ai nuovi messaggi:", {
      type: selected.type,
      roomId: selected.roomId,
      pub: selected.pub,
    });

    // Pulisci vecchia sottoscrizione
    if (subscriptionRef.current) {
      try {
        if (typeof subscriptionRef.current === "function") {
          subscriptionRef.current();
        }
      } catch (error) {
        console.warn("Errore pulizia sottoscrizione:", error);
      }
      subscriptionRef.current = null;
    }

    // Sottoscrivi ai nuovi messaggi
    const messagesRef = gun
      .get(DAPP_NAME)
      .get("chats")
      .get(selected.roomId)
      .get("messages");

    const subscription = messagesRef.map().on(async (msg, id) => {
      if (!msg || id === "_" || !msg.timestamp) return;

      try {
        console.log("Nuovo messaggio ricevuto:", { msg, id });
        let processedMsg = { ...msg, id };

        // Per chat private, decrittazione
        if (selected.type === "friend") {
          console.log("Decrittazione nuovo messaggio:", msg);
          const decrypted = await messaging.messages.decrypt(msg, selected.pub);
          processedMsg = {
            ...decrypted,
            id,
            sender: msg.sender,
            timestamp: msg.timestamp,
            type: msg.type || "text",
          };
        }

        console.log("Messaggio processato:", processedMsg);

        setMessages((prev) => {
          // Evita duplicati
          const exists = prev.some((m) => m.id === id);
          if (exists) {
            return prev.map((m) => (m.id === id ? processedMsg : m));
          }
          // Aggiungi nuovo messaggio e ordina
          return [...prev, processedMsg].sort(
            (a, b) => a.timestamp - b.timestamp
          );
        });
      } catch (error) {
        console.error("Errore processamento nuovo messaggio:", error);
      }
    });

    // Salva il riferimento alla sottoscrizione
    subscriptionRef.current = () => {
      try {
        if (subscription && typeof subscription.off === "function") {
          subscription.off();
        }
      } catch (error) {
        console.warn("Errore durante unsubscribe:", error);
      }
    };

    // Cleanup
    return () => {
      try {
        if (
          subscriptionRef.current &&
          typeof subscriptionRef.current === "function"
        ) {
          subscriptionRef.current();
        }
      } catch (error) {
        console.warn("Errore durante cleanup:", error);
      }
      subscriptionRef.current = null;
    };
  }, [selected]);

  return {
    messages,
    loading,
    error,
    loadMessages,
  };
};
