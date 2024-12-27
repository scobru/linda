import { useCallback } from "react";
import { gun, user, DAPP_NAME } from "linda-protocol";
import { Observable } from "rxjs";
import { toast } from "react-hot-toast";

export const useSendReceipt = (roomId) => {
  const sendReceipt = useCallback(
    async (messageId, type) => {
      if (!user?.is?.pub || !messageId || !roomId) return;

      try {
        await gun
          .get(DAPP_NAME)
          .get("chats")
          .get(roomId)
          .get("receipts")
          .get(messageId)
          .put({
            type,
            timestamp: Date.now(),
            by: user.is.pub,
          });
      } catch (error) {
        console.warn(`Errore invio ricevuta ${type}:`, error);
      }
    },
    [roomId]
  );

  const observeReceipts = useCallback(
    (messageId) => {
      return new Observable((subscriber) => {
        if (!roomId || !messageId) {
          subscriber.error(new Error("ID messaggio o chat mancante"));
          return;
        }

        const handler = gun
          .get(DAPP_NAME)
          .get("chats")
          .get(roomId)
          .get("receipts")
          .get(messageId)
          .on((receipt) => {
            if (receipt) {
              subscriber.next(receipt);
            }
          });

        return () => {
          if (typeof handler === "function") handler();
        };
      });
    },
    [roomId]
  );

  return {
    sendDeliveryReceipt: (messageId) => sendReceipt(messageId, "delivery"),
    sendReadReceipt: (messageId) => sendReceipt(messageId, "read"),
    observeReceipts,
  };
};
