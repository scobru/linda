import { useState, useCallback } from "react";
import { messaging, gun, DAPP_NAME, channelsV2 } from "#protocol";
import { toast } from "react-hot-toast";
import { useAppState } from "../context/AppContext";

const { chat } = messaging;

export const useMessageSending = (selected) => {
  const [newMessage, setNewMessage] = useState("");
  const [messageTracking, setMessageTracking] = useState({});
  const { appState } = useAppState();

  // Funzione per cancellare tutti i messaggi
  const clearMessages = useCallback(async () => {
    if (!selected?.roomId) return;

    try {
      // Ottieni tutti i messaggi della chat/canale
      const messages = await new Promise((resolve) => {
        const msgs = [];
        gun
          .get(DAPP_NAME)
          .get(selected.type === "channel" ? "channels" : "chats")
          .get(selected.roomId)
          .get("messages")
          .map()
          .once((msg, id) => {
            if (msg) {
              msgs.push({ ...msg, id });
            }
          });

        setTimeout(() => resolve(msgs), 500);
      });

      // Cancella ogni messaggio
      await Promise.all(
        messages.map(
          (msg) =>
            new Promise((resolve) => {
              gun
                .get(DAPP_NAME)
                .get(selected.type === "channel" ? "channels" : "chats")
                .get(selected.roomId)
                .get("messages")
                .get(msg.id)
                .put(null, (ack) => resolve(!ack.err));
            })
        )
      );

      // Cancella anche lastMessage se presente
      await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get(selected.type === "channel" ? "channels" : "chats")
          .get(selected.roomId)
          .get("lastMessage")
          .put(null, (ack) => resolve(!ack.err));
      });

      return true;
    } catch (error) {
      console.error("Errore durante la cancellazione dei messaggi:", error);
      throw error;
    }
  }, [selected]);

  const sendMessage = useCallback(async () => {
    if (!newMessage.trim()) return;

    console.log("Tentativo invio messaggio:", {
      selected,
      content: newMessage,
    });

    try {
      if (selected?.type === "channel") {
        // Gestione messaggi per i canali
        const messageId = `msg_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;

        const message = {
          id: messageId,
          content: newMessage,
          sender: appState.user.is.pub,
          senderAlias: appState.user.is.alias,
          timestamp: Date.now(),
          type: "text",
        };

        await gun
          .get(DAPP_NAME)
          .get("channels")
          .get(selected.roomId)
          .get("messages")
          .get(messageId)
          .put(message);

        setNewMessage("");
      } else {
        // Gestione messaggi per le chat private
        return new Promise((resolve, reject) => {
          chat.sendMessage(
            selected.roomId,
            selected.pub,
            newMessage,
            (result) => {
              if (result.success) {
                setNewMessage("");
                resolve(result);
              } else {
                reject(
                  new Error(result.errMessage || "Errore invio messaggio")
                );
              }
            }
          );
        });
      }
    } catch (error) {
      console.error("Errore invio messaggio:", error);
      toast.error(error.message || "Errore durante l'invio del messaggio");
    }
  }, [selected, newMessage, appState.user.is]);

  const handleDeleteMessage = useCallback(
    async (messageId) => {
      try {
        if (selected?.type === "channel") {
          await gun
            .get(DAPP_NAME)
            .get("channels")
            .get(selected.roomId)
            .get("messages")
            .get(messageId)
            .put(null);
        } else {
          await new Promise((resolve, reject) => {
            chat.deleteMessage(selected.roomId, messageId, (result) => {
              if (result.success) {
                resolve(result);
              } else {
                reject(
                  new Error(
                    result.errMessage || "Errore eliminazione messaggio"
                  )
                );
              }
            });
          });
        }
        toast.success("Messaggio eliminato");
      } catch (error) {
        console.error("Errore eliminazione messaggio:", error);
        toast.error("Errore durante l'eliminazione del messaggio");
      }
    },
    [selected]
  );

  const handleVoiceMessage = useCallback(
    async (audioBlob) => {
      if (!selected) {
        toast.error("Nessuna chat selezionata");
        return;
      }

      if (!audioBlob) return;

      try {
        console.log("Preparazione messaggio vocale:", {
          selected,
          blobType: audioBlob.type,
          blobSize: audioBlob.size,
        });

        // Converti il blob in base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);

        reader.onloadend = async () => {
          const audioUrl = reader.result;
          console.log("Audio convertito in URL data");

          // Invia il messaggio vocale come stringa
          const messageContent = `[VOICE]${audioUrl}`;

          if (selected?.type === "channel") {
            // Gestione messaggi vocali per i canali
            const messageId = `msg_${Date.now()}_${Math.random()
              .toString(36)
              .substr(2, 9)}`;

            const message = {
              id: messageId,
              content: messageContent,
              sender: appState.user.is.pub,
              senderAlias: appState.user.is.alias,
              timestamp: Date.now(),
              type: "voice",
            };

            await gun
              .get(DAPP_NAME)
              .get("channels")
              .get(selected.roomId)
              .get("messages")
              .get(messageId)
              .put(message);

            toast.success("Messaggio vocale inviato");
          } else {
            // Gestione messaggi vocali per le chat private
            chat.sendMessage(
              selected.roomId,
              selected.pub,
              messageContent,
              (result) => {
                if (result.success) {
                  console.log("Messaggio vocale inviato con successo:", result);
                  toast.success("Messaggio vocale inviato");
                } else {
                  console.error(
                    "Errore invio messaggio vocale:",
                    result.errMessage
                  );
                  toast.error("Errore nell'invio del messaggio vocale");
                }
              }
            );
          }
        };
      } catch (error) {
        console.error("Errore invio messaggio vocale:", error);
        toast.error("Errore nell'invio del messaggio vocale");
      }
    },
    [selected, appState.user.is]
  );

  return {
    newMessage,
    setNewMessage,
    sendMessage,
    handleDeleteMessage,
    handleVoiceMessage,
    messageTracking,
    clearMessages,
  };
};
