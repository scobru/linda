import { useState, useCallback, useEffect, useRef } from "react";
import { messaging, user, security } from "linda-protocol";
import { gun, DAPP_NAME } from "linda-protocol";
import { toast } from "react-hot-toast";

const { chat, channels } = messaging;
const { createChatsCertificate, createMessagesCertificate } = security;

// Funzione helper per verificare e creare i certificati
const ensureCertificates = async (recipientPub) => {
  try {
    if (!user.is) {
      throw new Error("Utente non autenticato");
    }

    // Verifica certificato chat
    const chatCert = await new Promise((resolve) => {
      user
        .get("private_certificates")
        .get("chats")
        .get(recipientPub)
        .once((cert) => resolve(cert));
    });

    if (!chatCert) {
      await createChatsCertificate(recipientPub);
      console.log("Creato certificato chat");
    } else {
      console.log("Certificato chat esistente:", chatCert);
    }

    // Verifica certificato messaggi
    const msgCert = await new Promise((resolve) => {
      user
        .get("private_certificates")
        .get("messages")
        .get(recipientPub)
        .once((cert) => resolve(cert));
    });

    if (!msgCert) {
      await createMessagesCertificate(recipientPub);
      console.log("Creato certificato messaggi");
    } else {
      console.log("Certificato messaggi esistente:", msgCert);
    }

    return true;
  } catch (error) {
    console.error("Errore verifica/creazione certificati:", error);
    throw new Error("Impossibile creare i certificati necessari");
  }
};

