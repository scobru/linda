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

        console.log("useMessages - Preparazione invio messaggio:", {
          content:
            typeof content === "string" ? content.substring(0, 100) : "object",
          type,
          isObject: typeof content === "object",
          hasType: content?.type,
          path,
          id,
        });

        if (typeof content === "object" && content.type) {
          // Se riceviamo un oggetto messaggio completo, usiamo quello
          console.log("Invio messaggio con oggetto completo:", {
            type: content.type,
            contentPreview: content.content?.substring(0, 100),
          });

          const result = await chat.messageList.sendMessage(path, id, content);
          return result;
        }

        // Per messaggi privati, verifica e crea i certificati se necessario
        if (selected.type === "friend") {
          try {
            await ensureCertificates(recipientPub);
          } catch (error) {
            console.error("Errore verifica certificati:", error);
            throw new Error("Impossibile verificare i permessi di chat");
          }

          const result = await new Promise((resolve, reject) => {
            chat.sendMessage(id, recipientPub, content, (result) => {
              if (result.success) {
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
        // Per canali
        else if (selected.type === "channel") {
          const messageData = {
            content,
            type,
            timestamp: Date.now(),
            sender: user.is.pub,
          };

          const result = await channels.sendMessage(id, messageData);

          if (result && result.success) {
            setMessages((prev) =>
              [...prev, { ...messageData, id: result.messageId }].sort(
                (a, b) => a.timestamp - b.timestamp
              )
            );
          }

          return result;
        }
        // Per bacheche
        else if (selected.type === "board") {
          console.log("Invio messaggio per bacheca:", {
            content,
            type,
            timestamp: Date.now(),
            sender: user.is.pub,
          });

          const messageData = {
            content,
            type,
            timestamp: Date.now(),
            sender: user.is.pub,
          };

          // Genera un ID unico per il messaggio
          const messageId = `${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;

          // Usa il metodo specifico per le board
          const ack = gun
            .get(DAPP_NAME)
            .get(path)
            .get(id)
            .get("messages")
            .get(messageId)
            .put(messageData);

          if (ack.err) {
            console.error("Errore salvataggio messaggio:", ack.err);
            throw new Error(ack.err);
          }


          console.log("Ack:", ack);

          const newMessage = {
            ...messageData,
            id: messageId,
          };

          setMessages((prev) =>
            [...prev, newMessage].sort(
              (a, b) => a.timestamp - b.timestamp
            )
          );

          console.log("Messaggio inviato:", newMessage);

          return { success: true, messageId };
        } else {
          throw new Error(`Tipo di chat non supportato: ${selected.type}`);
        }
      } catch (error) {
        console.error("Errore invio messaggio:", error);
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
