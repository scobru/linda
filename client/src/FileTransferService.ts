import type { IGunInstance } from 'gun';

export type TransferStatus = 'idle' | 'offering' | 'incoming' | 'signaling' | 'transferring' | 'completed' | 'failed' | 'offered';

export interface FileSignal {
  type: 'file_offer' | 'file_answer' | 'file_candidate' | 'file_reject' | 'file_bye';
  from: string;
  clientId?: string;
  payload: any;
  timestamp: number;
}

const CHUNK_SIZE = 16384; // 16 KB - optimized for mobile/Safari
const BUFFER_THRESHOLD = 256 * 1024; // 256 KB backpressure - tighter for mobile

export class FileTransferService {
  private myPub: string;
  private clientId: string;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private remoteCandidates: RTCIceCandidateInit[] = [];
  
  public onStatusChange: (status: TransferStatus, progress?: number, data?: any) => void = () => {};
  public onFileReceived: (blob: Blob, name: string, mimeType: string, metaId?: string) => void = () => {};
  public onStats: (stats: { bitrate: number; bufferedAmount: number }) => void = () => {};

  private currentStatus: TransferStatus = 'idle';
  private currentMetaId: string | null = null;
  private timeoutId: any = null;
  private readonly TIMEOUT_MS = 120000; // 120 seconds
  private pendingOps = new Set<string>();
  private processedCandidates = new Set<string>();

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
  private hasAttemptedIceRestart = false;

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
        this.cleanup('timeout');
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

        // Clean up any stale transfer before accepting a new one
        if (this.currentStatus !== 'idle' && this.currentMetaId && this.currentMetaId !== metaId) {
          console.log(`[FileTransfer] Cleaning up stale transfer ${this.currentMetaId} to accept new offer ${metaId}`);
          this.cleanup('new_offer_overlap');
        }

        // Ensure metaId is included in the emitted payload so App.tsx can map it
        const sdpPayload = { ...signal.payload, metaId };

        this.currentMetaId = metaId || null;
        this.onStatusChange('incoming', 0, sdpPayload);
        break;

      case 'file_answer':
        if ((this.currentStatus === 'offering' || this.currentStatus === 'transferring') && this.pc) {
          const answerMetaId = signal.payload?.metaId || signal.payload?.id;
          console.log(`[FileTransfer] Received answer for metaId: ${answerMetaId}. (Current: ${this.currentMetaId})`);

          if (this.currentStatus === 'offering') {
            this.currentStatus = 'signaling';
            this.onStatusChange('signaling', 0, { metaId: this.currentMetaId });
          }

          this.handleAnswer(signal.payload);
        }
        break;

      case 'file_candidate':
        const candidatePayload = signal.payload;
        const candMetaId = candidatePayload?.metaId;

        // Only process candidates if they match our current metaId or if we don't have one yet (start buffering)
        if (candMetaId && this.currentMetaId && candMetaId !== this.currentMetaId) {
          console.log(`[FileTransfer] Ignoring candidate for different metaId: ${candMetaId} (Current: ${this.currentMetaId})`);
          return;
        }

        // De-duplicate candidates using their serialized JSON representation
        const candString = JSON.stringify(candidatePayload);
        if (this.processedCandidates.has(candString)) return;
        this.processedCandidates.add(candString);

        if (this.pc) {
          // Relaxed check: allow null/empty sdpMid/sdpMLineIndex for end-of-candidates
          const isEndOfCandidates = !candidatePayload.candidate || candidatePayload.candidate === "";

          // Some browsers/networks might send candidates with missing metadata
          // We add them if it's an end-of-candidates OR if it has at least one identifier
          const isValidCandidate = isEndOfCandidates || 
                                 (candidatePayload.sdpMid !== null && candidatePayload.sdpMid !== undefined) || 
                                 (candidatePayload.sdpMLineIndex !== null && candidatePayload.sdpMLineIndex !== undefined);

          if (isValidCandidate) {
            if (this.pc.remoteDescription) {
                this.pc.addIceCandidate(new RTCIceCandidate(candidatePayload)).catch(e => {
                  console.warn('[FileTransfer] Failed to add candidate:', e.message);
                });
            } else {
                console.log('[FileTransfer] Buffering remote candidate (remoteDescription not set yet)');
                this.remoteCandidates.push(candidatePayload);
            }
          } else {
            console.warn('[FileTransfer] Ignoring potentially malformed candidate:', candidatePayload);
          }
        } else {
          // Buffer candidate even if PC is not yet created (arrived before acceptFile/offerFile)
          console.log(`[FileTransfer] Buffering remote candidate for future PC (metaId: ${candMetaId})`);
          this.remoteCandidates.push(candidatePayload);
        }
        break;

