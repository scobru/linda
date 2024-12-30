import { useState, useEffect } from "react";
import { permissionService } from "../protocol/services";

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

      try {
        const permissions = await permissionService.checkChatPermissions(
          selected
        );
        setCanWrite(permissions.canWrite);
        setIsBlocked(permissions.isBlocked);
        setBlockStatus(permissions.blockStatus);
      } catch (error) {
        console.error("Errore verifica permessi:", error);
        setCanWrite(false);
        setIsBlocked(false);
        setBlockStatus({
          blockedByMe: false,
          blockedByOther: false,
        });
      }
    };

    checkPermissions();
  }, [selected]);

  return {
    canWrite,
    isBlocked,
    blockStatus,
  };
};
