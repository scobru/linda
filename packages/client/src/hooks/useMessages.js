import { useState, useCallback, useEffect } from "react";
import { messaging, gun, DAPP_NAME } from "linda-protocol";

export const useMessages = (selected, chatData) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [oldestMessageTimestamp, setOldestMessageTimestamp] = useState(
    Date.now()
  );
  const [processedMessageIds] = useState(new Set());

  const processMessage = async (msg, selected) => {
    if (!msg || !msg.content || !msg.id) return null;

    // Se il messaggio è già stato processato, lo saltiamo
    if (processedMessageIds.has(msg.id)) {
      return null;
    }

    processedMessageIds.add(msg.id);

    if (selected.type === "friend" && msg.content.startsWith("SEA{")) {
      try {
        const decrypted = await messaging.chat.messageList.decryptMessage(
          msg,
          selected.pub
        );
        return { ...msg, content: decrypted.content };
      } catch (error) {
        console.warn("Errore decrittazione:", error);
        return { ...msg, content: "[Errore decrittazione]" };
      }
    }
    return msg;
  };

  const updateMessages = useCallback((newMessage) => {
    setMessages((prev) => {
      // Verifica se il messaggio esiste già
      const exists = prev.some((m) => m.id === newMessage.id);
      if (exists) {
        // Aggiorna il messaggio esistente
        return prev.map((m) => (m.id === newMessage.id ? newMessage : m));
      }
      // Aggiungi il nuovo messaggio e ordina
      return [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp);
    });
  }, []);

  const loadMessages = useCallback(async () => {
    if (!selected?.roomId && !selected?.id) return;

    try {
      setLoading(true);
      processedMessageIds.clear(); // Reset dei messaggi processati
      console.log("Caricamento messaggi per:", selected);

      const path =
        selected.type === "friend"
          ? "chats"
          : selected.type === "channel"
          ? "channels"
          : "boards";
      const id = selected.type === "friend" ? selected.roomId : selected.id;

      // Carica i messaggi esistenti
      const existingMessages = await messaging.chat.messageList.loadMessages(
        path,
        id,
        null,
        Date.now()
      );

      // Processa i messaggi esistenti
      const processedMessages = await Promise.all(
        existingMessages
          .filter((msg) => msg && msg.content)
          .map((msg) => processMessage(msg, selected))
      );

      setMessages(
        processedMessages
          .filter(Boolean)
          .sort((a, b) => a.timestamp - b.timestamp)
      );
    } catch (error) {
      console.error("Errore caricamento messaggi:", error);
      setError("Errore nel caricamento dei messaggi");
    } finally {
      setLoading(false);
    }
  }, [selected?.roomId, selected?.id, selected?.type, selected?.pub]);

  // Sottoscrizione in tempo reale ai nuovi messaggi
  useEffect(() => {
    if (!selected?.roomId && !selected?.id) return;

    const path =
      selected.type === "friend"
        ? "chats"
        : selected.type === "channel"
        ? "channels"
        : "boards";
    const id = selected.type === "friend" ? selected.roomId : selected.id;

    console.log("Sottoscrizione ai messaggi per:", path, id);

    const unsubMessages = gun
      .get(DAPP_NAME)
      .get(path)
      .get(id)
      .get("messages")
      .map()
      .on(async (data, key) => {
        if (!data) return;

        try {
          const processedMessage = await processMessage(
            { ...data, id: key },
            selected
          );
          if (processedMessage) {
            updateMessages(processedMessage);
          }
        } catch (error) {
          console.error("Errore processamento messaggio:", error);
        }
      });

    return () => {
      if (typeof unsubMessages === "function") {
        unsubMessages();
      }
      processedMessageIds.clear(); // Pulisci i messaggi processati quando la sottoscrizione viene rimossa
    };
  }, [
    selected?.roomId,
    selected?.id,
    selected?.type,
    selected?.pub,
    updateMessages,
  ]);

  const loadMoreMessages = useCallback(async () => {
    if (isLoadingMore || !hasMoreMessages) return;

    try {
      setIsLoadingMore(true);
      const path =
        selected.type === "friend"
          ? "chats"
          : selected.type === "channel"
          ? "channels"
          : "boards";
      const id = selected.type === "friend" ? selected.roomId : selected.id;

      const olderMessages = await messaging.chat.messageList.loadMessages(
        path,
        id,
        20,
        oldestMessageTimestamp
      );

      if (olderMessages.length === 0) {
        setHasMoreMessages(false);
        return;
      }

      const processedMessages = await Promise.all(
        olderMessages.map((msg) => processMessage(msg, selected))
      );

      const validMessages = processedMessages.filter(Boolean);
      if (validMessages.length > 0) {
        const newOldestTimestamp = Math.min(
          ...validMessages.map((msg) => msg.timestamp)
        );
        setOldestMessageTimestamp(newOldestTimestamp);

        setMessages((prev) => {
          const allMessages = [...prev, ...validMessages];
          return allMessages.sort((a, b) => a.timestamp - b.timestamp);
        });
      }
    } catch (error) {
      console.error("Errore caricamento messaggi precedenti:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    isLoadingMore,
    hasMoreMessages,
    oldestMessageTimestamp,
    selected?.type,
    selected?.roomId,
    selected?.id,
    selected?.pub,
  ]);

  return {
    messages,
    setMessages,
    loading,
    error,
    isLoadingMore,
    hasMoreMessages,
    loadMessages,
    loadMoreMessages,
  };
};
