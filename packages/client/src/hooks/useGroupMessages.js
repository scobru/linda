import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import { messaging, gun } from "#protocol";
import { useAppState } from "../context/AppContext";
import { messageService } from "../protocol/services";

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

      const messages = await messageService.loadGroupMessages(
        groupId,
        groupType
      );
      setMessages(messages);
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

        const messageData = await messageService.sendGroupMessage(
          groupId,
          groupType,
          content,
          {
            sender: appState.user.is.pub,
            alias: appState.alias,
          }
        );

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
    [
      appState.isAuthenticated,
      appState.user,
      appState.alias,
      groupId,
      groupType,
    ]
  );

  // Elimina un messaggio
  const deleteMessage = useCallback(
    async (messageId) => {
      if (!appState.isAuthenticated || !groupId) return;

      try {
        setLoading(true);

        // Verifica permessi
        const message = messages.find((m) => m.id === messageId);
        if (!message) throw new Error("Messaggio non trovato");

        if (message.sender !== appState.user.is.pub) {
          throw new Error("Non autorizzato a eliminare questo messaggio");
        }

        await messageService.deleteGroupMessage(groupId, groupType, messageId);

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

    const unsubscribe = messageService.subscribeToGroupMessages(
      groupId,
      groupType,
      (message, messageId, isDeleted) => {
        setMessages((prev) => {
          if (isDeleted) {
            return prev.filter((m) => m.id !== messageId);
          }

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
      }
    );

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
