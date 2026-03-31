import type { IGunInstance } from 'gun';

export type TransferStatus = 'idle' | 'offering' | 'incoming' | 'transferring' | 'completed' | 'failed' | 'offered';

export interface FileSignal {
  type: 'file_offer' | 'file_answer' | 'file_candidate' | 'file_reject' | 'file_bye';
  from: string;
  clientId?: string;
  payload: any;
  timestamp: number;
}

const CHUNK_SIZE = 65536; // 64 KB
const BUFFER_THRESHOLD = 512 * 1024; // 512 KB backpressure

export class FileTransferService {
  private myPub: string;
  private clientId: string;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private remoteCandidates: RTCIceCandidateInit[] = [];
  
  public onStatusChange: (status: TransferStatus, progress?: number, data?: any) => void = () => {};
  public onFileReceived: (blob: Blob, name: string, mimeType: string, metaId?: string) => void = () => {};

  private currentStatus: TransferStatus = 'idle';
  private currentMetaId: string | null = null;
  private timeoutId: any = null;
  private readonly TIMEOUT_MS = 60000; // 60 seconds
  private pendingOps = new Set<string>();

  private iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' }
  ];

  constructor(_gun: IGunInstance, myPub: string) {
    this.myPub = myPub;
    this.clientId = Math.random().toString(36).substring(7);
    console.log(`[FileTransfer] Instance initialized with clientId: ${this.clientId}`);
  }

  /**
   * Returns true if the given metaId was initiated by this specific instance/tab.
   */
  public isMyOwnTransfer(metaId: string): boolean {
    return this.currentMetaId === metaId && (this.currentStatus === 'offering' || this.currentStatus === 'transferring');
  }

  public getClientId(): string {
    return this.clientId;
  }

  private startTimeout() {
    this.clearTimeout();
    this.timeoutId = setTimeout(() => {
      console.warn(`[FileTransfer] Connection timeout for ${this.currentMetaId} in state ${this.currentStatus}`);
      if (this.currentStatus !== 'completed') {
        this.cleanup();
      }
    }, this.TIMEOUT_MS);
  }

  private clearTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  public handleIncomingSignal(from: string, signal: FileSignal) {
    if (!signal || !signal.type) return;
    
    // Ignore signals from self-instance to avoid loopback collisions
    if (signal.clientId === this.clientId) {
      return;
    }
    
    console.log(`[FileTransfer] Received secure signal: ${signal.type} from ${from.substring(0, 8)}... (Remote Client: ${signal.clientId})`);

    switch (signal.type) {
      case 'file_offer':
        const metaId = signal.payload?.metaId || signal.payload?.id;
        console.log(`[FileTransfer] Received offer for metaId: ${metaId}. SDP exists: ${!!(signal.payload?.sdp || signal.payload?.type)}`);
        
        // Ensure metaId is included in the emitted payload so App.tsx can map it
        const sdpPayload = { ...signal.payload, metaId };
        
        this.onStatusChange('incoming', 0, sdpPayload);
        if (this.currentStatus === 'idle') this.currentMetaId = metaId || null;
        break;

      case 'file_answer':
        if ((this.currentStatus === 'offering' || this.currentStatus === 'transferring') && this.pc) {
          const answerMetaId = signal.payload?.metaId || signal.payload?.id;
          console.log(`[FileTransfer] Received answer for metaId: ${answerMetaId}. (Current: ${this.currentMetaId})`);
          this.handleAnswer(signal.payload);
        }
        break;

      case 'file_candidate':
        if (this.pc) {
          const candidatePayload = signal.payload;
          if (candidatePayload.sdpMid !== null || candidatePayload.sdpMLineIndex !== null) {
            if (this.pc.remoteDescription) {
                this.pc.addIceCandidate(new RTCIceCandidate(candidatePayload)).catch(e => console.warn('[FileTransfer] Failed to add candidate:', e));
            } else {
                this.remoteCandidates.push(candidatePayload);
            }
          }
        }
        break;

      case 'file_reject':
      case 'file_bye':
        if (signal.payload?.metaId === this.currentMetaId) {
          this.cleanup();
        }
        break;
    }
  }

  private onSendSignal: (to: string, signal: FileSignal) => void = () => {};

  public setSignalSender(sender: (to: string, signal: FileSignal) => void) {
    this.onSendSignal = sender;
  }

  private async handleAnswer(payload: any) {
    try {
      if (!this.pc || this.pc.signalingState === 'stable') return;
      console.log('[FileTransfer] Setting remote description (answer)...');
      
      let sdpType = payload.type || payload.sdp?.type || 'answer';
      let sdpStr = typeof payload.sdp === 'string' ? payload.sdp : (payload.sdp?.sdp || payload.sdp);
      
      if (!sdpStr || typeof sdpStr !== 'string') throw new Error(`Invalid answer SDP string: ${JSON.stringify(payload)}`);

      await this.pc.setRemoteDescription(new RTCSessionDescription({ type: sdpType, sdp: sdpStr }));
      console.log('[FileTransfer] Remote description set successfully. Draining buffered candidates:', this.remoteCandidates.length);
      
      this.remoteCandidates.forEach(cand => this.pc?.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {}));
      this.remoteCandidates = [];
    } catch (e) {
      console.error('[FileTransfer] Failed to set answer:', e);
      this.cleanup();
    }
  }

  private async sendSignal(toPub: string, signal: FileSignal) {
    console.log(`[FileTransfer] Sending secure signal: ${signal.type} to ${toPub.substring(0, 8)}... (My Client: ${this.clientId})`);
    this.onSendSignal(toPub, { ...signal, clientId: this.clientId });
  }

  public async offerFile(recipientPub: string, file: File, metaId: string) {
    if (this.pendingOps.has(metaId) || (this.currentStatus !== 'idle' && this.currentMetaId !== metaId)) return;
    this.pendingOps.add(metaId);
    this.currentStatus = 'offering';
    this.currentMetaId = metaId;
    this.remoteCandidates = [];
    this.onStatusChange('offering', 0, { metaId });
    this.startTimeout();
    
    try {
      console.log(`[FileTransfer] Offering file to ${recipientPub.substring(0, 8)}... (metaId: ${metaId})`);
      const pc = new RTCPeerConnection({ iceServers: this.iceServers });
      this.pc = pc;

      const dc = pc.createDataChannel('fileTransfer', { ordered: true });
      this.dc = dc;
      dc.binaryType = 'arraybuffer';

      dc.onopen = () => {
        console.log('[FileTransfer] DataChannel OPENED (Initiator/Sender)');
        this.startSending(file);
      };

      dc.onclose = () => {
        console.log('[FileTransfer] DataChannel CLOSED');
        if (this.currentStatus !== 'completed') this.cleanup();
      };
      
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          this.sendSignal(recipientPub, {
            type: 'file_candidate',
            from: this.myPub,
            payload: { ...e.candidate.toJSON(), metaId: metaId },
            timestamp: Date.now()
          });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.sendSignal(recipientPub, {
        type: 'file_offer',
        from: this.myPub,
        payload: { type: offer.type, sdp: offer.sdp, metaId: metaId },
        timestamp: Date.now()
      });
    } catch (e) {
       console.error('[FileTransfer] offerFile error:', e);
       this.cleanup();
    } finally {
       this.pendingOps.delete(metaId);
    }
  }

  public async acceptFile(senderPub: string, offer: any) {
    const metaId = offer?.metaId;
    if (!metaId || this.pendingOps.has(metaId)) return;
    
    if (this.pc || this.currentStatus !== 'idle') {
        console.log(`[FileTransfer] Cleaning up for new accept ${metaId}`);
        this.cleanup();
    }

    this.pendingOps.add(metaId);
    this.currentStatus = 'transferring';
    this.currentMetaId = metaId;
    this.remoteCandidates = [];
    this.onStatusChange('transferring', 0, { metaId });
    this.startTimeout();

    try {
      console.log(`[FileTransfer] Accepting file from ${senderPub.substring(0, 8)}... (metaId: ${metaId})`);
      const pc = new RTCPeerConnection({ iceServers: this.iceServers });
      this.pc = pc;
      
      pc.ondatachannel = (e) => {
        console.log('[FileTransfer] Received DataChannel from sender.');
        const dc = e.channel;
        this.dc = dc;
        dc.binaryType = 'arraybuffer';
        dc.onopen = () => console.log('[FileTransfer] DataChannel OPENED (Receiver/Acceptor)');
        this.setupReceiver(dc);
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          this.sendSignal(senderPub, {
            type: 'file_candidate',
            from: this.myPub,
            payload: { ...e.candidate.toJSON(), metaId: metaId },
            timestamp: Date.now()
          });
        }
      };

      // Extract the actual SDP primitive values
      let sdpType = offer.type || offer.sdp?.type || 'offer';
      let sdpStr = typeof offer.sdp === 'string' ? offer.sdp : (offer.sdp?.sdp || offer.sdp);

      if (!sdpStr || typeof sdpStr !== 'string') {
          throw new Error(`Invalid SDP received for acceptFile: ${JSON.stringify(offer)}`);
      }

      await pc.setRemoteDescription(new RTCSessionDescription({ type: sdpType, sdp: sdpStr }));
      console.log('[FileTransfer] Remote description set successfully. Draining buffered candidates:', this.remoteCandidates.length);
      
      this.remoteCandidates.forEach(cand => this.pc?.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {}));
      this.remoteCandidates = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.sendSignal(senderPub, {
        type: 'file_answer',
        from: this.myPub,
        payload: { type: answer.type, sdp: answer.sdp, metaId: metaId },
        timestamp: Date.now()
      });
    } catch (e) {
      console.error('[FileTransfer] acceptFile error:', e);
      this.cleanup();
    } finally {
       this.pendingOps.delete(metaId);
    }
  }

  private async startSending(file: File) {
    if (!this.dc || this.dc.readyState !== 'open') return;
    this.currentStatus = 'transferring';
    
    const buffer = await file.arrayBuffer();
    const totalSize = buffer.byteLength;
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
    
    console.log(`[FileTransfer] STARTING SEND: ${file.name} (${totalSize} bytes)`);

    for (let i = 0; i < totalChunks; i++) {
      if (this.dc.readyState !== 'open') break;

      // Handle backpressure
      if (this.dc.bufferedAmount > BUFFER_THRESHOLD) {
        await new Promise(r => {
             const check = setInterval(() => {
                 if (!this.dc || this.dc.bufferedAmount < BUFFER_THRESHOLD / 2) {
                     clearInterval(check);
                     r(null);
                 }
             }, 30);
        });
      }

      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalSize);
      const data = buffer.slice(start, end);
      
      // Prefix 0x00 for data
      const packet = new Uint8Array(data.byteLength + 1);
      packet[0] = 0;
      packet.set(new Uint8Array(data), 1);
      
      this.dc.send(packet.buffer);

      if (i % 10 === 0 || i === totalChunks - 1) {
        this.updateProgress(end);
      }
    }

    // Send EOF
    if (this.dc && this.dc.readyState === 'open') {
        console.log('[FileTransfer] Sending EOF packet.');
        const eof = new Uint8Array([1]);
        this.dc.send(eof.buffer);
    }

    this.currentStatus = 'completed';
    console.log('[FileTransfer] Send operation COMPLETED.');
    this.onStatusChange('completed', totalSize, { metaId: this.currentMetaId });
    setTimeout(() => this.cleanup(), 5000);
  }

  private setupReceiver(dc: RTCDataChannel) {
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    dc.onmessage = (e) => {
      if (!(e.data instanceof ArrayBuffer)) return;
      const packet = new Uint8Array(e.data);
      const type = packet[0];

      if (type === 0) { // Data
        const data = packet.slice(1);
        chunks.push(data);
        receivedBytes += data.byteLength;
        this.updateProgress(receivedBytes);
      } else if (type === 1) { // EOF
        console.log(`[FileTransfer] EOF received for ${this.currentMetaId}. Assembling final blob...`);
        
        const blob = new Blob(chunks as any);
        console.log(`[FileTransfer] File assembly complete. Size: ${blob.size} bytes.`);
        
        this.onFileReceived(blob, "received_file", blob.type, this.currentMetaId || undefined);
        this.currentStatus = 'completed';
        this.onStatusChange('completed', receivedBytes, { metaId: this.currentMetaId });
        setTimeout(() => this.cleanup(), 5000);
      }
    };

    dc.onerror = (err) => {
      console.error('[FileTransfer] DataChannel Error:', err);
      this.onStatusChange('failed', 0, { metaId: this.currentMetaId, error: err });
      this.cleanup();
    };
  }

  private updateProgress(val: number) {
    this.startTimeout();
    this.onStatusChange('transferring', val, { metaId: this.currentMetaId });
  }

  private cleanup() {
    this.clearTimeout();
    this.remoteCandidates = [];
    if (this.pc) { 
        console.log('[FileTransfer] Closing PeerConnection');
        this.pc.close(); 
        this.pc = null; 
    }
    this.dc = null;
    this.currentStatus = 'idle';
    this.currentMetaId = null;
    this.onStatusChange('idle', 0);
  }
}

