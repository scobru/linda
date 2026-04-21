import { useMemo, useRef, useState } from "react";
import { DataBase } from "../zen/db";
import { FileTransferService } from "../FileTransferService";
import { CommunicationService } from "../CommunicationService";

export const useFileTransfer = (
  db: DataBase,
  isLoggedIn: boolean,
  userPub: string | null,
  communicationService: CommunicationService | null
) => {
  const [transferProgress, setTransferProgress] = useState<Record<string, number>>({});
  const [transferBlobs, setTransferBlobs] = useState<Record<string, Blob>>({});
  const fileTransferServiceRef = useRef<FileTransferService | null>(null);

  const fileTransferServiceInst = useMemo(() => {
    if (!isLoggedIn || !userPub) return null;
    const service = new FileTransferService(db.zen as any, userPub);

    service.onFileReceived = (blob, _name, _mimeType, metaId) => {
      if (metaId) setTransferBlobs((prev) => ({ ...prev, [metaId]: blob }));
      else setTransferBlobs((prev) => ({ ...prev, last: blob }));
    };
    
    fileTransferServiceRef.current = service;
    return service;
  }, [isLoggedIn, userPub, db]);

  // Update signal sender
  useMemo(() => {
    if (fileTransferServiceInst && communicationService && userPub) {
      const sendUnifiedSignal = async (toPub: string, signal: any, prefix: string) => {
        try {
          db.zen.get(`~${toPub}`).once(() => {});
          let cert;
          for (let i = 0; i < 3; i++) {
            try {
              cert = await communicationService.getInboxCertificate(toPub);
              if (cert) break;
            } catch (e) {
              if (i === 2) throw e;
              await new Promise((r) => setTimeout(r, 1000));
            }
          }
          const payload = prefix + JSON.stringify(signal);
          const cipher = await communicationService.encryptMessage(toPub, payload);
          const signalKey = `${userPub.substring(0, 8)}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

          const targetInbox = db.zen.user(toPub).get(`signal_inbox_v13`);

          const putOptions = toPub === userPub ? {} : { opt: { cert: cert } };
          targetInbox.get(signalKey).put(
            {
              sender: userPub,
              type: cipher.type,
              body: cipher.body,
              timestamp: new Date().toISOString(),
            } as any,
            (ack: any) => {
              if (ack.err && typeof ack.err === "string" && ack.err.includes("Certificate")) {
                 communicationService.clearCertCache(toPub);
              }
            },
            putOptions as any
          );
        } catch (e: any) {
          console.warn("[FileTransfer] Failed to send signal:", e.message);
        }
      };

      fileTransferServiceInst.setSignalSender((toPub: string, signal: any) =>
        sendUnifiedSignal(toPub, signal, " Linda:SIGNAL:")
      );
    }
  }, [fileTransferServiceInst, communicationService, db, userPub]);

  return {
    fileTransferServiceInst,
    transferProgress,
    setTransferProgress,
    transferBlobs,
    setTransferBlobs
  };
};
