import { useState, useEffect } from "react";
import { gun, user, DAPP_NAME } from "#protocol";
import { blocking } from "#protocol";

const { userBlocking } = blocking;

export const useChatPermissions = (selected, chatData) => {
  const [canWrite, setCanWrite] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockStatus, setBlockStatus] = useState({
    blockedByMe: false,
    blockedByOther: false,
  });

  useEffect(() => {
    const checkPermissions = async () => {
      console.log("Verifica permessi per:", selected);

      if (!selected || !user?.is) {
        console.log("Nessuna chat selezionata o utente non autenticato");
        setCanWrite(false);
        return;
      }

      try {
        // Per le bacheche, tutti possono scrivere
        if (selected.type === "board") {
          console.log("Chat di tipo bacheca - permesso di scrittura concesso");
          setCanWrite(true);
          return;
        }

        // Per i canali, solo il creatore può scrivere
        if (selected.type === "channel") {
          const hasPermission = selected.creator === user.is.pub;
          console.log(
            "Chat di tipo canale - permesso di scrittura:",
            hasPermission
          );
          setCanWrite(hasPermission);
          return;
        }

        // Per le chat private
        if (selected.type === "friend" || selected.type === "chat") {
          console.log("Verifica permessi per chat privata");

          // Verifica lo stato di blocco
          const blockStatus = await userBlocking.getBlockStatus(selected.pub);
          console.log("Stato blocco:", blockStatus);

          setBlockStatus({
            blockedByMe: blockStatus.blocked,
            blockedByOther: blockStatus.blockedBy,
          });

          if (blockStatus.blocked || blockStatus.blockedBy) {
            console.log("Chat bloccata - permesso negato");
            setCanWrite(false);
            setIsBlocked(true);
            return;
          }

          // Per le chat private, tutti possono scrivere se non sono bloccati
          setCanWrite(true);
        }
      } catch (error) {
        console.error("Errore verifica permessi:", error);
        setCanWrite(false);
      }
    };

    checkPermissions();
  }, [selected, user?.is]);

  return {
    canWrite,
    isBlocked,
    blockStatus,
  };
};