export const useMessages = (selected) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const subscriptionRef = useRef(null);

  const cleanupSubscription = useCallback(() => {
    if (subscriptionRef.current) {
      try {
        subscriptionRef.current.unsubscribe();
      } catch (error) {
        console.warn("Errore durante l'unsubscribe:", error);
      }
      subscriptionRef.current = null;
    }
  }, []);

  const loadMessages = useCallback(async () => {
    if (!selected?.roomId && !selected?.id) return;

    setLoading(true);
    try {
      const path =
        selected.type === "friend"
          ? "chats"
          : selected.type === "channel"
          ? "channels"
          : "boards";
      const id = selected.type === "friend" ? selected.roomId : selected.id;

      const loadedMessages = await chat.messageList.loadMessages(path, id);

      // Decrittazione messaggi privati
      const processedMsgs = await Promise.all(
        loadedMessages.map(async (msg) => {
          if (
            selected.type === "friend" &&
            typeof msg.content === "string" &&
            msg.content.startsWith("SEA{")
          ) {
            try {
              const decrypted = await chat.messageList.decryptMessage(
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
        })
      );

      setMessages(processedMsgs.sort((a, b) => a.timestamp - b.timestamp));
      setHasMoreMessages(loadedMessages.length >= 50);
    } catch (error) {
      console.error("Errore caricamento messaggi:", error);
      toast.error("Errore nel caricamento dei messaggi");
    } finally {
      setLoading(false);
    }
  }, [selected]);

  const loadMoreMessages = useCallback(async () => {
    if (
      (!selected?.roomId && !selected?.id) ||
      isLoadingMore ||
      !hasMoreMessages
    )
      return;

    setIsLoadingMore(true);
    try {
      const path =
        selected.type === "friend"
          ? "chats"
          : selected.type === "channel"
          ? "channels"
          : "boards";
      const id = selected.type === "friend" ? selected.roomId : selected.id;
      const oldestMessage = messages[0];

      const olderMessages = await chat.messageList.loadMessages(
        path,
        id,
        null,
        oldestMessage?.timestamp || Date.now()
      );

      if (olderMessages.length === 0) {
        setHasMoreMessages(false);
        return;
      }

      // Decrittazione messaggi privati
      const processedMsgs = await Promise.all(
        olderMessages.map(async (msg) => {
          if (
            selected.type === "friend" &&
            typeof msg.content === "string" &&
            msg.content.startsWith("SEA{")
          ) {
            try {
              const decrypted = await chat.messageList.decryptMessage(
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
        })
      );

      setMessages((prev) =>
        [...processedMsgs, ...prev].sort((a, b) => a.timestamp - b.timestamp)
      );
      setHasMoreMessages(olderMessages.length >= 50);
    } catch (error) {
      console.error("Errore caricamento messaggi precedenti:", error);
      toast.error("Errore nel caricamento dei messaggi precedenti");
    } finally {
      setIsLoadingMore(false);
    }
  }, [selected, messages, isLoadingMore, hasMoreMessages]);

  useEffect(() => {
    if (!selected?.roomId && !selected?.id) return;

    setLoading(true);
    cleanupSubscription();
    setMessages([]); // Reset messages when changing chat

    try {
      const path =
        selected.type === "friend"
          ? "chats"
          : selected.type === "channel"
          ? "channels"
          : "boards";
      const id = selected.type === "friend" ? selected.roomId : selected.id;

      // Prima carica i messaggi esistenti
      loadMessages();

      // Poi sottoscrivi ai nuovi messaggi
      const subscription = gun
        .get(DAPP_NAME)
        .get(path)
        .get(id)
        .get("messages")
        .map()
        .on(async (msg, msgId) => {
          if (!msg || !msg.content) return;

          // Decrittazione per messaggi privati
          let processedMsg = { ...msg, id: msgId };
          if (
            selected.type === "friend" &&
            typeof msg.content === "string" &&
            msg.content.startsWith("SEA{")
          ) {
            try {
              const decrypted = await chat.messageList.decryptMessage(
                msg,
                selected.pub
              );
              processedMsg.content = decrypted.content;
            } catch (error) {
              console.warn("Errore decrittazione:", error);
              processedMsg.content = "[Errore decrittazione]";
            }
          }

          setMessages((prev) => {
            const exists = prev.some((m) => m.id === msgId);
            if (exists) {
              return prev.map((m) => (m.id === msgId ? processedMsg : m));
            }
            return [...prev, processedMsg].sort(
              (a, b) => a.timestamp - b.timestamp
            );
          });
          setLoading(false);
        });

      subscriptionRef.current = subscription;
    } catch (error) {
      console.error("Errore inizializzazione messaggi:", error);
      setLoading(false);
    }

    return () => {
      cleanupSubscription();
    };
  }, [
    selected?.roomId,
    selected?.id,
    selected?.type,
    selected?.pub,
    cleanupSubscription,
    loadMessages,
  ]);

  const sendMessage = useCallback(
    async (content, type = "text") => {
      if (!selected?.roomId && !selected?.id) {
        throw new Error("Chat non selezionata");
      }

      try {
        const path =
          selected.type === "friend"
            ? "chats"
            : selected.type === "channel"
            ? "channels"
            : "boards";
        const id = selected.type === "friend" ? selected.roomId : selected.id;
        const recipientPub = selected.type === "friend" ? selected.pub : null;

        if (selected.type === "friend" && !recipientPub) {
          throw new Error("Destinatario non specificato per messaggio privato");
        }

        console.log("Invio messaggio:", {
          path,
          id,
          content,
          type,
          recipientPub,
          selected,
        });

        // Per messaggi privati, verifica e crea i certificati se necessario
        if (selected.type === "friend") {
          try {
            await ensureCertificates(recipientPub);
            console.log("Certificati verificati con successo");
          } catch (error) {
            console.error("Errore verifica certificati:", error);
            throw new Error("Impossibile verificare i permessi di chat");
          }

          const result = await new Promise((resolve, reject) => {
            chat.sendMessage(id, recipientPub, content, (result) => {
              if (result.success) {
                // Aggiungi il messaggio alla lista locale immediatamente
                const newMessage = {
                  id: result.messageId,
                  content: content,
                  sender: user.is.pub,
                  recipient: recipientPub,
                  timestamp: Date.now(),
                  type: type,
                };

                setMessages((prev) =>
                  [...prev, newMessage].sort(
                    (a, b) => a.timestamp - b.timestamp
                  )
                );

                resolve(result);
              } else {
                reject(
                  new Error(
                    result.errMessage || "Errore nell'invio del messaggio"
                  )
                );
              }
            });
          });

          return result;
        }
        // Per canali e bacheche, usa il servizio appropriato
        else {
          const service = selected.type === "channel" ? channels : chat;
          const result = await service.messageList.sendMessage(
            path,
            id,
            content,
            type
          );

          if (!result || !result.success) {
            throw new Error(
              result?.message || "Errore nell'invio del messaggio"
            );
          }

          // Aggiungi il messaggio alla lista locale immediatamente
          const newMessage = {
            id: result.messageId,
            content: content,
            sender: user.is.pub,
            timestamp: Date.now(),
            type: type,
          };

          setMessages((prev) =>
            [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp)
          );

          return result;
        }
      } catch (error) {
        console.error("Errore invio messaggio:", error);
        toast.error(error.message || "Errore nell'invio del messaggio");
        throw error;
      }
    },
    [selected]
  );

  return {
    messages,
    loading,
    isLoadingMore,
    hasMoreMessages,
    loadMoreMessages,
    sendMessage,
    loadMessages,
  };
};
