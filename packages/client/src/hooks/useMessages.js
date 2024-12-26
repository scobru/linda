import { useState, useCallback, useEffect, useRef } from "react";
import { messaging, gun, DAPP_NAME, user } from "linda-protocol";

export const useMessages = (selected, chatData) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [oldestMessageTimestamp, setOldestMessageTimestamp] = useState(
    Date.now()
  );
  const messageMap = useRef(new Map());
  const gunRef = useRef(null);
  const processedIds = useRef(new Set());

  const processMessage = async (msg, selected) => {
    if (!msg || !msg.content || !msg.id) return null;

    // Evita duplicati
    if (processedIds.current.has(msg.id)) return null;
    processedIds.current.add(msg.id);

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

  const updateMessageList = useCallback(() => {
    const sortedMessages = Array.from(messageMap.current.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .filter((msg, index, self) => {
        // Rimuovi duplicati basati su ID
        return index === self.findIndex((m) => m.id === msg.id);
      });
    setMessages(sortedMessages);
  }, []);

  const addMessage = useCallback(
    async (msg, key) => {
      if (!msg || !msg.content) return;

      const messageId =
        key ||
        msg.id ||
        `msg_${msg.timestamp}_${Math.random().toString(36).substring(2, 15)}`;

      // Evita duplicati
      if (messageMap.current.has(messageId)) return;

      const processedMsg = await processMessage(
        { ...msg, id: messageId },
        selected
      );
      if (processedMsg) {
        messageMap.current.set(messageId, processedMsg);
        updateMessageList();
      }
    },
    [selected, updateMessageList]
  );

  const loadMessages = useCallback(async () => {
    if (!selected?.roomId && !selected?.id) return;

    try {
      setLoading(true);
      messageMap.current.clear();
      processedIds.current.clear();
      setMessages([]);

      const path =
        selected.type === "friend"
          ? "chats"
          : selected.type === "channel"
          ? "channels"
          : "boards";
      const id = selected.type === "friend" ? selected.roomId : selected.id;

      // Rimuovi la vecchia sottoscrizione
      if (gunRef.current) {
        gunRef.current.off();
        gunRef.current = null;
      }

      // Carica messaggi esistenti
      const existingMessages = await messaging.chat.messageList.loadMessages(
        path,
        id,
        null,
        Date.now()
      );
      for (const msg of existingMessages) {
        await addMessage(msg);
      }

      // Sottoscrizione per nuovi messaggi
      gunRef.current = gun
        .get(DAPP_NAME)
        .get(path)
        .get(id)
        .get("messages")
        .map();

      gunRef.current.on(async (data, key) => {
        if (!data) return;
        await addMessage(data, key);
      });
    } catch (error) {
      console.error("Errore caricamento messaggi:", error);
      setError("Errore nel caricamento dei messaggi");
    } finally {
      setLoading(false);
    }
  }, [selected, addMessage]);

  useEffect(() => {
    loadMessages();
    return () => {
      if (gunRef.current) {
        gunRef.current.off();
        gunRef.current = null;
      }
      messageMap.current.clear();
      processedIds.current.clear();
    };
  }, [loadMessages]);

  const sendMessage = useCallback(
    async (content, type = "text") => {
      if (!selected?.roomId && !selected?.id) return;

      const timestamp = Date.now();
      const messageId = `msg_${timestamp}_${Math.random()
        .toString(36)
        .substring(2, 15)}`;

      const message = {
        content,
        type,
        sender: user.is.pub,
        timestamp,
        status: "sent",
      };

      try {
        const path =
          selected.type === "friend"
            ? "chats"
            : selected.type === "channel"
            ? "channels"
            : "boards";
        const id = selected.type === "friend" ? selected.roomId : selected.id;

        await gun
          .get(DAPP_NAME)
          .get(path)
          .get(id)
          .get("messages")
          .get(messageId)
          .put(message);

        return true;
      } catch (error) {
        console.error("Errore invio messaggio:", error);
        return false;
      }
    },
    [selected]
  );

  return {
    messages,
    loading,
    error,
    isLoadingMore,
    hasMoreMessages,
    loadMessages,
    loadMoreMessages: () => {}, // Implementare se necessario
    sendMessage,
  };
};
