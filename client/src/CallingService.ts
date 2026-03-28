import type { IGunInstance } from 'gun';

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

  constructor(gun: IGunInstance, myPub: string) {
    this.gun = gun;
    this.myPub = myPub;
    this.setupIncomingListener();
  }

  private setupIncomingListener() {
    this.gun.get(`signal_v3_calls_${this.myPub}`).on((data: any) => {
      if (!data) return;
      
      Object.keys(data).forEach(async (key) => {
        if (key === '_') return;
        const signal = data[key] as CallSignal;
        if (!signal || typeof signal !== 'object') return;
        if (signal.from === this.myPub) return;
        
        // Robust check for required fields
        if (!signal.type || !signal.from || !signal.timestamp) return;
        
        // Ignore old signals (older than 30s)
        if (Date.now() - signal.timestamp > 30000) return;

        console.log("Received Call Signal:", signal.type, "from", signal.from);

        switch (signal.type) {
          case 'offer':
            if (this.currentStatus === 'idle') {
              this.currentStatus = 'incoming';
              this.currentRecipient = signal.from;
              this.onStatusChange('incoming', { from: signal.from, signal: signal.payload });
              this.sendSignal(signal.from, { type: 'ringing', from: this.myPub, payload: null, timestamp: Date.now() });
            } else {
              this.sendSignal(signal.from, { type: 'reject', from: this.myPub, payload: 'busy', timestamp: Date.now() });
            }
            break;
          case 'answer':
            if (this.currentStatus === 'calling' && this.peerConnection) {
              await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.payload));
              this.currentStatus = 'connected';
              this.onStatusChange('connected');
            }
            break;
          case 'candidate':
            if (this.peerConnection) {
              await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.payload));
            }
            break;
          case 'reject':
            this.endCall(false);
            this.onStatusChange('ended', { reason: signal.payload || 'Rejected' });
            break;
          case 'bye':
            this.endCall(false);
            this.onStatusChange('ended', { reason: 'Hung up' });
            break;
        }
      });
    });
  }

  private async sendSignal(toPub: string, signal: CallSignal) {
    // Generate a unique key for the signal to avoid collision
    const signalId = Math.random().toString(36).substring(7);
    this.gun.get(`signal_v3_calls_${toPub}`).get(signalId).put(signal);
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

      this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });
      
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      this.peerConnection.ontrack = (event) => {
        this.remoteStream = event.streams[0];
        this.onRemoteStream(this.remoteStream);
      };

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignal(recipientPub, {
            type: 'candidate',
            from: this.myPub,
            payload: event.candidate.toJSON(),
            timestamp: Date.now()
          });
        }
      };

      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      this.sendSignal(recipientPub, {
        type: 'offer',
        from: this.myPub,
        payload: { sdp: offer, video },
        timestamp: Date.now()
      });

    } catch (err) {
      console.error("Failed to initiate call:", err);
      this.endCall();
    }
  }

  public async acceptCall(offerSdp: any) {
    if (this.currentStatus !== 'incoming' || !this.currentRecipient) return;

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: offerSdp.video 
      });

      this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });

      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      this.peerConnection.ontrack = (event) => {
        this.remoteStream = event.streams[0];
        this.onRemoteStream(this.remoteStream);
      };

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.currentRecipient) {
          this.sendSignal(this.currentRecipient, {
            type: 'candidate',
            from: this.myPub,
            payload: event.candidate.toJSON(),
            timestamp: Date.now()
          });
        }
      };

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offerSdp.sdp));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.sendSignal(this.currentRecipient, {
        type: 'answer',
        from: this.myPub,
        payload: answer,
        timestamp: Date.now()
      });

      this.currentStatus = 'connected';
      this.onStatusChange('connected');

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
    this.onStatusChange('idle');
  }

  public getLocalStream() { return this.localStream; }
  public getRemoteStream() { return this.remoteStream; }
}
