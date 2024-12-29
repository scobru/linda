import { useEffect, useRef, useCallback } from "react";
import { user, notifications } from "#protocol";
import { toast } from "react-hot-toast";
import { messaging } from "#protocol/messaging";

const { messageNotifications } = notifications;
const { decryptMessage } = messaging;

// Supportiamo diversi formati audio per maggiore compatibilità
const NOTIFICATION_SOUND = "/notification.mp3";

export const useMessageNotifications = (messages, chatId) => {
  const audioRef = useRef(null);
  const initialLoadDoneRef = useRef(false);
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

  // Inizializza l'audio
  useEffect(() => {
    const audio = new Audio(NOTIFICATION_SOUND);
    audio.preload = "auto";

    // Verifica che l'audio sia caricato correttamente
    audio.addEventListener("error", (e) => {
      console.error("Errore caricamento audio:", e.target.error);
    });

    audioRef.current = audio;

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Richiedi il permesso per le notifiche del browser
    if ("Notification" in window) {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!messages || messages.length === 0 || !user?.is?.pub || !chatId) return;

    // Traccia i nuovi messaggi
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.sender !== user.is.pub) {
      messageNotifications
        .trackMessage(user.is.pub, chatId, lastMessage)
        .catch((error) => {
          console.error("Errore durante il tracking del messaggio:", error);
        });
    }

    if (!initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      return;
    }

    // Verifica se il messaggio non è dell'utente corrente
    if (lastMessage.sender !== user.is.pub) {
      // Riproduci il suono di notifica
      if (audioRef.current) {
        audioRef.current.currentTime = 0; // Riavvolgi l'audio
        audioRef.current.play().catch((err) => {
          if (err.name === "NotSupportedError") {
            console.error(
              "Formato audio non supportato. Assicurati di usare un file .wav o .mp3"
            );
          } else {
            console.error("Errore riproduzione audio:", err);
          }
        });
      }

      // Mostra notifica del browser se permesso
      const showNotification = async () => {
        if ("Notification" in window && Notification.permission === "granted") {
          try {
            const decryptedContent =
              lastMessage.type === "voice"
                ? "🎤 Messaggio vocale"
                : (await decryptMessage(lastMessage, user.is.pub)).content;

            new Notification("Nuovo messaggio", {
              body: decryptedContent,
              icon: "/app-icon.png",
            });
          } catch (error) {
            console.error(
              "Errore durante la decriptazione del messaggio per la notifica:",
              error
            );
            // Mostra una notifica generica in caso di errore
            new Notification("Nuovo messaggio", {
              body: "Hai ricevuto un nuovo messaggio",
              icon: "/app-icon.png",
            });
          }
        }
      };

      showNotification();
    }
  }, [messages, chatId]);

  // Sottoscrizione alle notifiche dei messaggi
  useEffect(() => {
    if (!user?.is?.pub || !chatId) return;

    cleanupSubscription();

    try {
      const subscription = messageNotifications.observeNewMessages().subscribe({
        next: (notification) => {
          if (notification.conversationId === chatId) {
            // Aggiorna lo stato del messaggio se necessario
            console.debug("Nuova notifica messaggio:", notification);
          }
        },
        error: (error) => {
          console.error("Errore nella sottoscrizione dei messaggi:", error);
          toast.error("Errore nella ricezione dei messaggi");
        },
      });

      subscriptionRef.current = subscription;
    } catch (error) {
      console.error("Errore durante la sottoscrizione ai messaggi:", error);
    }

    return () => {
      cleanupSubscription();
    };
  }, [chatId, cleanupSubscription]);

  return {
    markConversationAsRead: async () => {
      if (!user?.is?.pub || !chatId) return;
      try {
        await messageNotifications.markConversationAsRead(user.is.pub, chatId);
      } catch (error) {
        console.error("Errore nel marcare la conversazione come letta:", error);
        toast.error("Errore nell'aggiornamento dello stato dei messaggi");
      }
    },
    getUnreadCount: async () => {
      if (!user?.is?.pub || !chatId) return 0;
      try {
        return await messageNotifications.getUnreadCount(user.is.pub, chatId);
      } catch (error) {
        console.error("Errore nel recupero dei messaggi non letti:", error);
        return 0;
      }
    },
  };
};
