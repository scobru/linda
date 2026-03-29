import type { IGunInstance } from 'gun';

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
  
  public onStatusChange: (status: TransferStatus, progress?: number, data?: any) => void = () => {};
  public onFileReceived: (blob: Blob, name: string, mimeType: string, metaId?: string) => void = () => {};

  private currentStatus: TransferStatus = 'idle';
  private currentMetaId: string | null = null;
  private pendingOps = new Set<string>();

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
    const seenSignals = new Set<string>();
    const signalPath = `signal_v3_files_${this.myPub}`;

    this.gun.get(signalPath).map().on((signal: any, key: string) => {
      if (!signal || typeof signal !== 'object') return;
      if (seenSignals.has(key)) return;
      seenSignals.add(key);

      if (signal.from === this.myPub) return;
      
      // Robust check for required fields
      if (!signal.type || !signal.from || !signal.timestamp) return;

      // Be more lenient with timestamps but ignore very old junk (e.g. > 1 hour)
      if (Date.now() - signal.timestamp > 3600000) return;

      switch (signal.type) {
        case 'file_offer':
          // Resolve payload if it was stringified
          let payload = signal.payload;
          if (typeof payload === 'string') {
            try {
              payload = JSON.parse(payload);
            } catch (e) {
              console.warn('[FileTransfer] Failed to parse offer payload:', e);
            }
          }
          
          console.log(`[FileTransfer] Received signal.type=file_offer`, payload);
          // Always notify UI about incoming offers so they are stored in state
          // regardless of current service status
          this.onStatusChange('incoming', 0, payload);
          
          // If we are idle, track this as the most recent possible transfer
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
              // RTCIceCandidate requires sdpMid or sdpMLineIndex. Some browsers produce nulls.
              if (candidatePayload.sdpMid !== null || candidatePayload.sdpMLineIndex !== null) {
                this.pc.addIceCandidate(new RTCIceCandidate(candidatePayload)).catch(e => {
                  console.warn('[FileTransfer] Failed to add ICE candidate:', e);
                });
              } else {
                console.log('[FileTransfer] Skipping candidate with null indices');
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
      if (!this.pc || this.pc.signalingState === 'stable') {
        console.log('[FileTransfer] Skipping handleAnswer: PC is null or already stable');
        return;
      }

      const answer = new RTCSessionDescription(payload);
      if (answer.type && answer.sdp) {
        await this.pc.setRemoteDescription(answer);
      } else {
        console.warn('[FileTransfer] Invalid answer SDP received:', payload);
      }
    } catch (e) {
      console.error('[FileTransfer] Failed to set remote description (answer):', e);
      this.cleanup();
      this.onStatusChange('failed', 0, 'Signaling Error');
    }
  }

  private async sendSignal(toPub: string, signal: FileSignal) {
    let id = Math.random().toString(36).substring(7);
    
    // For offers, we use a predictable key based on metaId 
    // so the recipient can find it even if event was missed initially.
    if (signal.type === 'file_offer' && signal.payload?.metaId) {
       id = `offer_${signal.payload.metaId}`;
    } else if (signal.payload?.metaId) {
       // For other types, include metaId to help with cleanup later
       id = `${signal.type}_${signal.payload.metaId}_${id}`;
    }

    const signalToPut = {
        ...signal,
        payload: typeof signal.payload === 'object' ? JSON.stringify(signal.payload) : signal.payload,
        timestamp: Date.now() // Ensure fresh timestamp for sync
    };

    console.log(`[FileTransfer] Sending ${signal.type} to ${toPub.slice(0, 8)}`, signalToPut);
    this.gun.get(`signal_v3_files_${toPub}`).get(id).put(signalToPut);
  }

  public async offerFile(recipientPub: string, file: File, metaId: string) {
    if (this.pendingOps.has(metaId)) return;
    if (this.pc || this.currentStatus !== 'idle') {
      console.warn('[FileTransfer] Service is busy, cannot offer file');
      return;
    }

    this.pendingOps.add(metaId);
    this.currentStatus = 'offering';
    this.currentMetaId = metaId;
    this.onStatusChange('offering', 0, { metaId });
    
    try {
      const pc = new RTCPeerConnection({ iceServers: this.iceServers });
      this.pc = pc;

      const dc = pc.createDataChannel('fileTransfer', { ordered: true });
      this.dc = dc;
      dc.binaryType = 'arraybuffer';

      dc.onopen = () => this.startSending(file);
      
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
      if (this.pc !== pc) return; // Cleanup happened
      await pc.setLocalDescription(offer);

      const senderPayload = { 
        sdp: { type: offer.type, sdp: offer.sdp }, 
        metaId: metaId 
      };
      
      console.log(`[FileTransfer] Sending file_offer to ${recipientPub.slice(0, 8)}`, senderPayload);
      this.sendSignal(recipientPub, {
        type: 'file_offer',
        from: this.myPub,
        payload: senderPayload,
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
    if (!metaId) {
      console.warn('[FileTransfer] Invalid offer (missing metaId)');
      return;
    }

    if (this.pendingOps.has(metaId)) {
       console.log(`[FileTransfer] Already processing metaId ${metaId}, skipping`);
       return;
    }

    if (this.pc || this.currentStatus !== 'idle') {
      console.warn(`[FileTransfer] Service is busy (current: ${this.currentStatus} / ${this.currentMetaId}), cannot accept ${metaId}. Cleaning up for new one.`);
      this.cleanup();
    }

    this.pendingOps.add(metaId);
    this.currentStatus = 'transferring';
    this.currentMetaId = metaId;
    this.onStatusChange('transferring', 0, { metaId });

    try {
      const pc = new RTCPeerConnection({ iceServers: this.iceServers });
      this.pc = pc;
      
      pc.ondatachannel = (e) => {
        const dc = e.channel;
        this.dc = dc;
        dc.binaryType = 'arraybuffer';
        this.setupReceiver(dc);
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

      if (!offer?.sdp || !offer.sdp.type || !offer.sdp.sdp) {
        throw new Error('Invalid Offer SDP');
      }

      console.log(`[FileTransfer] Accepting file from ${senderPub.slice(0, 8)} for metaId ${metaId}`);
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
    if (!this.dc) return;
    this.currentStatus = 'transferring';
    this.onStatusChange('transferring', 0, { metaId: this.currentMetaId });

    const buffer = await file.arrayBuffer();
    const totalChunks = Math.ceil(buffer.byteLength / CHUNK_SIZE);
    
    for (let i = 0; i < totalChunks; i++) {
      if (!this.dc || this.dc.readyState !== 'open') break;

      // Handle backpressure
      if (this.dc.bufferedAmount > BUFFER_THRESHOLD) {
        await new Promise(r => {
            const check = () => {
                if (!this.dc || this.dc.bufferedAmount < BUFFER_THRESHOLD / 2) r(null);
                else setTimeout(check, 50);
            };
            check();
        });
      }

      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, buffer.byteLength);
      this.dc.send(buffer.slice(start, end));

      if (i % 10 === 0) {
        this.onStatusChange('transferring', Math.round(((i + 1) / totalChunks) * 100), { metaId: this.currentMetaId });
      }
    }

    this.currentStatus = 'completed';
    this.onStatusChange('completed', 100, { metaId: this.currentMetaId });
    setTimeout(() => this.cleanup(), 2000);
  }

  private setupReceiver(dc: RTCDataChannel) {
    const chunks: ArrayBuffer[] = [];
    let receivedBytes = 0;

    dc.onmessage = (e) => {
      const data = e.data as ArrayBuffer;
      chunks.push(data);
      receivedBytes += data.byteLength;
      
      // We don't have total size here in dc message, 
      // but we updated metadata in messaging layer.
      // So UI will track progress based on metadata size.
      this.onStatusChange('transferring', receivedBytes, { metaId: this.currentMetaId });
    };

    dc.onclose = () => {
      if (chunks.length > 0) {
        const blob = new Blob(chunks);
        this.onFileReceived(blob, "received_file", blob.type, this.currentMetaId || undefined);
        this.currentStatus = 'completed';
        this.onStatusChange('completed', 100, { metaId: this.currentMetaId });
      }
      this.cleanup();
    };
  }

  private cleanup() {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.dc = null;
    this.currentStatus = 'idle';
    this.currentMetaId = null;
  }
}
