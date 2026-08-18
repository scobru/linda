import { useEffect, useRef, useState } from "react";
import { DataBase } from 'linda-core';
import { CommunicationService } from 'linda-core';
import { FileTransferService } from 'linda-core';
import { CallingService } from 'linda-core';
import { DECRYPT_FAILED, LEGACY_UNSUPPORTED } from 'linda-core';

export const useSignalingListener = (
  db: DataBase,
  isLoggedIn: boolean,
  userPub: string | null,
  communicationService: CommunicationService | null,
  fileTransferServiceInst: FileTransferService | null,
  callingServiceInst: CallingService | null = null
) => {
  const processedSignalsRef = useRef<Set<string>>(new Set());
  const chainsRef = useRef<any[]>([]);
  const lastRearmRef = useRef(0);
  const [resumeTick, setResumeTick] = useState(0);

  useEffect(() => {
    if (!isLoggedIn || !userPub || !fileTransferServiceInst || !communicationService) return;

    //  - ephemeral push (DAM): modern route, no graph persistence
    //  - legacy user-space: kept so already-deployed clients still reach us
    const legacySoul = `~${userPub}/linda_inbox_v13`;

    const handleSignal = (isLegacy: boolean) => async (data: any, gunKey: string) => {
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
        if (plaintext === LEGACY_UNSUPPORTED || plaintext === DECRYPT_FAILED) return;

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
        } else if (trimmed.startsWith(" Linda:CALL:")) {
          const signal = JSON.parse(trimmed.substring(" Linda:CALL:".length));
          if (signal && callingServiceInst) {
            if (data.sender === userPub) return;
            callingServiceInst.handleIncomingSignal(data.sender, signal);
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
          if (!userPub) return;
          if (isLegacy) db.zen.user(userPub).get("linda_inbox_v13").get(gunKey).put(null as any);
        }, cleanupDelay);
      } catch (e) {
        console.warn(`[Signaling] Failed to process signal on ${gunKey}:`, e);
      }
    };

    console.log(`[Signaling] Starting listeners (push & legacy ${legacySoul})`);
    
    // Modern Ephemeral Push Listener (DAM protocol)
    let offRelay: (() => void) | undefined;
    if (db.zen._?.opt?.mesh?.onRelay) {
      offRelay = db.zen._.opt.mesh.onRelay((payload: any) => {
        handleSignal(false)(payload, "push_" + Date.now() + "_" + Math.random().toString(36).substring(7));
      });
      chainsRef.current.push({ off: offRelay });
    }

    // Legacy Graph Listener
    const legacyChain = db.zen.get(legacySoul);
    chainsRef.current.push(legacyChain);
    legacyChain.map().on(handleSignal(true));
    
    return () => {
      if (offRelay) offRelay();
      legacyChain.off?.();
    };
  }, [isLoggedIn, userPub, db, fileTransferServiceInst, callingServiceInst, communicationService, resumeTick]);

  // Re-arm on resume: a chain whose socket died while backgrounded never emits
  // again, so signalling (calls, file transfer) stayed dead until a reload.
  useEffect(() => {
    const rearm = () => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastRearmRef.current < 10_000) return;
      lastRearmRef.current = now;

      for (const chain of chainsRef.current) {
        try {
          chain.off?.();
        } catch (e) {}
      }
      chainsRef.current = [];
      setResumeTick((t) => t + 1);
    };

    document.addEventListener("visibilitychange", rearm);
    window.addEventListener("online", rearm);
    window.addEventListener("pageshow", rearm);
    return () => {
      document.removeEventListener("visibilitychange", rearm);
      window.removeEventListener("online", rearm);
      window.removeEventListener("pageshow", rearm);
    };
  }, []);

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
