import { useCallback } from "react";
import { messageService } from "../protocol/services";
import { Observable } from "rxjs";

export const useSendReceipt = (roomId) => {
  const sendReceipt = useCallback(
    async (messageId, type) => {
      try {
        await messageService.sendReceipt(roomId, messageId, type);
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

        const unsubscribe = messageService.subscribeToReceipts(
          roomId,
          messageId,
          (receipt) => {
            if (receipt) {
              subscriber.next(receipt);
            }
          }
        );

        return () => {
          if (typeof unsubscribe === "function") unsubscribe();
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
