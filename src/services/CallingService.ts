import { generateSecureRandomString } from "../utils/crypto";
export type CallStatus = 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';

export interface CallSignal {
  id: string; // Unique ID per signal to prevent de-duplication of distinct packets (like ICE candidates)
  type: 'offer' | 'answer' | 'candidate' | 'reject' | 'bye' | 'ringing';
  from: string;
  payload: any;
  timestamp: number;
}

export class CallingService {
  private myPub: string;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;

  public onStatusChange: (status: CallStatus, data?: any) => void = () => {};
  public onRemoteStream: (stream: MediaStream) => void = () => {};
  public onStats: (stats: any) => void = () => {};

  private currentStatus: CallStatus = 'idle';
  private currentRecipient: string | null = null;

  private iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    {
      urls: 'turn:global.relay.metered.ca:80',
      username: 'e7e4e09073e0810e4a5a6a66',
      credential: 'kMYL/EfiJ0GIGHWI'
    },
    {
      urls: 'turn:global.relay.metered.ca:80?transport=tcp',
      username: 'e7e4e09073e0810e4a5a6a66',
      credential: 'kMYL/EfiJ0GIGHWI'
    },
    {
      urls: 'turn:global.relay.metered.ca:443',
      username: 'e7e4e09073e0810e4a5a6a66',
      credential: 'kMYL/EfiJ0GIGHWI'
    },
    {
      urls: 'turns:global.relay.metered.ca:443?transport=tcp',
      username: 'e7e4e09073e0810e4a5a6a66',
      credential: 'kMYL/EfiJ0GIGHWI'
    }
  ];

  private iceCandidateQueue: RTCIceCandidateInit[] = [];
  private seenSignals = new Set<string>();
  private hasAttemptedIceRestart = false;

  constructor(myPub: string) {
    this.myPub = myPub;
  }

  public async triggerIceRestart() {
    if (!this.peerConnection || !this.currentRecipient) return;
    try {
      console.log(`[CallingService] Triggering ICE restart for ${this.currentRecipient}...`);
      this.hasAttemptedIceRestart = true;
      const offer = await this.peerConnection.createOffer({ iceRestart: true });
      await this.peerConnection.setLocalDescription(offer);

      const video = this.localStream?.getVideoTracks().length ? this.localStream.getVideoTracks().length > 0 : false;
      this.sendSignal(this.currentRecipient, {
        id: generateSecureRandomString(10),
        type: 'offer',
        from: this.myPub,
        payload: { sdp: { type: offer.type, sdp: offer.sdp }, video },
        timestamp: Date.now()
      });
    } catch (e) {
      console.error("[CallingService] ICE restart signaling failed:", e);
    }
  }

  public async handleIceRestartOffer(from: string, payload: any) {
    if (!this.peerConnection || this.currentStatus !== 'connected') return;
    try {
      console.log(`[CallingService] Handling ICE restart offer from ${from.substring(0, 8)}`);
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.sendSignal(from, {
        id: generateSecureRandomString(10),
        type: 'answer',
        from: this.myPub,
        payload: { type: answer.type, sdp: answer.sdp },
        timestamp: Date.now()
      });
      // process ICE queue just in case new candidates arrived
      this.processIceQueue();
    } catch (e) {
      console.error('[CallingService] handleIceRestartOffer error:', e);
    }
  }

  private onSendSignal: (to: string, signal: CallSignal) => void = () => {};

  public setSignalSender(sender: (to: string, signal: CallSignal) => void) {
    this.onSendSignal = sender;
  }

  public async handleIncomingSignal(from: string, signal: CallSignal) {
    if (!signal || typeof signal !== 'object') return;
    
    // De-duplicate signals using unique ID
    const signalId = signal.id || `${signal.type}_${signal.timestamp}_${from}`;
    if (this.seenSignals.has(signalId)) {
        return;
    }
    this.seenSignals.add(signalId);

    if (from === this.myPub) return;
    
    console.log("[CallingService] Received Signal via Inbox:", signal.type, "from", from.slice(0,8));

    let payload = signal.payload;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch(e) {}
    }

    switch (signal.type) {
      case 'offer':
        if (this.currentStatus === 'idle') {
          this.currentStatus = 'incoming';
          this.currentRecipient = from;
          this.onStatusChange('incoming', { from, signal: payload });
          this.sendSignal(from, { 
            id: generateSecureRandomString(10),
            type: 'ringing', 
            from: this.myPub, 
            payload: null, 
            timestamp: Date.now() 
          });
        } else if (this.currentStatus === 'connected' && this.currentRecipient === from) {
          // It's an ICE restart
          this.handleIceRestartOffer(from, payload);
        } else {
          this.sendSignal(from, { 
            id: generateSecureRandomString(10),
            type: 'reject', 
            from: this.myPub, 
            payload: 'busy', 
            timestamp: Date.now() 
          });
        }
        break;
      case 'ringing':
        if (this.currentStatus === 'calling') {
           console.log("[CallingService] Remote is ringing...");
        }
        break;
      case 'answer':
        if ((this.currentStatus === 'calling' || this.currentStatus === 'connected') && this.peerConnection) {
          try {
            if (this.peerConnection.signalingState !== 'stable') {
              await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload));
              if (this.currentStatus !== 'connected') {
                this.currentStatus = 'connected';
                this.onStatusChange('connected');
                this.startStatsLoop();
                this.applyBitrateConstraints();
              }
              this.processIceQueue();
            }
          } catch (e) {
            console.error("[CallingService] Error setting remote description (answer):", e);
          }
        }
        break;
      case 'candidate':
        if (this.peerConnection && this.peerConnection.remoteDescription) {
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(payload));
          } catch (e) {
            console.warn("[CallingService] Error adding ICE candidate:", e);
          }
        } else {
          this.iceCandidateQueue.push(payload);
        }
        break;
      case 'reject':
        this.endCall(false);
        this.onStatusChange('ended', { reason: payload || 'Rejected' });
        break;
      case 'bye':
        this.endCall(false);
        this.onStatusChange('ended', { reason: 'Hung up' });
        break;
    }
  }

  private processIceQueue() {
    if (!this.peerConnection) return;
    while (this.iceCandidateQueue.length > 0) {
      const candidate = this.iceCandidateQueue.shift();
      if (candidate) {
        this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => {
           console.warn("[CallingService] Error processing queued ICE candidate:", e);
        });
      }
    }
  }

  private async sendSignal(toPub: string, signal: CallSignal) {
    this.onSendSignal(toPub, signal);
  }

  public async initiateCall(recipientPub: string, video: boolean = false) {
    if (this.currentStatus !== 'idle') return;
    
    this.currentStatus = 'calling';
    this.currentRecipient = recipientPub;
    this.onStatusChange('calling');

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: video 
      });
      const pc = new RTCPeerConnection({ 
        iceServers: this.iceServers,
        bundlePolicy: 'max-bundle',
        iceCandidatePoolSize: 10
      });
      this.peerConnection = pc;
      
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });

      pc.ontrack = (event) => {
        console.log(`[CallingService] Remote track received: ${event.track.kind}`);
        if (event.streams && event.streams[0]) {
            this.remoteStream = event.streams[0];
        } else {
            if (!this.remoteStream) this.remoteStream = new MediaStream();
            this.remoteStream.addTrack(event.track);
        }
        this.onRemoteStream(this.remoteStream);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignal(recipientPub, {
            id: generateSecureRandomString(10),
            type: 'candidate',
            from: this.myPub,
            payload: event.candidate.toJSON(),
            timestamp: Date.now()
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`[CallingService] ICE state: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
           if (!this.hasAttemptedIceRestart && this.currentStatus === 'connected') {
              console.warn(`[CallingService] ICE ${pc.iceConnectionState}, attempting restart...`);
              this.triggerIceRestart();
           } else if (pc.iceConnectionState === 'failed') {
              console.error("[CallingService] ICE connection failed after restart.");
           }
        } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
           this.hasAttemptedIceRestart = false;
        }
      };

      pc.onicegatheringstatechange = () => {
        console.log(`[CallingService] ICE gathering state: ${pc.iceGatheringState}`);
      };

      pc.onsignalingstatechange = () => {
        console.log(`[CallingService] Signaling state: ${pc.signalingState}`);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.sendSignal(recipientPub, {
        id: generateSecureRandomString(10),
        type: 'offer',
        from: this.myPub,
        payload: { sdp: { type: offer.type, sdp: offer.sdp }, video },
        timestamp: Date.now()
      });

    } catch (err) {
      console.error("Failed to initiate call:", err);
      this.endCall();
    }
  }

  public async acceptCall(offerPayload: any) {
    if (this.currentStatus !== 'incoming' || !this.currentRecipient) return;

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: !!offerPayload.video 
      });
      const pc = new RTCPeerConnection({ 
        iceServers: this.iceServers,
        bundlePolicy: 'max-bundle',
        iceCandidatePoolSize: 10
      });
      this.peerConnection = pc;

      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });

      pc.ontrack = (event) => {
        console.log(`[CallingService] Remote track received (accept): ${event.track.kind}`);
        if (event.streams && event.streams[0]) {
            this.remoteStream = event.streams[0];
        } else {
            if (!this.remoteStream) this.remoteStream = new MediaStream();
            this.remoteStream.addTrack(event.track);
        }
        this.onRemoteStream(this.remoteStream);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && this.currentRecipient) {
          this.sendSignal(this.currentRecipient, {
            id: generateSecureRandomString(10),
            type: 'candidate',
            from: this.myPub,
            payload: event.candidate.toJSON(),
            timestamp: Date.now()
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`[CallingService] ICE state (accept): ${pc.iceConnectionState}`);
      };

      pc.onicegatheringstatechange = () => {
        console.log(`[CallingService] ICE gathering state: ${pc.iceGatheringState}`);
      };

      pc.onsignalingstatechange = () => {
        console.log(`[CallingService] Signaling state: ${pc.signalingState}`);
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offerPayload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.sendSignal(this.currentRecipient, {
        id: generateSecureRandomString(10),
        type: 'answer',
        from: this.myPub,
        payload: { type: answer.type, sdp: answer.sdp },
        timestamp: Date.now()
      });

      this.currentStatus = 'connected';
      this.onStatusChange('connected');
      this.processIceQueue();
      this.startStatsLoop();
      this.applyBitrateConstraints();

    } catch (err) {
      console.error("Failed to accept call:", err);
      this.endCall();
    }
  }

  public rejectCall() {
    if (this.currentRecipient) {
      this.sendSignal(this.currentRecipient, {
        id: generateSecureRandomString(10),
        type: 'reject',
        from: this.myPub,
        payload: 'declined',
        timestamp: Date.now()
      });
    }
    this.endCall();
  }

  public endCall(sendBye: boolean = true) {
    if (sendBye && this.currentRecipient) {
      this.sendSignal(this.currentRecipient, {
        id: generateSecureRandomString(10),
        type: 'bye',
        from: this.myPub,
        payload: null,
        timestamp: Date.now()
      });
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;
    this.currentStatus = 'idle';
    this.currentRecipient = null;
    this.iceCandidateQueue = [];
    this.hasAttemptedIceRestart = false;
    
    // Clear seen signals after a delay to allow final signaling to settle
    setTimeout(() => this.seenSignals.clear(), 10000);

    this.onStatusChange('idle');
  }

  public getLocalStream() { return this.localStream; }
  public getRemoteStream() { return this.remoteStream; }

  private async startStatsLoop() {
    const pc = this.peerConnection;
    if (!pc) return;

    const interval = setInterval(async () => {
      if (this.peerConnection !== pc || pc.signalingState === 'closed') {
        clearInterval(interval);
        return;
      }

      try {
        const stats = await pc.getStats();
        let activeCandidatePair: any;
        stats.forEach(report => {
          if (report.type === 'transport') {
            activeCandidatePair = stats.get(report.selectedCandidatePairId);
          }
        });
        
        if (activeCandidatePair) {
            this.onStats({
                availableOutgoingBitrate: activeCandidatePair.availableOutgoingBitrate,
                currentRoundTripTime: activeCandidatePair.currentRoundTripTime,
                bytesReceived: activeCandidatePair.bytesReceived,
                bytesSent: activeCandidatePair.bytesSent
            });
        }
      } catch (e) {
        console.warn("[CallingService] Stats error:", e);
      }
    }, 2000);
  }

  private async applyBitrateConstraints() {
    if (!this.peerConnection) return;
    
    // Limit video bitrate to 1.5Mbps for mobile stability
    const senders = this.peerConnection.getSenders();
    for (const sender of senders) {
      if (sender.track && sender.track.kind === 'video') {
        const parameters = sender.getParameters();
        if (!parameters.encodings) {
          parameters.encodings = [{}];
        }
        parameters.encodings[0].maxBitrate = 1500000; // 1.5 Mbps
        try {
          await sender.setParameters(parameters);
          console.log("[CallingService] Applied 1.5Mbps video bitrate limit");
        } catch (e) {
          console.warn("[CallingService] Failed to set bitrate parameters:", e);
        }
      }
    }
  }
}
