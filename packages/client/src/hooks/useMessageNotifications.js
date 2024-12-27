import { useEffect, useRef } from "react";
import { user } from "linda-protocol";

// Supportiamo diversi formati audio per maggiore compatibilità
const NOTIFICATION_SOUND = "/notification.mp3";

export const useMessageNotifications = (messages, chatType) => {
  const audioRef = useRef(null);
  const initialLoadDoneRef = useRef(false);

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
    if (!messages || messages.length === 0) return;
    if (!initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      return;
    }

    const lastMessage = messages[messages.length - 1];

    // Verifica se il messaggio non è dell'utente corrente e se è una chat privata
    if (lastMessage.sender !== user.is.pub && chatType === "friend") {
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
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Nuovo messaggio", {
          body:
            lastMessage.type === "voice"
              ? "🎤 Messaggio vocale"
              : lastMessage.content,
          icon: "/app-icon.png",
        });
      }
    }
  }, [messages, chatType]);
};
