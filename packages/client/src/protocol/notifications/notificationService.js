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

      // Crea l'oggetto notifica
      const notificationData = {
        id: notificationId,
        type: notification.type,
        from: user.is.pub,
        timestamp: Date.now(),
        data: notification.data,
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
      if (!user?.is) {
        subscriber.error(new Error("Utente non autenticato"));
        return;
      }

      const processedNotifications = new Set();

      const notificationHandler = gun
        .get(DAPP_NAME)
        .get("notifications")
        .get(user.is.pub)
        .map()
        .on(async (notification, id) => {
          if (!notification || processedNotifications.has(id)) return;

          try {
            // Decrittazione del contenuto della notifica se presente
            if (notification.data && notification.data.content) {
              const recipientPub = notification.from;
              const decrypted = await messaging.messages.decrypt(
                notification.data,
                recipientPub
              );
              notification.data.content =
                decrypted.content || notification.data.content;
            }

            // Verifica della firma se presente
            if (notification.data && typeof notification.data === "string") {
              try {
                const verified = await SEA.verify(
                  notification.data,
                  notification.from
                );
                if (verified) {
                  notification.data = verified;
                }
              } catch (error) {
                console.error("Errore verifica firma notifica:", error);
                return;
              }
            }

            processedNotifications.add(id);
            subscriber.next(notification);
          } catch (error) {
            console.error("Errore decrittazione notifica:", error);
            notification.data.content = "[Errore decrittazione]";
            processedNotifications.add(id);
            subscriber.next(notification);
          }
        });

      // Cleanup function
      return () => {
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
