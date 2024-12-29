import { useCallback, useEffect, useState } from "react";
import { gun, user, DAPP_NAME, friends } from "linda-protocol";
import { toast } from "react-hot-toast";

const { friendsService, acceptFriendRequest, rejectFriendRequest } = friends;

export const useFriendRequestNotifications = () => {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.is?.pub) {
      setLoading(false);
      return;
    }

    setLoading(true);
    console.log("Inizializzazione monitoraggio richieste di amicizia");

    // Sottoscrizione alle richieste di amicizia usando friendsService
    const subscription = friendsService.observeFriendRequests().subscribe({
      next: (response) => {
        console.log("Nuova richiesta ricevuta:", response);
        const request = response.data;

        if (!request.status || request.status === "pending") {
          setPendingRequests((prev) => {
            const existing = prev.find((r) => r.id === request.id);
            if (existing) {
              return prev.map((r) =>
                r.id === request.id ? { ...r, ...request } : r
              );
            } else {
              const newRequest = {
                id:
                  request.id ||
                  `${request.from}_${request.to}_${request.timestamp}`,
                ...request,
                timestamp: request.timestamp || Date.now(),
              };
              console.log("Aggiunta nuova richiesta:", newRequest);
              return [...prev, newRequest].sort(
                (a, b) => b.timestamp - a.timestamp
              );
            }
          });
        } else {
          // Rimuovi la richiesta se non è più pendente
          setPendingRequests((prev) => prev.filter((r) => r.id !== request.id));
        }
      },
      error: (error) => {
        console.error("Errore nel monitoraggio richieste:", error);
        setLoading(false);
        toast.error("Errore nel caricamento delle richieste");
      },
    });

    // Carica le richieste esistenti
    gun
      .get(`${DAPP_NAME}/all_friend_requests`)
      .map()
      .once(async (request, requestId) => {
        if (!request || !requestId || requestId === "_") return;
        console.log("Richiesta esistente trovata:", { request, requestId });

        if (
          request.to === user.is.pub &&
          (!request.status || request.status === "pending")
        ) {
          // Carica l'alias dell'utente che ha inviato la richiesta
          const senderAlias = await new Promise((resolve) => {
            gun
              .get(DAPP_NAME)
              .get("users")
              .get(request.from)
              .get("alias")
              .once((alias) => {
                resolve(alias || request.from);
              });
          });

          setPendingRequests((prev) => {
            const newRequest = {
              id: requestId,
              ...request,
              displayName: senderAlias,
              timestamp: request.timestamp || Date.now(),
            };
            const existing = prev.find((r) => r.id === requestId);
            if (existing) return prev;
            console.log("Aggiunta richiesta esistente:", newRequest);
            return [...prev, newRequest].sort(
              (a, b) => b.timestamp - a.timestamp
            );
          });
        }
      });

    setLoading(false);

    return () => {
      if (subscription && typeof subscription.unsubscribe === "function") {
        subscription.unsubscribe();
      }
    };
  }, [user?.is?.pub]);

  const removeRequest = useCallback(
    async (requestId) => {
      if (!user?.is?.pub) return;

      try {
        console.debug(`Rimozione richiesta ${requestId}`);
        const request = pendingRequests.find((r) => r.id === requestId);
        if (!request) {
          throw new Error("Richiesta non trovata");
        }

        await rejectFriendRequest(request, (result) => {
          if (result.success) {
            setPendingRequests((prev) =>
              prev.filter((r) => r.id !== requestId)
            );
            toast.success("Richiesta rimossa con successo");
          } else {
            toast.error(
              result.errMessage || "Errore durante la rimozione della richiesta"
            );
          }
        });
      } catch (error) {
        console.error("Errore durante la rimozione della richiesta:", error);
        toast.error("Errore durante la rimozione della richiesta");
      }
    },
    [pendingRequests]
  );

  const acceptRequest = useCallback(
    async (requestId) => {
      if (!user?.is?.pub) return;

      try {
        const request = pendingRequests.find((r) => r.id === requestId);
        if (!request) {
          throw new Error("Richiesta non trovata");
        }

        const result = await acceptFriendRequest(request);
        if (result.success) {
          setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
          toast.success(result.message || "Richiesta accettata con successo");
          return true;
        } else {
          toast.error(
            result.message || "Errore durante l'accettazione della richiesta"
          );
          return false;
        }
      } catch (error) {
        console.error("Errore durante l'accettazione della richiesta:", error);
        toast.error("Errore durante l'accettazione della richiesta");
        return false;
      }
    },
    [pendingRequests]
  );

  const markAsRead = useCallback(async (requestId) => {
    if (!user?.is?.pub) return false;

    try {
      await gun
        .get(`${DAPP_NAME}/all_friend_requests`)
        .get(requestId)
        .get("status")
        .put("read");

      setPendingRequests((prev) =>
        prev.map((req) => (req.id === requestId ? { ...req, read: true } : req))
      );
      return true;
    } catch (error) {
      console.error("Errore nel marcare la richiesta come letta:", error);
      return false;
    }
  }, []);

  return {
    pendingRequests,
    loading,
    removeRequest,
    acceptRequest,
    markAsRead,
  };
};
