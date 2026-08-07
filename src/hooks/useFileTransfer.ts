import { useMemo, useRef, useState } from "react";
import { DataBase } from 'linda-core';
import { FileTransferService } from 'linda-core';
import { CommunicationService } from 'linda-core';

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

    service.onFileReceived = (blob: any, _name: any, _mimeType: any, metaId: any) => {
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
          const payload = prefix + JSON.stringify(signal);
          const cipher = await communicationService.encryptMessage(toPub, payload);
          const signalKey = `${userPub.substring(0, 8)}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          const envelope = {
            sender: userPub,
            type: cipher.type,
            body: cipher.body,
            timestamp: new Date().toISOString(),
          } as any;

          // Primary route: use ZEN ephemeral push messaging (DAM protocol).
          // This avoids writing volatile signaling data to the graph, 
          // improving privacy and keeping the relay storage clean.
          // The payload is ECDH-encrypted either way.
          db.zen.push(toPub, envelope);

          // Legacy route, best effort: only when a certificate is already
          // cached, so we never block on a lookup that usually fails.
          const cert = communicationService.getCachedInboxCertificate(toPub);
          if (cert || toPub === userPub) {
            const putOptions = toPub === userPub ? {} : { opt: { cert } };
            db.zen.user(toPub).get(`linda_inbox_v13`).get(signalKey).put(
              envelope,
              (ack: any) => {
                if (ack.err && typeof ack.err === "string" && ack.err.includes("Certificate")) {
                  communicationService.clearCertCache(toPub);
                }
              },
              putOptions as any
            );
          }
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
