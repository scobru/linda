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
  const lastProcessedTimestampRef = useRef({});

  const cleanupSubscription = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current();
      subscriptionRef.current = null;
    }
  }, []);

  const handleRequest = useCallback((request, id, type = "public") => {
    // Ignora richieste senza ID
    if (!id) return;

    // Estrai il timestamp dall'id
    const timestamp = parseInt(id.split("_").pop());

    // Se abbiamo già processato una richiesta più recente per questo tipo, ignora
    if (lastProcessedTimestampRef.current[type] >= timestamp) return;

    // Se la richiesta è già stata processata, ignora
    if (processedRequestsRef.current.has(id)) return;

    // Aggiorna l'ultimo timestamp processato per questo tipo
    lastProcessedTimestampRef.current[type] = timestamp;

    // Se la richiesta è null o ha uno status, rimuovila silenziosamente
    if (!request || request.status) {
      setPendingRequests((prev) => prev.filter((r) => r.id !== id));
      processedRequestsRef.current.add(id);
      return;
    }

    // Verifica che la richiesta sia destinata all'utente corrente
    if (type === "public" && request.to !== user.is.pub) return;

    // Aggiungi la richiesta solo se non è già presente
    setPendingRequests((prev) => {
      const exists = prev.some((r) => r.id === id);
      if (exists) return prev;

      // Mostra notifica solo per nuove richieste e dopo il caricamento iniziale
      if (initialLoadDoneRef.current) {
        toast.success(`Nuova richiesta di amicizia da ${request.from}`);
      }

      return [...prev, { ...request, id, type }];
    });

    processedRequestsRef.current.add(id);
  }, []);

  useEffect(() => {
    if (!user?.is?.pub) {
      setLoading(false);
      return;
    }

    setLoading(true);
    processedRequestsRef.current.clear();
    lastProcessedTimestampRef.current = {};
    initialLoadDoneRef.current = false;
    cleanupSubscription();

    // Sottoscrizione per le richieste pubbliche
    const publicPath = gun.get(DAPP_NAME).get("all_friend_requests");

    // Sottoscrizione per le richieste private
    const privatePath = gun
      .get(`~${user.is.pub}`)
      .get(DAPP_NAME)
      .get("friend_requests");

    // Carica le richieste esistenti e sottoscrivi ai cambiamenti
    const publicSub = publicPath.map().once((request, id) => {
      if (request && request.to === user.is.pub) {
        handleRequest(request, id, "public");
      }
    });

    const privateSub = privatePath.map().once((request, id) => {
      handleRequest(request, id, "private");
    });

    // Imposta il flag di caricamento completato dopo un breve delay
    setTimeout(() => {
      initialLoadDoneRef.current = true;
      setLoading(false);
    }, 500);

    subscriptionRef.current = () => {
      if (typeof publicSub === "function") publicSub();
      if (typeof privateSub === "function") privateSub();
    };

    return () => {
      cleanupSubscription();
    };
  }, [user?.is?.pub, handleRequest, cleanupSubscription]);

  const removeRequest = useCallback((requestId) => {
    setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
    processedRequestsRef.current.add(requestId);
  }, []);

  const markAsRead = useCallback(async (requestId, type) => {
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
  }, []);

  return {
    pendingRequests,
    loading,
    removeRequest,
    markAsRead,
  };
};
