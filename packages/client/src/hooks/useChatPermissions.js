import { useState, useEffect } from "react";
import { gun, user, DAPP_NAME } from "linda-protocol";
import { blocking } from "linda-protocol";
import { createMessagesCertificate } from "linda-protocol";

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
      if (!selected || !user?.is) {
        setCanWrite(false);
        return;
      }

      try {
        // Per le bacheche, tutti possono scrivere
        if (selected.type === "board") {
          setCanWrite(true);
          return;
        }

        // Per i canali, solo il creatore può scrivere
        if (selected.type === "channel") {
          setCanWrite(selected.creator === user.is.pub);
          return;
        }

        // Per le chat private
        if (selected.type === "friend" || selected.type === "chat") {
          // Verifica lo stato di blocco
          const blockStatus = await userBlocking.getBlockStatus(selected.pub);
          setBlockStatus({
            blockedByMe: blockStatus.blocked,
            blockedByOther: blockStatus.blockedBy,
          });

          if (blockStatus.blocked || blockStatus.blockedBy) {
            setCanWrite(false);
            setIsBlocked(true);
            return;
          }

          // Verifica il certificato
          const cert = await gun
            .get(DAPP_NAME)
            .get("certificates")
            .get(selected.pub)
            .get("messages")
            .then();

          if (!cert) {
            try {
              const newCert = await createMessagesCertificate(selected.pub);
              setCanWrite(!!newCert);
            } catch (error) {
              console.warn("Errore creazione certificato:", error);
              setCanWrite(false);
            }
          } else {
            setCanWrite(true);
          }
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
