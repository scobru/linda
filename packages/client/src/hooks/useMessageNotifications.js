import { useEffect, useRef, useCallback } from "react";
import { user, notifications } from "#protocol";
import { toast } from "react-hot-toast";
import { messaging } from "#protocol";

const { messageNotifications } = notifications;
const { messages: messageService } = messaging;

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
    // Richiedi il permesso per le notifiche del browser in modo compatibile con Brave
    if ("Notification" in window) {
      // In Brave, dobbiamo prima controllare se le notifiche sono già state autorizzate
      if (Notification.permission === "default") {
        Notification.requestPermission().catch((error) => {
          console.warn(
            "Errore nella richiesta dei permessi per le notifiche:",
            error
          );
        });
      }

      // Mostra il box informativo solo la prima volta
      const hasShownInfo = localStorage.getItem("notificationInfoShown");
      if (!hasShownInfo) {
        const infoBox = document.createElement("div");
        infoBox.style.cssText = `
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: #373B5C;
          border: 2px solid #4A4F76;
          border-radius: 10px;
          padding: 15px;
          color: white;
          max-width: 300px;
          z-index: 9999;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        `;
        infoBox.innerHTML = `
          <h3 style="margin: 0 0 10px; font-size: 16px; font-weight: bold;">📱 Notifiche Personalizzate</h3>
          <p style="margin: 0 0 10px; font-size: 14px;">
            Riceverai notifiche dettagliate per:
            <br>• 💬 Chat private con stato online
            <br>• 📌 Board con sezioni e thread
            <br>• 📢 Canali con membri e tema
            <br>• 🎤 Messaggi vocali con durata
            <br>• 📷 Immagini con dimensioni
            <br>• 📎 File con dimensione
            <br>• 👁️ Stato di lettura
          </p>
          <button style="
            background: #4A4F76;
            border: none;
            color: white;
            padding: 8px 15px;
            border-radius: 5px;
            cursor: pointer;
            width: 100%;
          ">Ho capito!</button>
        `;

        document.body.appendChild(infoBox);

        // Rimuovi il box quando viene cliccato il pulsante
        infoBox.querySelector("button").onclick = () => {
          infoBox.remove();
          localStorage.setItem("notificationInfoShown", "true");
        };
      }
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
        // Verifica se siamo su Brave e se le notifiche sono supportate
        const isBrave = navigator.brave !== undefined;
        const notificationsAllowed =
          "Notification" in window &&
          Notification.permission === "granted" &&
          (!isBrave ||
            (await navigator.permissions.query({ name: "notifications" }))
              .state === "granted");

        if (notificationsAllowed) {
          try {
            // Usa lo stesso metodo di decrittazione della chat box
            const recipientPub = lastMessage.sender;
            const decryptedMessage = await messageService.decrypt(
              lastMessage,
              recipientPub
            );
            const decryptedContent =
              lastMessage.type === "voice"
                ? "🎤 Messaggio vocale"
                : decryptedMessage.content || "[Errore decrittazione]";

            // Prepara il titolo con informazioni dettagliate in base al tipo di chat
            const senderName = lastMessage.alias || "Utente";
            let title = "";
            let additionalInfo = "";
            let messageTypeInfo = "";

            // Determina il tipo di chat in base al chatId e altre proprietà
            if (lastMessage.isBoard || chatId.startsWith("board_")) {
              const boardName = lastMessage.boardName || "Board";
              const boardEmoji = "📌"; // Emoji per board
              title = `${boardEmoji} ${boardName} • ${senderName}`;

              // Informazioni aggiuntive per board
              additionalInfo = `\n📍 Sezione: ${
                lastMessage.section || "Generale"
              }`;
              if (lastMessage.threadId) {
                additionalInfo += `\n🧵 Thread: ${
                  lastMessage.threadTitle || "Discussione"
                }`;
              }
            } else if (lastMessage.isChannel || chatId.startsWith("channel_")) {
              const channelName = lastMessage.channelName || "Canale";
              const channelEmoji = "📢"; // Emoji per channel
              title = `${channelEmoji} ${channelName} • ${senderName}`;

              // Informazioni aggiuntive per channel
              additionalInfo = `\n👥 Membri: ${
                lastMessage.memberCount || "?"
              }\n📝 Tema: ${lastMessage.topic || "Nessun tema"}`;
            } else {
              // Chat privata
              const chatEmoji = "💬"; // Emoji per chat privata
              const displayName = lastMessage.alias || "Utente";
              const status = lastMessage.isOnline ? "🟢" : "⚪"; // Stato online/offline
              title = `${chatEmoji} ${displayName} ${status}`;

              // Informazioni aggiuntive per chat private
              const readStatus = lastMessage.readBy
                ? `\n👁️ Letto da ${lastMessage.readBy.length} persone`
                : "";
              additionalInfo = `${readStatus}`;
            }

            // Prepara il corpo del messaggio con timestamp
            const time = new Date(lastMessage.timestamp).toLocaleTimeString(
              "it-IT",
              {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }
            );

            // Aggiungi emoji e dettagli in base al tipo di messaggio
            if (
              lastMessage.contentType === "voice" ||
              lastMessage.type === "voice"
            ) {
              const duration = lastMessage.duration
                ? `\n⏱️ Durata: ${Math.round(lastMessage.duration)}s`
                : "";
              messageTypeInfo = `🎤 Messaggio vocale${duration}`;
            } else if (
              lastMessage.contentType === "image" ||
              lastMessage.type === "image"
            ) {
              const dimensions = lastMessage.dimensions
                ? `\n📐 ${lastMessage.dimensions.width}x${lastMessage.dimensions.height}`
                : "";
              messageTypeInfo = `📷 Immagine${dimensions}`;
            } else if (
              lastMessage.contentType === "file" ||
              lastMessage.type === "file"
            ) {
              const size = lastMessage.size
                ? `\n📦 ${(lastMessage.size / 1024).toFixed(1)} KB`
                : "";
              messageTypeInfo = `📎 File: ${
                lastMessage.fileName || "Sconosciuto"
              }${size}`;
            } else {
              messageTypeInfo = `💬 ${decryptedContent}`;
            }

            // Aggiungi informazioni sullo stato del messaggio
            const status =
              lastMessage.status === "sent"
                ? "✓"
                : lastMessage.status === "delivered"
                ? "✓✓"
                : lastMessage.status === "read"
                ? "✓✓✓"
                : "";

            // Crea la notifica in modo compatibile con Brave
            const notificationOptions = {
              body: `${messageTypeInfo}${additionalInfo}\n⌚ ${time} ${status}`,
              icon:
                lastMessage.type === "image"
                  ? lastMessage.thumbnail || "/app-icon.png"
                  : "/app-icon.png",
              tag: `message-${lastMessage.id}`,
              requireInteraction: true,
              renotify: true, // Forza la visualizzazione anche se esiste una notifica con lo stesso tag
              data: {
                chatId: chatId,
                messageId: lastMessage.id,
                type: lastMessage.type,
                sender: lastMessage.sender,
              },
            };

            // In Brave, alcune opzioni potrebbero non essere supportate e
            if (!isBrave) {
              notificationOptions.badge = "/notification-badge.png";
              notificationOptions.actions = [
                {
                  action: "reply",
                  title: "↩️ Rispondi",
                },
                {
                  action: "mark-read",
                  title: "✓ Segna come letto",
                },
              ];
            }

            const notification = new Notification(title, notificationOptions);

            // Gestisci il click sulla notifica
            notification.onclick = (event) => {
              event.preventDefault();
              // Focalizza la finestra dell'app
              window.focus();
              if (window.opener) window.opener.focus();
              // Chiudi la notifica
              notification.close();
            };
          } catch (error) {
            console.error(
              "Errore durante la decriptazione del messaggio per la notifica:",
              error
            );
            // Mostra una notifica generica in caso di errore
            const notification = new Notification("Nuovo messaggio", {
              body: "Hai ricevuto un nuovo messaggio",
              icon: "/app-icon.png",
              tag: `message-${lastMessage.id}`,
              requireInteraction: true,
              renotify: true,
            });

            notification.onclick = () => {
              window.focus();
              if (window.opener) window.opener.focus();
              notification.close();
            };
          }
        }
      };

      showNotification().catch((error) => {
        console.error(
          "Errore durante la visualizzazione della notifica:",
          error
        );
      });
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
