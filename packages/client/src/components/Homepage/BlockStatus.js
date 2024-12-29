import React, { useEffect, useState, useRef } from "react";
import { blocking } from "#protocol";
import { toast } from "react-hot-toast";

const { userBlocking } = blocking;

export default function BlockStatus({ targetPub }) {
  const [blockStatus, setBlockStatus] = useState({
    blocked: false,
    blockedBy: false,
    canUnblock: false,
  });

  // Ref per tenere traccia dell'ultimo stato notificato
  const lastNotifiedStatus = useRef({
    blocked: false,
    blockedBy: false,
  });

  useEffect(() => {
    if (!targetPub) return;

    // Verifica iniziale dello stato di blocco
    const checkInitialStatus = async () => {
      try {
        const status = await userBlocking.getBlockStatus(targetPub);
        setBlockStatus(status);
        lastNotifiedStatus.current = {
          blocked: status.blocked,
          blockedBy: status.blockedBy,
        };
      } catch (error) {
        console.error("Errore verifica stato blocco:", error);
      }
    };

    checkInitialStatus();

    // Sottoscrizione ai cambiamenti dello stato di blocco
    const subscription = userBlocking.observeBlockStatus(targetPub).subscribe({
      next: (status) => {
        if (status.type === "my_block_status") {
          setBlockStatus((prev) => ({
            ...prev,
            blocked: status.blocked,
            canUnblock: status.canUnblock,
          }));

          // Notifica solo se lo stato è cambiato
          if (lastNotifiedStatus.current.blocked !== status.blocked) {
            lastNotifiedStatus.current.blocked = status.blocked;
            if (status.blocked) {
              toast.success("Utente bloccato con successo");
            }
          }
        } else if (status.type === "their_block_status") {
          setBlockStatus((prev) => ({
            ...prev,
            blockedBy: status.blockedBy,
          }));

          // Notifica solo se lo stato è cambiato
          if (lastNotifiedStatus.current.blockedBy !== status.blockedBy) {
            lastNotifiedStatus.current.blockedBy = status.blockedBy;
            if (status.blockedBy) {
              toast.error("Sei stato bloccato da questo utente");
            }
          }
        }
      },
      error: (error) => {
        console.error("Errore monitoraggio blocchi:", error);
      },
    });

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [targetPub]);

  // Non mostrare nulla se non c'è nessun blocco
  if (!blockStatus.blocked && !blockStatus.blockedBy) {
    return null;
  }

  // Mostra solo un banner se c'è un blocco
  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 bg-red-500 text-white text-center">
      {blockStatus.blocked ? (
        <p>Hai bloccato questo utente</p>
      ) : blockStatus.blockedBy ? (
        <p>Sei stato bloccato da questo utente</p>
      ) : null}
    </div>
  );
}