      case 'file_reject':
      case 'file_bye':
        if (signal.payload?.metaId === this.currentMetaId) {
          this.cleanup('remote_bye');
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

      this.remoteCandidates.forEach(cand => this.pc?.addIceCandidate(new RTCIceCandidate(cand)).catch((err) => {
        console.warn('[FileTransfer] Failed to add buffered candidate after answer:', err);
      }));
      this.remoteCandidates = [];
    } catch (e) {
      console.error('[FileTransfer] Failed to set answer:', e);
      this.cleanup('answer_error');
    }
  }

  private async sendSignal(toPub: string, signal: FileSignal) {
    console.log(`[FileTransfer] Sending secure signal: ${signal.type} to ${toPub.substring(0, 8)}... (My Client: ${this.clientId})`);
    this.onSendSignal(toPub, { ...signal, clientId: this.clientId });
  }

  public async offerFile(recipientPub: string, file: File, metaId: string) {
    if (this.pendingOps.has(metaId) || (this.currentStatus !== 'idle' && this.currentMetaId !== metaId)) return;
    this.pendingOps.add(metaId);

    // Only clear candidates and state if this is a brand new metaId
    if (this.currentMetaId !== metaId) {
      this.remoteCandidates = [];
      this.processedCandidates.clear();
    }

    this.currentStatus = 'offering';
    this.currentMetaId = metaId;
    this.onStatusChange('offering', 0, { metaId });
    // Trigger local preview for sender
    this.onFileReceived(file, file.name, file.type, metaId);
    this.startTimeout();

    try {
      console.log(`[FileTransfer] Offering file to ${recipientPub.substring(0, 8)}... (metaId: ${metaId})`);
      const pc = new RTCPeerConnection({ 
        iceServers: this.iceServers,
        bundlePolicy: 'max-bundle', // Critical for mobile NAT traversal
        iceCandidatePoolSize: 10
      });
      this.pc = pc;

      // Monitor ICE connection state for failure detection
      pc.oniceconnectionstatechange = () => {
        console.log(`[FileTransfer] ICE state (offer): ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'failed') {
          if (!this.hasAttemptedIceRestart && this.currentStatus !== 'completed') {
            console.warn(`[FileTransfer] ICE failed for ${metaId}, attempting ICE restart...`);
            this.hasAttemptedIceRestart = true;
            pc.restartIce();
          } else if (this.currentStatus !== 'completed') {
            console.error(`[FileTransfer] ICE connection failed after restart for ${metaId}`);
            this.onStatusChange('failed', 0, { metaId: this.currentMetaId, error: `ICE failed` });
            this.cleanup('ice_failure');
          }
        } else if (pc.iceConnectionState === 'disconnected') {
          console.warn(`[FileTransfer] ICE disconnected for ${metaId}, waiting for recovery...`);
          // Give mobile browsers time to recover from brief disconnections
          setTimeout(() => {
            if (this.pc === pc && pc.iceConnectionState === 'disconnected' && this.currentStatus !== 'completed') {
              if (!this.hasAttemptedIceRestart) {
                console.warn(`[FileTransfer] ICE disconnected timeout for ${metaId}, trying restart...`);
                this.hasAttemptedIceRestart = true;
                pc.restartIce();
              } else {
                console.error(`[FileTransfer] ICE disconnected timeout for ${metaId}`);
                this.onStatusChange('failed', 0, { metaId: this.currentMetaId, error: `ICE disconnected` });
                this.cleanup('ice_failure');
              }
            }
          }, 3000);
        } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          this.hasAttemptedIceRestart = false;
        }
      };

      pc.onicegatheringstatechange = () => {
        console.log(`[FileTransfer] ICE gathering state: ${pc.iceGatheringState}`);
      };

      pc.onsignalingstatechange = () => {
        console.log(`[FileTransfer] Signaling state: ${pc.signalingState}`);
      };

      const dc = pc.createDataChannel('fileTransfer', { ordered: true });
      this.dc = dc;
      dc.binaryType = 'arraybuffer';

      dc.onopen = () => {
        console.log('[FileTransfer] DataChannel OPENED (Initiator/Sender)');
        this.currentStatus = 'transferring';
        this.onStatusChange('transferring', 0, { metaId: this.currentMetaId });
        this.startSending(file);
      };

      dc.onclose = () => {
        console.log('[FileTransfer] DataChannel CLOSED');
        if (this.currentStatus !== 'completed') this.cleanup('dc_close');
      };

      dc.onerror = (err) => {
        console.error('[FileTransfer] DataChannel Error (sender):', err);
        this.onStatusChange('failed', 0, { metaId: this.currentMetaId, error: err });
        this.cleanup('dc_error');
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
       this.cleanup('offer_crash');
    } finally {
       this.pendingOps.delete(metaId);
    }
  }

  public async acceptFile(senderPub: string, offer: any) {
    const metaId = offer?.metaId;
    if (!metaId || this.pendingOps.has(metaId)) return;

    if (this.pc || (this.currentStatus !== 'idle' && this.currentStatus !== 'incoming')) {
        console.log(`[FileTransfer] Cleaning up for new accept ${metaId}. Current status: ${this.currentStatus}`);
        this.cleanup('pre_accept_cleanup');
    }

    this.pendingOps.add(metaId);

    // Only clear candidates if this is a brand new metaId
    if (this.currentMetaId !== metaId) {
      this.remoteCandidates = [];
      this.processedCandidates.clear();
    }

    this.currentStatus = 'signaling';
    this.currentMetaId = metaId;
    this.onStatusChange('signaling', 0, { metaId });
    this.startTimeout();

    try {
      console.log(`[FileTransfer] Accepting file from ${senderPub.substring(0, 8)}... (metaId: ${metaId})`);
      console.log(`[FileTransfer] Offer payload keys: ${Object.keys(offer).join(', ')}`);
      const pc = new RTCPeerConnection({ 
        iceServers: this.iceServers,
        bundlePolicy: 'max-bundle', // Critical for mobile NAT traversal
        iceCandidatePoolSize: 10
      });
      this.pc = pc;

      // Monitor ICE connection state for failure detection
      pc.oniceconnectionstatechange = () => {
        console.log(`[FileTransfer] ICE state (accept): ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'failed') {
          if (!this.hasAttemptedIceRestart && this.currentStatus !== 'completed') {
            console.warn(`[FileTransfer] ICE failed (accept) for ${metaId}, attempting ICE restart...`);
            this.hasAttemptedIceRestart = true;
            pc.restartIce();
          } else if (this.currentStatus !== 'completed') {
            console.error(`[FileTransfer] ICE connection failed after restart (accept) for ${metaId}`);
            this.onStatusChange('failed', 0, { metaId: this.currentMetaId, error: `ICE failed` });
            this.cleanup('ice_failure_accept');
          }
        } else if (pc.iceConnectionState === 'disconnected') {
          console.warn(`[FileTransfer] ICE disconnected (accept) for ${metaId}, waiting for recovery...`);
          setTimeout(() => {
            if (this.pc === pc && pc.iceConnectionState === 'disconnected' && this.currentStatus !== 'completed') {
              this.onStatusChange('failed', 0, { metaId: this.currentMetaId, error: `ICE disconnected` });
              this.cleanup('ice_failure_accept');
            }
          }, 5000);
        } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          this.hasAttemptedIceRestart = false;
        }
      };

      pc.onicegatheringstatechange = () => {
        console.log(`[FileTransfer] ICE gathering state: ${pc.iceGatheringState}`);
      };

      pc.onsignalingstatechange = () => {
        console.log(`[FileTransfer] Signaling state: ${pc.signalingState}`);
      };

      pc.ondatachannel = (e) => {
        console.log('[FileTransfer] Received DataChannel from sender.');
        const dc = e.channel;
        this.dc = dc;
        dc.binaryType = 'arraybuffer';
        dc.onopen = () => {
            console.log('[FileTransfer] DataChannel OPENED (Receiver/Acceptor)');
            this.currentStatus = 'transferring';
            this.onStatusChange('transferring', 0, { metaId: this.currentMetaId });
        };
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

      // Robust SDP extraction: handle multiple formats
      // Format A: { type: 'offer', sdp: 'v=0...', metaId: '...' } (direct from signal)
      // Format B: { sdp: { type: 'offer', sdp: 'v=0...' }, metaId: '...' } (old wrapped)
      // Format C: { sdp: 'v=0...', type: 'offer', metaId: '...' } (mixed)
      let sdpType: RTCSdpType;
      let sdpStr: string;

      if (typeof offer.sdp === 'object' && offer.sdp !== null && typeof offer.sdp.sdp === 'string') {
        // Format B: SDP is wrapped in an object
        sdpType = offer.sdp.type || offer.type || 'offer';
        sdpStr = offer.sdp.sdp;
        console.log('[FileTransfer] SDP extracted from nested object (Format B)');
      } else if (typeof offer.sdp === 'string' && offer.sdp.startsWith('v=')) {
        // Format A/C: SDP is a raw string
        sdpType = offer.type || 'offer';
        sdpStr = offer.sdp;
        console.log('[FileTransfer] SDP extracted as raw string (Format A/C)');
      } else {
        // Last resort: try to find SDP anywhere in the offer
        const allValues = Object.values(offer).filter(v => typeof v === 'string' && (v as string).startsWith('v='));
        if (allValues.length > 0) {
          sdpStr = allValues[0] as string;
          sdpType = offer.type || 'offer';
          console.log('[FileTransfer] SDP found via deep scan');
        } else {
          throw new Error(`Invalid SDP received for acceptFile. Keys: ${Object.keys(offer).join(', ')}, sdp type: ${typeof offer.sdp}`);
        }
      }

      console.log(`[FileTransfer] Setting remote description: type=${sdpType}, sdp length=${sdpStr.length}`);
      await pc.setRemoteDescription(new RTCSessionDescription({ type: sdpType, sdp: sdpStr }));
      console.log('[FileTransfer] Remote description set successfully. Draining buffered candidates:', this.remoteCandidates.length);

      this.remoteCandidates.forEach(cand => this.pc?.addIceCandidate(new RTCIceCandidate(cand)).catch((err) => {
         console.warn('[FileTransfer] Failed to add buffered candidate after accept:', err);
      }));
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
      this.cleanup('accept_crash');
    } finally {
       this.pendingOps.delete(metaId);
    }
  }

  private async startSending(file: File) {
    if (!this.dc || this.dc.readyState !== 'open') return;
    this.currentStatus = 'transferring';

    const totalSize = file.size;
    let offset = 0;
    
    console.log(`[FileTransfer] STARTING SEND: ${file.name} (${totalSize} bytes)`);

    const reader = new FileReader();
    let lastStatsTime = Date.now();
    let lastStatsBytes = 0;

    const readNextChunk = () => {
      if (!this.dc || this.dc.readyState !== 'open') return;
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      reader.readAsArrayBuffer(slice);
    };

    reader.onload = async (e) => {
      const result = e.target?.result;
      if (!(result instanceof ArrayBuffer)) return;

      // Handle backpressure
      if (this.dc && this.dc.bufferedAmount > BUFFER_THRESHOLD) {
        await new Promise(r => {
          const check = setInterval(() => {
            if (!this.dc || this.dc.bufferedAmount < BUFFER_THRESHOLD / 2) {
              clearInterval(check);
              r(null);
            }
          }, 30);
        });
      }

      if (!this.dc || this.dc.readyState !== 'open') return;

      // Prefix 0x00 for data
      const packet = new Uint8Array(result.byteLength + 1);
      packet[0] = 0;
      packet.set(new Uint8Array(result), 1);
      
      // Proper slicing for iOS/Safari compatibility
      this.dc.send(packet.buffer.slice(packet.byteOffset, packet.byteOffset + packet.byteLength));
      
      offset += result.byteLength;
      
      // Update stats and progress periodically
      const now = Date.now();
      if (now - lastStatsTime > 1000) {
        const bytesSent = offset - lastStatsBytes;
        const bitrate = (bytesSent * 8) / ((now - lastStatsTime) / 1000); // bits per sec
        this.onStats({ bitrate, bufferedAmount: this.dc.bufferedAmount });
        lastStatsTime = now;
        lastStatsBytes = offset;
        this.updateProgress(offset);
      } else if (offset === totalSize) {
        this.updateProgress(offset);
      }

      if (offset < totalSize) {
        // Yield to browser and then read next chunk
        setTimeout(readNextChunk, 0); 
      } else {
        // Send EOF
        console.log('[FileTransfer] Sending EOF packet.');
        const eof = new Uint8Array([1]);
        this.dc.send(eof.buffer.slice(eof.byteOffset, eof.byteOffset + eof.byteLength));

        this.currentStatus = 'completed';
        console.log('[FileTransfer] Send operation COMPLETED.');
        this.onStatusChange('completed', totalSize, { metaId: this.currentMetaId });
        setTimeout(() => this.cleanup('success_sender'), 5000);
      }
    };

    reader.onerror = (err) => {
      console.error('[FileTransfer] FileReader Error:', err);
      this.cleanup('filereader_error');
    };

    readNextChunk();
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
        setTimeout(() => this.cleanup('success_receiver'), 5000);
      }
    };

    dc.onerror = (err) => {
      console.error('[FileTransfer] DataChannel Error:', err);
      this.onStatusChange('failed', 0, { metaId: this.currentMetaId, error: err });
      this.cleanup('dc_error_receiver');
    };
  }

  private updateProgress(val: number) {
    this.startTimeout();
    this.onStatusChange('transferring', val, { metaId: this.currentMetaId });
  }

  private cleanup(source: string) {
    console.log(`[FileTransfer] Cleanup triggered from source: ${source}`);
    this.clearTimeout();
    this.remoteCandidates = [];
    this.processedCandidates.clear();
    this.hasAttemptedIceRestart = false;
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

