import { useEffect, useRef } from "react";
import { DataBase } from 'linda-core';
import { CommunicationService } from 'linda-core';
import { FileTransferService } from 'linda-core';

export const useSignalingListener = (
  db: DataBase,
  isLoggedIn: boolean,
  userPub: string | null,
  communicationService: CommunicationService | null,
  fileTransferServiceInst: FileTransferService | null
) => {
  const processedSignalsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isLoggedIn || !userPub || !fileTransferServiceInst || !communicationService) return;

    const inboxSoul = `~${userPub}/linda_inbox_v13`;
    console.log(`[Signaling] Starting listener on ${inboxSoul}`);

    db.zen.get(inboxSoul).map().on(async (data: any, gunKey: string) => {
      if (!data || typeof data !== "object" || processedSignalsRef.current.has(gunKey)) return;
      if (!data.sender || !data.body || data.type === undefined) return;

      processedSignalsRef.current.add(gunKey);

      try {
        await Promise.race([
          communicationService.waitReady(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("CommunicationService timeout")), 5000))
        ]);

        const plaintext = await communicationService.decryptMessage(data.sender, {
          type: data.type,
          body: data.body,
        });
        if (!plaintext || typeof plaintext !== "string") return;

        const trimmed = plaintext.trim();
        if (trimmed === "PING_HEAL") {
          communicationService.republishBundle().catch(() => {});
          return;
        }

        if (trimmed.startsWith(" Linda:SIGNAL:")) {
          const signal = JSON.parse(trimmed.substring(" Linda:SIGNAL:".length));
          if (signal) {
            const isSameInstance = signal.clientId === fileTransferServiceInst.getClientId();
            if (data.sender === userPub && isSameInstance) return;
            fileTransferServiceInst.handleIncomingSignal(data.sender, signal);
          }
        } else if (trimmed.startsWith("{")) {
          try {
            const signal = JSON.parse(trimmed);
            if (signal) {
              fileTransferServiceInst.handleIncomingSignal(data.sender, signal);
            }
          } catch (e) {}
        }

        const cleanupDelay = trimmed.startsWith(" Linda:SIGNAL:") ? 60000 : 20000;
        setTimeout(() => {
          if (userPub) db.zen.user(userPub).get("linda_inbox_v13").get(gunKey).put(null as any);
        }, cleanupDelay);
      } catch (e) {
        console.warn(`[Signaling] Failed to process signal on ${gunKey}:`, e);
      }
    });
  }, [isLoggedIn, userPub, db, fileTransferServiceInst, communicationService]);

  // Sync Kick
  useEffect(() => {
    if (!isLoggedIn || !userPub) return;
    const kickInterval = setInterval(() => {
      console.log("[Signaling] Sync Kick: Poking inbox...");
      db.Put(`~${userPub}/linda_inbox_v13/_poke`, Date.now().toString());
    }, 120000);
    return () => clearInterval(kickInterval);
  }, [isLoggedIn, userPub, db]);
};
