import type { IGunInstance } from 'gun';
import { generateSecureRandomString } from './utils/crypto.ts';

export type CallStatus = 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';

export interface CallSignal {
  type: 'offer' | 'answer' | 'candidate' | 'reject' | 'bye' | 'ringing';
  from: string;
  payload: any;
  timestamp: number;
}

export class CallingService {
  private gun: IGunInstance;
  private myPub: string;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;

  public onStatusChange: (status: CallStatus, data?: any) => void = () => {};
  public onRemoteStream: (stream: MediaStream) => void = () => {};

  private currentStatus: CallStatus = 'idle';
  private currentRecipient: string | null = null;

  private iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  private iceCandidateQueue: RTCIceCandidateInit[] = [];
  private seenSignals = new Set<string>();

  constructor(gun: IGunInstance, myPub: string) {
    this.gun = gun;
    this.myPub = myPub;
    this.setupIncomingListener();
  }

  private setupIncomingListener() {
    const signalPath = `signal_v3_calls_${this.myPub}`;
    
    this.gun.get(signalPath).map().on(async (signal: any, key: string) => {
      if (!signal || typeof signal !== 'object') return;
      if (this.seenSignals.has(key)) return;
      this.seenSignals.add(key);

      if (signal.from === this.myPub) return;
      
      // Robust check for required fields
      if (!signal.type || !signal.from || !signal.timestamp) return;
      
      // Ignore old signals (older than 60s)
      if (Date.now() - signal.timestamp > 60000) return;

      console.log("[CallingService] Received Signal:", signal.type, "from", signal.from.slice(0,8));

      let payload = signal.payload;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch(e) {}
      }

      switch (signal.type) {
        case 'offer':
          if (this.currentStatus === 'idle') {
            this.currentStatus = 'incoming';
            this.currentRecipient = signal.from;
            this.onStatusChange('incoming', { from: signal.from, signal: payload });
            this.sendSignal(signal.from, { type: 'ringing', from: this.myPub, payload: null, timestamp: Date.now() });
          } else {
            this.sendSignal(signal.from, { type: 'reject', from: this.myPub, payload: 'busy', timestamp: Date.now() });
          }
          break;
        case 'ringing':
          if (this.currentStatus === 'calling') {
             console.log("[CallingService] Remote is ringing...");
          }
          break;
        case 'answer':
          if (this.currentStatus === 'calling' && this.peerConnection) {
            try {
              if (this.peerConnection.signalingState !== 'stable') {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload));
                this.currentStatus = 'connected';
                this.onStatusChange('connected');
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
    });
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
    const signalId = generateSecureRandomString(7);
    const signalToPut = {
      ...signal,
      payload: typeof signal.payload === 'object' ? JSON.stringify(signal.payload) : signal.payload,
      timestamp: Date.now()
    };
    this.gun.get(`signal_v3_calls_${toPub}`).get(signalId).put(signalToPut);
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

      const pc = new RTCPeerConnection({ iceServers: this.iceServers });
      this.peerConnection = pc;
      
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });

      pc.ontrack = (event) => {
        this.remoteStream = event.streams[0];
        this.onRemoteStream(this.remoteStream);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignal(recipientPub, {
            type: 'candidate',
            from: this.myPub,
            payload: event.candidate.toJSON(),
            timestamp: Date.now()
          });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.sendSignal(recipientPub, {
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

      const pc = new RTCPeerConnection({ iceServers: this.iceServers });
      this.peerConnection = pc;

      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });

      pc.ontrack = (event) => {
        this.remoteStream = event.streams[0];
        this.onRemoteStream(this.remoteStream);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && this.currentRecipient) {
          this.sendSignal(this.currentRecipient, {
            type: 'candidate',
            from: this.myPub,
            payload: event.candidate.toJSON(),
            timestamp: Date.now()
          });
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offerPayload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.sendSignal(this.currentRecipient, {
        type: 'answer',
        from: this.myPub,
        payload: { type: answer.type, sdp: answer.sdp },
        timestamp: Date.now()
      });

      this.currentStatus = 'connected';
      this.onStatusChange('connected');
      this.processIceQueue();

    } catch (err) {
      console.error("Failed to accept call:", err);
      this.endCall();
    }
  }

  public rejectCall() {
    if (this.currentRecipient) {
      this.sendSignal(this.currentRecipient, {
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
    
    // Clear seen signals after a delay to allow final signaling to settle
    setTimeout(() => this.seenSignals.clear(), 10000);

    this.onStatusChange('idle');
  }

  public getLocalStream() { return this.localStream; }
  public getRemoteStream() { return this.remoteStream; }
}
