import type { IGunInstance } from 'gun';
import SecretStream from '@hyperswarm/secret-stream';
import { DataChannelStream } from './utils/DataChannelStream';
import { seaToHolepunchKeyPair, base64ToUint8 } from './utils/holepunch-crypto';

export type TransferStatus = 'idle' | 'offering' | 'incoming' | 'transferring' | 'completed' | 'failed' | 'offered';

export interface FileSignal {
  type: 'file_offer' | 'file_answer' | 'file_candidate' | 'file_reject' | 'file_bye';
  from: string;
  payload: any;
  timestamp: number;
}

const CHUNK_SIZE = 65536; // 64 KB
const BUFFER_THRESHOLD = 2 * 1024 * 1024; // 2 MB

export class FileTransferService {
  private gun: IGunInstance;
  private myPub: string;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private ss: any = null; // SecretStream instance
  private myPair: { epub: string; epriv: string } | null = null;
  
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
  ];

  constructor(gun: IGunInstance, myPub: string, myPair?: { epub: string; epriv: string }) {
    this.gun = gun;
    this.myPub = myPub;
    this.myPair = myPair || null;
    this.setupIncomingListener();
  }

  private startTimeout() {
    this.clearTimeout();
    this.timeoutId = setTimeout(() => {
      console.warn(`[FileTransfer] Connection timeout for ${this.currentMetaId} in state ${this.currentStatus}`);
      this.cleanup();
    }, this.TIMEOUT_MS);
  }

  private clearTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private setupIncomingListener() {
    const seenSignals = new Set<string>();
    const signalPath = `signal_v3_files_${this.myPub}`;

    this.gun.get(signalPath).map().on((signal: any, key: string) => {
      if (!signal || typeof signal !== 'object') return;
      if (seenSignals.has(key)) return;
      seenSignals.add(key);

      if (signal.from === this.myPub) return;
      
      if (!signal.type || !signal.from || !signal.timestamp) return;

      if (Date.now() - signal.timestamp > 3600000) return;

      switch (signal.type) {
        case 'file_offer':
          let payload = signal.payload;
          if (typeof payload === 'string') {
            try {
              payload = JSON.parse(payload);
            } catch (e) {
              console.warn(`[FileTransfer] Failed to parse payload for signal ${signal.type}:`, e);
            }
          }

          const metaId = payload?.metaId || (typeof payload === 'object' ? payload.id : null);
          console.log(`[FileTransfer] Received signal.type=${signal.type} for metaId=${metaId}`, payload);
          
          this.onStatusChange('incoming', 0, payload);
          
          if (this.currentStatus === 'idle') {
            this.currentMetaId = payload?.metaId || null;
          }
          break;

        case 'file_answer':
          if (this.currentStatus === 'offering' && this.pc && signal.payload) {
            let answerPayload = signal.payload;
             if (typeof answerPayload === 'string') {
                try {
                    answerPayload = JSON.parse(answerPayload);
                } catch (e) {
                    console.warn('[FileTransfer] Failed to parse answer payload:', e);
                }
             }
            this.handleAnswer(answerPayload);
          }
          break;

        case 'file_candidate':
          if (this.pc && signal.payload) {
            let candidatePayload = signal.payload;
            if (typeof candidatePayload === 'string') {
                try {
                    candidatePayload = JSON.parse(candidatePayload);
                } catch (e) {
                    console.warn('[FileTransfer] Failed to parse candidate payload:', e);
                }
            }

            try {
              if (candidatePayload.sdpMid !== null || candidatePayload.sdpMLineIndex !== null) {
                this.pc.addIceCandidate(new RTCIceCandidate(candidatePayload)).catch(e => {
                  console.warn('[FileTransfer] Failed to add ICE candidate:', e);
                });
              }
            } catch (e) {
              console.warn('[FileTransfer] Error constructing RTCIceCandidate:', e);
            }
          }
          break;

        case 'file_reject':
          if (signal.payload?.metaId === this.currentMetaId) {
            this.cleanup();
            this.onStatusChange('failed', 0, 'Rejected');
          }
          break;

        case 'file_bye':
            if (signal.payload?.metaId === this.currentMetaId) {
                this.cleanup();
            }
            break;
      }
    });
  }

  private async handleAnswer(payload: any) {
    try {
      if (!this.pc || this.pc.signalingState === 'stable') return;
      const answer = new RTCSessionDescription(payload);
      if (answer.type && answer.sdp) {
        await this.pc.setRemoteDescription(answer);
      }
    } catch (e) {
      console.error('[FileTransfer] Failed to set remote description (answer):', e);
      this.cleanup();
      this.onStatusChange('failed', 0, 'Signaling Error');
    }
  }

  private async sendSignal(toPub: string, signal: FileSignal) {
    let id = Math.random().toString(36).substring(7);
    
    if (signal.type === 'file_offer' && signal.payload?.metaId) {
       id = `offer_${signal.payload.metaId}`;
    } else if (signal.payload?.metaId) {
       id = `${signal.type}_${signal.payload.metaId}_${id}`;
    }

    const signalToPut = {
        ...signal,
        payload: typeof signal.payload === 'object' ? JSON.stringify(signal.payload) : signal.payload,
        timestamp: Date.now()
    };

    this.gun.get(`signal_v3_files_${toPub}`).get(id).put(signalToPut);
  }

  public async offerFile(recipientPub: string, file: File, metaId: string) {
    if (this.pendingOps.has(metaId)) return;
    if (this.pc || this.currentStatus !== 'idle') return;

    this.pendingOps.add(metaId);
    this.currentStatus = 'offering';
    this.currentMetaId = metaId;
    this.onStatusChange('offering', 0, { metaId });
    this.startTimeout();
    
    try {
      const pc = new RTCPeerConnection({ iceServers: this.iceServers });
      this.pc = pc;

      const dc = pc.createDataChannel('fileTransfer', { ordered: true });
      this.dc = dc;
      dc.binaryType = 'arraybuffer';

      dc.onopen = () => {
        if (!this.myPair) {
          this.cleanup();
          return;
        }
        
        const dcs = new DataChannelStream(this.dc!);
        this.ss = new SecretStream(true, dcs, {
          keyPair: seaToHolepunchKeyPair(this.myPair)
        });
        
        this.ss.on('open', () => {
          console.log('[FileTransfer] SecretStream handshake successful.');
          this.startSending(file);
        });
        
        this.ss.on('error', (err: any) => {
          console.error('[FileTransfer] SecretStream Error:', err);
          // Log key details for debugging (DO NOT log private keys in production!)
          console.debug('[FileTransfer] KeyPair check:', {
            hasPair: !!this.myPair,
            pubLen: this.myPair ? base64ToUint8(this.myPair.epub).length : 0
          });
          this.cleanup();
        });
      };
      
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          this.sendSignal(recipientPub, {
            type: 'file_candidate',
            from: this.myPub,
            payload: e.candidate.toJSON(),
            timestamp: Date.now()
          });
        }
      };

      const offer = await pc.createOffer();
      if (this.pc !== pc) return;
      await pc.setLocalDescription(offer);

      this.sendSignal(recipientPub, {
        type: 'file_offer',
        from: this.myPub,
        payload: { sdp: { type: offer.type, sdp: offer.sdp }, metaId: metaId },
        timestamp: Date.now()
      });
    } catch (e) {
       console.error('[FileTransfer] offerFile failed:', e);
       this.cleanup();
       this.onStatusChange('failed', 0, 'Offer Error');
    } finally {
       this.pendingOps.delete(metaId);
    }
  }

  public async acceptFile(senderPub: string, offer: any) {
    const metaId = offer?.metaId;
    if (!metaId) return;

    if (this.pendingOps.has(metaId)) return;
    if (this.pc || this.currentStatus !== 'idle') this.cleanup();

    this.pendingOps.add(metaId);
    this.currentStatus = 'transferring';
    this.currentMetaId = metaId;
    this.onStatusChange('transferring', 0, { metaId });
    this.startTimeout();

    try {
      const pc = new RTCPeerConnection({ iceServers: this.iceServers });
      this.pc = pc;
      
      pc.ondatachannel = (e) => {
        const dc = e.channel;
        this.dc = dc;
        dc.binaryType = 'arraybuffer';
        
        dc.onopen = () => {
          if (!this.myPair) {
            this.cleanup();
            return;
          }
          
          const dcs = new DataChannelStream(this.dc!);
          this.ss = new SecretStream(false, dcs, {
            keyPair: seaToHolepunchKeyPair(this.myPair)
          });
          
          this.ss.on('open', () => {
            console.log('[FileTransfer] SecretStream handshake successful.');
            this.setupReceiver(this.ss);
          });

          this.ss.on('error', (err: any) => {
             console.error('[FileTransfer] SecretStream Error:', err);
             // Log key details for debugging (DO NOT log private keys in production!)
             console.debug('[FileTransfer] KeyPair check:', {
                hasPair: !!this.myPair,
                pubLen: this.myPair ? base64ToUint8(this.myPair.epub).length : 0
             });
             this.cleanup();
          });
        };
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          this.sendSignal(senderPub, {
            type: 'file_candidate',
            from: this.myPub,
            payload: e.candidate.toJSON(),
            timestamp: Date.now()
          });
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer.sdp));
      if (this.pc !== pc) return;
      const answer = await pc.createAnswer();
      if (this.pc !== pc) return;
      await pc.setLocalDescription(answer);

      this.sendSignal(senderPub, {
        type: 'file_answer',
        from: this.myPub,
        payload: { type: answer.type, sdp: answer.sdp },
        timestamp: Date.now()
      });
    } catch (e) {
      console.error('[FileTransfer] acceptFile failed:', e);
      this.cleanup();
      this.onStatusChange('failed', 0, 'Connection Error');
    } finally {
       this.pendingOps.delete(metaId);
    }
  }

  private async startSending(file: File) {
    if (!this.ss || !this.dc) return;
    this.currentStatus = 'transferring';
    this.onStatusChange('transferring', 0, { metaId: this.currentMetaId });

    const buffer = await file.arrayBuffer();
    const totalChunks = Math.ceil(buffer.byteLength / CHUNK_SIZE);
    
    for (let i = 0; i < totalChunks; i++) {
      if (!this.ss || this.dc?.readyState !== 'open') break;

      if (this.ss.writableBufferedAmount > BUFFER_THRESHOLD) {
        await new Promise(r => {
             this.ss.once('drain', () => r(null));
             setTimeout(() => r(null), 100); 
        });
      }

      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, buffer.byteLength);
      this.ss.write(Buffer.from(buffer.slice(start, end)));

      if (i % 10 === 0) {
        this.updateProgress(Math.round(((i + 1) / totalChunks) * 100));
      }
    }

    this.currentStatus = 'completed';
    this.onStatusChange('completed', 100, { metaId: this.currentMetaId });
    setTimeout(() => this.cleanup(), 2000);
  }

  private updateProgress(bytesSent: number) {
    this.startTimeout();
    this.onStatusChange('transferring', bytesSent, { metaId: this.currentMetaId });
  }

  private setupReceiver(ss: any) {
    const chunks: any[] = [];
    let receivedBytes = 0;

    ss.on('data', (data: Buffer) => {
      chunks.push(new Uint8Array(data));
      receivedBytes += data.byteLength;
      this.updateProgress(receivedBytes);
    });

    ss.on('end', () => {
      if (chunks.length > 0) {
        const blob = new Blob(chunks);
        this.onFileReceived(blob, "received_file", blob.type, this.currentMetaId || undefined);
        this.currentStatus = 'completed';
        this.onStatusChange('completed', 100, { metaId: this.currentMetaId });
      }
      this.cleanup();
    });
  }

  private cleanup() {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    if (this.ss) {
      this.ss.destroy();
      this.ss = null;
    }
    this.clearTimeout();
    this.dc = null;
    this.currentStatus = 'idle';
    this.currentMetaId = null;
    this.onStatusChange('idle', 0);
  }
}
