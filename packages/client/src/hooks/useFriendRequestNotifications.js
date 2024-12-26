import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { notifications, gun, DAPP_NAME, user } from "linda-protocol";

const { friendRequestNotifications } = notifications;

export const useFriendRequestNotifications = () => {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Funzione per unificare le richieste e gestire i duplicati
  const addRequest = (request, id, type) => {
    console.log("Processamento richiesta:", { request, id, type });

    // Se la richiesta è stata rifiutata, rimuovila
    if (request && request.status === "rejected") {
      console.log("Richiesta rifiutata, rimuovo:", id);
      setPendingRequests((prev) => prev.filter((r) => r.id !== id));
      return;
    }

    setPendingRequests((prev) => {
      // Cerca una richiesta esistente con lo stesso from o id
      const existingRequest = prev.find(
        (r) =>
          r.id === id ||
          (r.from === request.from && request.from) ||
          (r.data?.senderInfo?.pub === request.from && request.from)
      );

      if (existingRequest) {
        // Se lo stato è cambiato a rejected, rimuovi la richiesta
        if (request.status === "rejected") {
          console.log("Stato cambiato a rejected, rimuovo:", id);
          return prev.filter((r) => r.id !== existingRequest.id);
        }

        // Aggiorna la richiesta esistente con eventuali nuove informazioni
        return prev.map((r) => {
          if (r.id === existingRequest.id) {
            return {
              ...r,
              ...request,
              alias: request.alias || request.senderInfo?.alias || r.alias,
              displayName:
                request.displayName ||
                request.senderInfo?.displayName ||
                r.displayName,
              type: r.type || type,
              status: request.status || r.status,
            };
          }
          return r;
        });
      }

      // Non aggiungere richieste rifiutate
      if (request.status === "rejected") {
        console.log("Nuova richiesta già rifiutata, ignoro:", id);
        return prev;
      }

      // Aggiungi la nuova richiesta
      return [
        ...prev,
        {
          ...request,
          id,
          type,
          status: request.status || "pending",
          alias:
            request.alias || request.senderInfo?.alias || "Utente sconosciuto",
        },
      ];
    });
  };

  useEffect(() => {
    console.log("Avvio osservazione richieste di amicizia");
    let subscriptions = [];

    const startObserving = async () => {
      try {
        setLoading(true);
        console.log("Utente corrente:", user.is?.pub);

        if (!user?.is) {
          console.error("Utente non autenticato");
          toast.error("Errore: utente non autenticato");
          setLoading(false);
          return;
        }

        // 1. Osserva le richieste private
        const privateRequestsSub = gun
          .get(DAPP_NAME)
          .get("friend_requests")
          .get(user.is.pub)
          .map()
          .on((request, id) => {
            console.log("Richiesta privata ricevuta:", {
              request,
              id,
              status: request?.status,
            });

            // Se la richiesta è null, è stata rimossa
            if (!request) {
              console.log("Richiesta rimossa:", id);
              setPendingRequests((prev) => prev.filter((r) => r.id !== id));
              return;
            }

            // Osserva anche i cambiamenti di stato
            if (request.from) {
              gun
                .get(DAPP_NAME)
                .get("friend_requests")
                .get(user.is.pub)
                .get(id)
                .get("status")
                .on((status) => {
                  console.log("Stato richiesta aggiornato:", { id, status });
                  if (status === "rejected") {
                    setPendingRequests((prev) =>
                      prev.filter((r) => r.id !== id)
                    );
                  }
                });
              addRequest(request, id, "private");
            }
          });
        subscriptions.push(privateRequestsSub);

        // 2. Osserva le richieste pubbliche
        const publicRequestsSub = gun
          .get(DAPP_NAME)
          .get("all_friend_requests")
          .map()
          .on((request, id) => {
            console.log("Richiesta pubblica ricevuta:", {
              request,
              id,
              status: request?.status,
            });

            // Se la richiesta è null, è stata rimossa
            if (!request) {
              console.log("Richiesta rimossa:", id);
              setPendingRequests((prev) => prev.filter((r) => r.id !== id));
              return;
            }

            if (request && request.to === user.is.pub) {
              // Osserva anche i cambiamenti di stato
              gun
                .get(DAPP_NAME)
                .get("all_friend_requests")
                .get(id)
                .get("status")
                .on((status) => {
                  console.log("Stato richiesta pubblica aggiornato:", {
                    id,
                    status,
                  });
                  if (status === "rejected") {
                    setPendingRequests((prev) =>
                      prev.filter((r) => r.id !== id)
                    );
                  }
                });
              addRequest(request, id, "public");
            }
          });
        subscriptions.push(publicRequestsSub);

        // 3. Osserva le notifiche dirette
        const notificationsSub = gun
          .user()
          .get("notifications")
          .map()
          .on((notification, id) => {
            console.log("Notifica diretta ricevuta:", {
              notification,
              id,
              status: notification?.status,
            });

            // Se la notifica è null, è stata rimossa
            if (!notification) {
              console.log("Notifica rimossa:", id);
              setPendingRequests((prev) => prev.filter((r) => r.id !== id));
              return;
            }

            if (notification && notification.type === "friendRequest") {
              // Osserva anche i cambiamenti di stato
              gun
                .user()
                .get("notifications")
                .get(id)
                .get("status")
                .on((status) => {
                  console.log("Stato notifica aggiornato:", { id, status });
                  if (status === "rejected") {
                    setPendingRequests((prev) =>
                      prev.filter((r) => r.id !== id)
                    );
                  }
                });
              addRequest(notification, id, "notification");
            }
          });
        subscriptions.push(notificationsSub);

        setLoading(false);
      } catch (error) {
        console.error("Errore nell'avvio dell'osservazione:", error);
        toast.error("Errore nel caricamento delle richieste di amicizia");
        setLoading(false);
      }
    };

    startObserving();

    return () => {
      console.log("Pulizia sottoscrizioni richieste");
      subscriptions.forEach((sub) => {
        if (typeof sub === "function") sub();
      });
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

  const removeRequest = (requestId) => {
    setPendingRequests((prev) => prev.filter((req) => req.id !== requestId));
  };

  return {
    pendingRequests,
    loading,
    markAsRead,
    removeRequest,
  };
};
