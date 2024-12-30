import { useEffect, useRef, useCallback } from "react";
import { notifications } from "#protocol";
import { toast } from "react-hot-toast";
import { useAppState } from "../context/AppContext";

const { messageNotifications } = notifications;

// Supportiamo diversi formati audio per maggiore compatibilità
const NOTIFICATION_SOUND = "/notification.mp3";

export const useMessageNotifications = (messages, chatId) => {
  const { appState } = useAppState();
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
    if (!messages || messages.length === 0 || !chatId) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.sender !== appState.user?.is?.pub) {
      messageNotifications
        .trackMessage(appState.user?.is?.pub, chatId, lastMessage)
        .catch((error) => {
          console.error("Errore durante il tracking del messaggio:", error);
        });
    }

    if (!initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      return;
    }

    if (lastMessage.sender !== appState.user?.is?.pub) {
      // Riproduci il suono di notifica
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch((err) => {
          console.error("Errore riproduzione audio:", err);
        });
      }

      // Mostra notifica del browser
      if ("Notification" in window) {
        Notification.requestPermission().then((permission) => {
          if (permission === "granted") {
            new Notification("Nuovo messaggio", {
              body: lastMessage.text,
              icon: "/icon.png",
            });
          }
        });
      }
    }
  }, [messages, chatId, appState.user?.is?.pub]);

  // Sottoscrizione alle notifiche dei messaggi
  useEffect(() => {
    if (!appState.user?.is?.pub || !chatId) return;

    cleanupSubscription();

    try {
      const subscription = messageNotifications.observeNewMessages().subscribe({
        next: (notification) => {
          if (notification.conversationId === chatId) {
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
  }, [chatId, cleanupSubscription, appState.user?.is?.pub]);

  return {
    markConversationAsRead: async () => {
      if (!appState.user?.is?.pub || !chatId) return;
      try {
        await messageNotifications.markConversationAsRead(
          appState.user.is.pub,
          chatId
        );
      } catch (error) {
        console.error("Errore nel marcare la conversazione come letta:", error);
        toast.error("Errore nell'aggiornamento dello stato dei messaggi");
      }
    },
    getUnreadCount: async () => {
      if (!appState.user?.is?.pub || !chatId) return 0;
      try {
        return await messageNotifications.getUnreadCount(
          appState.user.is.pub,
          chatId
        );
      } catch (error) {
        console.error(
          "Errore nel recupero del conteggio messaggi non letti:",
          error
        );
        return 0;
      }
    },
  };
};
