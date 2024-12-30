import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import { messaging } from "#protocol";
import { useAppState } from "../context/AppContext";

// Costante per il namespace dell'app
const GROUPS_NAMESPACE = "linda_groups";

export const useGroupMessages = (groupId, groupType) => {
  const { appState } = useAppState();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Carica i messaggi
  const loadMessages = useCallback(async () => {
    if (!appState.isAuthenticated || !groupId) return;

    try {
      setLoading(true);
      setError(null);

      const path = groupType === "channel" ? "channels" : "boards";
      const messages = await new Promise((resolve) => {
        const results = [];
        gun
          .get(GROUPS_NAMESPACE)
          .get(path)
          .get(groupId)
          .get("messages")
          .map()
          .once((message, messageId) => {
            if (message) {
              results.push({ ...message, id: messageId });
            }
          });
        setTimeout(() => resolve(results), 500);
      });

      // Ordina i messaggi per timestamp
      const sortedMessages = messages.sort((a, b) => a.timestamp - b.timestamp);
      setMessages(sortedMessages);
    } catch (error) {
      console.error("Errore caricamento messaggi gruppo:", error);
      setError(error.message);
      toast.error("Errore nel caricamento dei messaggi del gruppo");
    } finally {
      setLoading(false);
    }
  }, [appState.isAuthenticated, groupId, groupType]);

  // Invia un messaggio
  const sendMessage = useCallback(
    async (content) => {
      if (!appState.isAuthenticated || !groupId) return;

      try {
        setLoading(true);

        const messageId = `group_msg_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        const messageData = {
          id: messageId,
          content, // Non crittografato per i gruppi
          sender: appState.user.is.pub,
          timestamp: Date.now(),
          type: "text",
        };

        const path = groupType === "channel" ? "channels" : "boards";

        // Salva il messaggio
        await gun
          .get(GROUPS_NAMESPACE)
          .get(path)
          .get(groupId)
          .get("messages")
          .get(messageId)
          .put(messageData);

        // Aggiorna lastMessage
        await gun
          .get(GROUPS_NAMESPACE)
          .get(path)
          .get(groupId)
          .get("lastMessage")
          .put({
            content:
              content.substring(0, 50) + (content.length > 50 ? "..." : ""),
            sender: appState.user.is.pub,
            timestamp: Date.now(),
          });

        // Aggiorna la lista locale
        setMessages((prev) => [...prev, messageData]);

        return messageData;
      } catch (error) {
        console.error("Errore invio messaggio gruppo:", error);
        toast.error("Errore nell'invio del messaggio al gruppo");
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [appState.isAuthenticated, appState.user, groupId, groupType]
  );

  // Elimina un messaggio
  const deleteMessage = useCallback(
    async (messageId) => {
      if (!appState.isAuthenticated || !groupId) return;

      try {
        setLoading(true);

        const path = groupType === "channel" ? "channels" : "boards";

        // Verifica permessi
        const message = messages.find((m) => m.id === messageId);
        if (!message) throw new Error("Messaggio non trovato");

        if (message.sender !== appState.user.is.pub) {
          throw new Error("Non autorizzato a eliminare questo messaggio");
        }

        // Elimina il messaggio
        await gun
          .get(GROUPS_NAMESPACE)
          .get(path)
          .get(groupId)
          .get("messages")
          .get(messageId)
          .put(null);

        // Aggiorna la lista locale
        setMessages((prev) => prev.filter((m) => m.id !== messageId));

        toast.success("Messaggio eliminato");
      } catch (error) {
        console.error("Errore eliminazione messaggio gruppo:", error);
        toast.error(error.message);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [appState.isAuthenticated, appState.user, groupId, groupType, messages]
  );

  // Sottoscrizione ai nuovi messaggi
  useEffect(() => {
    if (!appState.isAuthenticated || !groupId) return;

    const path = groupType === "channel" ? "channels" : "boards";

    const unsubscribe = gun
      .get(GROUPS_NAMESPACE)
      .get(path)
      .get(groupId)
      .get("messages")
      .map()
      .on((message, messageId) => {
        if (message) {
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === messageId);
            if (exists) {
              return prev.map((m) =>
                m.id === messageId ? { ...message, id: messageId } : m
              );
            } else {
              return [...prev, { ...message, id: messageId }].sort(
                (a, b) => a.timestamp - b.timestamp
              );
            }
          });
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        }
      });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [appState.isAuthenticated, groupId, groupType]);

  // Carica i messaggi all'avvio
  useEffect(() => {
    if (appState.isAuthenticated && groupId) {
      loadMessages();
    }
  }, [appState.isAuthenticated, groupId, loadMessages]);

  return {
    messages,
    loading,
    error,
    sendMessage,
    deleteMessage,
    loadMessages,
  };
};
