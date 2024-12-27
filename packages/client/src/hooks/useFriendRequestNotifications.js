import React, { useRef, useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import {
  gun,
  user,
  DAPP_NAME,
  notifications,
  friendsService,
} from "linda-protocol";
import debounce from "lodash/debounce";

const { friendRequestNotifications } = notifications;

export const useFriendRequestNotifications = () => {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const processedRequestsRef = useRef(new Set());
  const subscriptionRef = useRef(null);
  const initialLoadDoneRef = useRef(false);

  // Funzione per caricare i dati dell'utente
  const loadUserData = useCallback(async (pub) => {
    return new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get("userList")
        .get("users")
        .map()
        .once((userData) => {
          if (userData && userData.pub === pub) {
            resolve({
              alias: userData.nickname || userData.username || pub,
              displayName: userData.nickname,
              username: userData.username,
              avatarSeed: userData.avatarSeed,
            });
          }
        });

      // Timeout di sicurezza
      setTimeout(() => resolve({ alias: pub }), 2000);
    });
  }, []);

  const cleanupSubscription = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current();
      subscriptionRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!user?.is?.pub) {
      setLoading(false);
      return;
    }

    console.debug("Inizializzazione sottoscrizione richieste di amicizia");
    setLoading(true);
    processedRequestsRef.current.clear();
    initialLoadDoneRef.current = false;
    cleanupSubscription();

    const requests = new Map();

    // Funzione per aggiornare lo stato
    const updateState = () => {
      const pendingReqs = Array.from(requests.values())
        .filter((req) => {
          // Filtra le richieste pendenti e con un nome utente valido
          const isValidUser = req.alias || req.username || req.displayName;
          const isPending = !req.status || req.status === "pending";
          return isPending && isValidUser;
        })
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      setPendingRequests(pendingReqs);
    };

    // Sottoscrizione alle richieste
    const subscription = gun
      .get(DAPP_NAME)
      .get("all_friend_requests")
      .map()
      .on(async (request, id) => {
        if (!request || id === "_") return;

        // Se la richiesta non è per l'utente corrente, ignora
        if (request.to !== user.is.pub) return;

        console.debug(`Richiesta ricevuta [${id}]:`, request);

        // Se la richiesta ha uno status diverso da pending, rimuovila
        if (request.status && request.status !== "pending") {
          requests.delete(id);
          processedRequestsRef.current.add(id);
        } else if (!processedRequestsRef.current.has(id)) {
          // Carica i dati dell'utente se non sono presenti
          if (!request.alias && !request.username) {
            const userData = await loadUserData(request.from);
            request = { ...request, ...userData };
          }

          // Aggiungi la richiesta solo se abbiamo informazioni valide sull'utente
          if (request.alias || request.username || request.displayName) {
            requests.set(id, {
              ...request,
              id,
              displayName:
                request.alias || request.username || request.displayName,
            });

            // Mostra notifica solo per nuove richieste
            if (initialLoadDoneRef.current) {
              toast.success(
                `Nuova richiesta di amicizia da ${
                  request.alias || request.username || request.displayName
                }`
              );
            }
          } else {
            console.debug(`Richiesta ${id} ignorata: utente sconosciuto`);
          }
        }

        updateState();
      });

    // Imposta il flag di caricamento completato dopo un breve delay
    setTimeout(() => {
      initialLoadDoneRef.current = true;
      setLoading(false);
    }, 500);

    // Salva la funzione di cleanup
    subscriptionRef.current = () => {
      if (typeof subscription === "function") {
        subscription();
      }
    };

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current();
      }
    };
  }, [user?.is?.pub, cleanupSubscription]);

  const removeRequest = useCallback((requestId) => {
    console.debug(`Rimozione richiesta ${requestId}`);
    processedRequestsRef.current.add(requestId);
    setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));

    // Aggiorna anche lo stato in Gun
    gun
      .get(DAPP_NAME)
      .get("all_friend_requests")
      .get(requestId)
      .put({ status: "removed", removedAt: Date.now() });
  }, []);

  const markAsRead = useCallback(async (requestId) => {
    try {
      await friendRequestNotifications.markAsRead(requestId);
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
  }, []);

  return {
    pendingRequests,
    loading,
    removeRequest,
    markAsRead,
  };
};
