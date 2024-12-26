import React from "react";
import { gun, notifications } from "linda-protocol";

export const useMessageReceipts = (messageId, roomId) => {
  const [status, setStatus] = React.useState({ delivered: false, read: false });

  React.useEffect(() => {
    if (!messageId || !roomId) return;

    const unsub = notifications.messageNotifications
      .observeReadReceipts(messageId, roomId)
      .subscribe((receipt) => {
        setStatus({
          delivered: receipt.type === "delivery" || receipt.type === "read",
          read: receipt.type === "read",
        });
      });

    // Initial state check
    gun
      .get(`chats/${roomId}/receipts`)
      .get(messageId)
      .once((receipt) => {
        if (receipt) {
          setStatus({
            delivered: receipt.type === "delivery" || receipt.type === "read",
            read: receipt.type === "read",
          });
        }
      });

    return () => {
      if (typeof unsub === "function") {
        try {
          unsub();
        } catch (error) {
          console.warn("Error unsubscribing from receipts:", error);
        }
      }
    };
  }, [messageId, roomId]);

  return {
    status,
    setStatus,
    initMessageTracking: async () => {
      if (!user.is) return;
      await gun.get(`chats/${roomId}/receipts`).get(messageId).put({
        type: "sent",
        timestamp: Date.now(),
        by: user.is.pub,
      });
    },
  };
};
