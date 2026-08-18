import { useMemo, useRef, useState } from "react";
import { DataBase } from "linda-core";
import { CallingService, type CallStatus } from "linda-core";
import { CommunicationService } from "linda-core";

export const useCalling = (
  db: DataBase,
  isLoggedIn: boolean,
  userPub: string | null,
  communicationService: CommunicationService | null,
) => {
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [callPeer, setCallPeer] = useState<string | null>(null);
  const [callVideo, setCallVideo] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const pendingOfferRef = useRef<any>(null);

  const callingServiceInst = useMemo(() => {
    if (!isLoggedIn || !userPub) return null;
    const service = new CallingService(userPub);

    service.onStatusChange = (status, data) => {
      setCallStatus(status);
      if (status === "incoming") {
        setCallPeer(data?.from || null);
        pendingOfferRef.current = data?.signal || null;
        setCallVideo(!!data?.signal?.video);
      }
      if (status === "calling" || status === "connected") {
        setLocalStream(service.getLocalStream());
      }
      if (status === "idle") {
        setCallPeer(null);
        pendingOfferRef.current = null;
        setLocalStream(null);
        setRemoteStream(null);
        setIsScreenSharing(false);
      }
    };
    service.onRemoteStream = (stream) => setRemoteStream(stream);
    service.onScreenShareChange = (active) => setIsScreenSharing(active);

    return service;
  }, [isLoggedIn, userPub]);

  // Signal transport mirrors useFileTransfer's sendUnifiedSignal: ephemeral
  // push first, best-effort cert-gated inbox write as the durable fallback.
  useMemo(() => {
    if (!callingServiceInst || !communicationService || !userPub) return;

    const sendCallSignal = async (toPub: string, signal: any) => {
      try {
        const payload = " Linda:CALL:" + JSON.stringify(signal);
        const cipher = await communicationService.encryptMessage(
          toPub,
          payload,
        );
        const envelope = {
          sender: userPub,
          type: cipher.type,
          body: cipher.body,
          timestamp: new Date().toISOString(),
        } as any;

        db.zen.push(toPub, envelope);

        const cert = communicationService.getCachedInboxCertificate(toPub);
        if (cert || toPub === userPub) {
          const signalKey = `${userPub.substring(0, 8)}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          const putOptions = toPub === userPub ? {} : { opt: { cert } };
          db.zen
            .user(toPub)
            .get("linda_inbox_v13")
            .get(signalKey)
            .put(
              envelope,
              (ack: any) => {
                if (
                  ack.err &&
                  typeof ack.err === "string" &&
                  ack.err.includes("Certificate")
                ) {
                  communicationService.clearCertCache(toPub);
                }
              },
              putOptions as any,
            );
        }
      } catch (e: any) {
        console.warn("[Calling] Failed to send signal:", e.message);
      }
    };

    callingServiceInst.setSignalSender(sendCallSignal);
  }, [callingServiceInst, communicationService, db, userPub]);

  const startCall = (peerPub: string, video: boolean) => {
    setCallPeer(peerPub);
    setCallVideo(video);
    callingServiceInst?.initiateCall(peerPub, video);
  };

  const acceptCall = () => {
    if (pendingOfferRef.current) {
      callingServiceInst?.acceptCall(pendingOfferRef.current);
    }
  };

  const rejectCall = () => callingServiceInst?.rejectCall();
  const endCall = () => callingServiceInst?.endCall();

  const toggleScreenShare = () => {
    if (isScreenSharing) {
      callingServiceInst?.stopScreenShare();
    } else {
      callingServiceInst
        ?.startScreenShare()
        .catch((e) => console.warn("[Calling] Screen share failed:", e));
    }
  };

  return {
    callingServiceInst,
    callStatus,
    callPeer,
    callVideo,
    localStream,
    remoteStream,
    isScreenSharing,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleScreenShare,
  };
};
