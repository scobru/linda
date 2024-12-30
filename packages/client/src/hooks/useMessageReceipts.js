import React, { useCallback } from "react";
import { notifications, user } from "#protocol";
import { toast } from "react-hot-toast";

export const useMessageReceipts = (messageId, roomId) => {
  const [status, setStatus] = React.useState({ delivered: false, read: false });
  const subscriptionRef = React.useRef(null);

  const cleanupSubscription = useCallback(() => {
    if (subscriptionRef.current) {
      try {
        subscriptionRef.current.unsubscribe();
      } catch (error) {
        console.warn("Errore durante l'unsubscribe dalle ricevute:", error);
      }
      subscriptionRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    if (!messageId || !roomId || !user?.is?.pub) return;

    cleanupSubscription();

    try {
      const subscription = notifications.messageNotifications
        .observeReadReceipts(roomId)
        .subscribe({
          next: (receipt) => {
            if (receipt.messageId === messageId) {
              setStatus({
                delivered:
                  receipt.status === "delivered" || receipt.status === "read",
                read: receipt.status === "read",
              });
            }
          },
          error: (error) => {
            console.error("Errore nella sottoscrizione delle ricevute:", error);
            toast.error("Errore nel monitoraggio delle ricevute");
          },
        });

      subscriptionRef.current = subscription;

      // Verifica stato iniziale
      notifications.messageNotifications
        .getAll(user.is.pub)
        .then((notifications) => {
          const receipt = notifications.find((n) => n.messageId === messageId);
          if (receipt) {
            setStatus({
              delivered:
                receipt.status === "delivered" || receipt.status === "read",
              read: receipt.status === "read",
            });
          }
        })
        .catch((error) => {
          console.error("Errore nel recupero dello stato iniziale:", error);
        });
    } catch (error) {
      console.error("Errore durante la sottoscrizione alle ricevute:", error);
    }

    return () => {
      cleanupSubscription();
    };
  }, [messageId, roomId, cleanupSubscription]);

  return {
    status,
    setStatus,
    initMessageTracking: async () => {
      if (!user?.is?.pub || !messageId || !roomId) return;

      try {
        await notifications.messageNotifications.trackMessage(
          user.is.pub,
          roomId,
          {
            id: messageId,
            status: "sent",
            timestamp: Date.now(),
            sender: user.is.pub,
          }
        );
      } catch (error) {
        console.error("Errore durante l'inizializzazione del tracking:", error);
        toast.error("Errore nell'inizializzazione del tracking dei messaggi");
      }
    },
  };
};
