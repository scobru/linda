import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { notifications } from "linda-protocol";

const { friendRequestNotifications } = notifications;

export const useFriendRequestNotifications = () => {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const subscription = friendRequestNotifications
      .observeFriendRequests()
      .subscribe({
        next: (request) => {
          setPendingRequests((prev) => {
            // Verifica se la richiesta è già presente
            if (prev.some((r) => r.id === request.id)) {
              return prev;
            }

            // Mostra una notifica toast per le nuove richieste
            toast.success(
              `Nuova richiesta di amicizia da ${request.alias || request.from}`,
              {
                duration: 5000,
                position: "top-right",
              }
            );

            return [...prev, request];
          });
          setLoading(false);
        },
        error: (error) => {
          console.error("Errore osservazione richieste:", error);
          toast.error("Errore nel caricamento delle richieste di amicizia");
          setLoading(false);
        },
      });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const markAsRead = async (requestId, type) => {
    try {
      await friendRequestNotifications.markAsRead(requestId, type);
      setPendingRequests((prev) =>
        prev.map((req) =>
          req.id === requestId ? { ...req, status: "read" } : req
        )
      );
      return true;
    } catch (error) {
      console.error("Errore nel marcare la richiesta come letta:", error);
      return false;
    }
  };

  return {
    pendingRequests,
    loading,
    markAsRead,
  };
};
