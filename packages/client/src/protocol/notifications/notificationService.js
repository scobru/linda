import { gun, user, DAPP_NAME, SEA } from "../useGun.js";
import { Observable } from "rxjs";
import { messaging } from "../index.js";

/**
 * Servizio per la gestione delle notifiche
 */
const notificationService = {
  /**
   * Invia una notifica a un utente specifico
   * @param {string} targetPub - Chiave pubblica del destinatario
   * @param {Object} notification - Dati della notifica
   */
  notifyUser: async (targetPub, notification) => {
    if (!user?.is) {
      throw new Error("Utente non autenticato");
    }

    try {
      const notificationId = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Ottieni l'alias del mittente
      const senderAlias = await new Promise((resolve) => {
        gun
          .user(user.is.pub)
          .get("alias")
          .once((alias) => {
            resolve(alias || user.is.pub);
          });
      });

      // Se il contenuto è criptato, lo decrittiamo prima di salvare la notifica
      let notificationContent = notification.data?.content;
      if (notificationContent && notificationContent.startsWith("SEA{")) {
        try {
          const decrypted = await messaging.messages.decrypt(
            { content: notificationContent },
            targetPub
          );
          notificationContent = decrypted.content || "[Errore decrittazione]";
        } catch (error) {
          console.error("Errore decrittazione contenuto notifica:", error);
          notificationContent = "[Errore decrittazione]";
        }
      }

      // Crea l'oggetto notifica con informazioni aggiuntive
      const notificationData = {
        id: notificationId,
        type: notification.type, // 'private', 'group', 'channel'
        from: user.is.pub,
        fromAlias: senderAlias,
        sourceType: notification.sourceType, // 'private', 'group', 'channel'
        sourceName: notification.sourceName, // nome del gruppo/canale se applicabile
        sourceId: notification.sourceId, // ID del gruppo/canale/chat
        timestamp: Date.now(),
        data: {
          ...notification.data,
          content: notificationContent,
        },
        status: "unread",
      };

      // Salva la notifica nel nodo dell'utente destinatario
      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get("notifications")
          .get(targetPub)
          .get(notificationId)
          .put(notificationData, (ack) => {
            if (ack.err) reject(new Error(ack.err));
            else resolve();
          });
      });

      return {
        success: true,
        notificationId,
      };
    } catch (error) {
      console.error("Errore invio notifica:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Osserva le notifiche in arrivo per l'utente corrente
   * @returns {Observable} Observable che emette le nuove notifiche
   */
  observeNotifications: () => {
    return new Observable((subscriber) => {
      console.log(
        "Inizializzazione observer notifiche per utente:",
        user?.is?.pub
      );
      if (!user?.is) {
        console.error("Utente non autenticato per le notifiche");
        subscriber.error(new Error("Utente non autenticato"));
        return;
      }

      const processedNotifications = new Set();

      // Verifica iniziale del nodo notifiche
      gun
        .get(DAPP_NAME)
        .get("notifications")
        .get(user.is.pub)
        .once((data) => {
          console.log("Verifica nodo notifiche:", data);
        });

      const notificationHandler = gun
        .get(DAPP_NAME)
        .get("notifications")
        .get(user.is.pub)
        .map()
        .on((notification, id) => {
          console.log("Raw notification data:", { notification, id });

          // Se la notifica è null, potrebbe essere stata cancellata
          if (!notification) {
            console.log("Notifica nulla ricevuta per id:", id);
            return;
          }

          // Se la notifica è già stata processata
          if (processedNotifications.has(id)) {
            console.log("Notifica già processata:", id);
            return;
          }

          console.log("Processamento nuova notifica:", { notification, id });

          (async () => {
            try {
              // Se manca l'alias del mittente, proviamo a recuperarlo
              if (!notification.fromAlias && notification.from) {
                notification.fromAlias = await new Promise((resolve) => {
                  gun
                    .user(notification.from)
                    .get("alias")
                    .once((alias) => {
                      resolve(alias || notification.from);
                    });
                });
              }

              // Decrittazione del contenuto della notifica se presente
              if (notification.data) {
                console.log(
                  "Elaborazione notifica con dati:",
                  notification.data
                );

                // Se il contenuto è una stringa criptata
                if (
                  notification.data.content &&
                  notification.data.content.startsWith("SEA{")
                ) {
                  console.log(
                    "Tentativo decrittazione contenuto:",
                    notification.data.content
                  );
                  try {
                    // Ottieni la chiave pubblica del mittente
                    const senderEpub = await new Promise((resolve) => {
                      gun.user(notification.from).once((data) => {
                        console.log("Chiave mittente trovata:", data?.epub);
                        resolve(data?.epub);
                      });
                    });

                    if (!senderEpub) {
                      throw new Error("Chiave mittente non trovata");
                    }

                    // Genera il segreto condiviso
                    const secret = await SEA.secret(senderEpub, user.pair());
                    console.log("Segreto generato:", !!secret);

                    // Decripta il contenuto
                    const decrypted = await SEA.decrypt(
                      notification.data.content,
                      secret
                    );
                    console.log("Contenuto decrittato:", decrypted);

                    if (!decrypted) {
                      throw new Error("Decrittazione fallita");
                    }

                    notification.data.content = decrypted;
                  } catch (error) {
                    console.error("Errore decrittazione contenuto:", error);
                    notification.data.content = "[Errore decrittazione]";
                  }
                }
              }

              // Formatta il titolo della notifica in base al tipo
              let notificationTitle = "";
              switch (notification.sourceType) {
                case "private":
                  notificationTitle = `Messaggio da ${notification.fromAlias}`;
                  break;
                case "group":
                  notificationTitle = `${notification.fromAlias} in ${notification.sourceName}`;
                  break;
                case "channel":
                  notificationTitle = `${notification.fromAlias} nel canale ${notification.sourceName}`;
                  break;
                default:
                  notificationTitle = `Notifica da ${notification.fromAlias}`;
              }
              notification.title = notificationTitle;

              // Mostra la notifica del browser dopo la decrittazione
              if (
                "Notification" in window &&
                Notification.permission === "granted"
              ) {
                new Notification(notification.title, {
                  body: notification.data.content,
                  icon: "/app-icon.png",
                });
              }

              processedNotifications.add(id);
              console.log("Emissione notifica elaborata:", notification);
              subscriber.next(notification);
            } catch (error) {
              console.error("Errore elaborazione notifica:", error);
              if (notification.data && notification.data.content) {
                notification.data.content = "[Errore elaborazione]";
              }
              processedNotifications.add(id);
              subscriber.next(notification);
            }
          })();
        });

      // Log per confermare che il listener è stato impostato
      console.log("Listener notifiche impostato correttamente");

      // Cleanup function
      return () => {
        console.log("Cleanup listener notifiche");
        if (typeof notificationHandler === "function") {
          notificationHandler();
        }
        processedNotifications.clear();
      };
    });
  },

  /**
   * Marca una notifica come letta
   * @param {string} notificationId - ID della notifica
   */
  markAsRead: async (notificationId) => {
    if (!user?.is) {
      throw new Error("Utente non autenticato");
    }

    try {
      await gun
        .get(DAPP_NAME)
        .get("notifications")
        .get(user.is.pub)
        .get(notificationId)
        .get("status")
        .put("read");

      return true;
    } catch (error) {
      console.error("Errore aggiornamento stato notifica:", error);
      return false;
    }
  },

  /**
   * Rimuove una notifica
   * @param {string} notificationId - ID della notifica da rimuovere
   */
  removeNotification: async (notificationId) => {
    if (!user?.is) {
      throw new Error("Utente non autenticato");
    }

    try {
      await gun
        .get(DAPP_NAME)
        .get("notifications")
        .get(user.is.pub)
        .get(notificationId)
        .put(null);

      return true;
    } catch (error) {
      console.error("Errore rimozione notifica:", error);
      return false;
    }
  },
};

export const { notifyUser } = notificationService;
export default notificationService;
