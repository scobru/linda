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
  public onFileReceived: (blob: Blob, name: string, mimeType: string) => void = () => {};

  private currentStatus: TransferStatus = 'idle';

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
    this.gun.get(`signal_v3_files_${this.myPub}`).on((data: any) => {
      if (!data) return;
      Object.keys(data).forEach(async (key) => {
        if (key === '_') return;
        const signal = data[key] as FileSignal;
        if (!signal || typeof signal !== 'object') return;
        if (signal.from === this.myPub) return;
        
        // Robust check for required fields
        if (!signal.type || !signal.from || !signal.timestamp) return;

        if (Date.now() - signal.timestamp > 60000) return;

        switch (signal.type) {
          case 'file_offer':
            if (this.currentStatus === 'idle') {
              this.currentStatus = 'incoming';
              this.onStatusChange('incoming', 0, signal.payload);
            }
            break;
          case 'file_answer':
            if (this.currentStatus === 'offering' && this.pc) {
              await this.pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
            }
            break;
          case 'file_candidate':
            if (this.pc) {
              await this.pc.addIceCandidate(new RTCIceCandidate(signal.payload));
            }
            break;
          case 'file_reject':
            this.cleanup();
            this.onStatusChange('failed', 0, 'Rejected');
            break;
        }
      });
    });
  }

  private async sendSignal(toPub: string, signal: FileSignal) {
    const id = Math.random().toString(36).substring(7);
    this.gun.get(`signal_v3_files_${toPub}`).get(id).put(signal);
  }

  public async offerFile(recipientPub: string, file: File, metaId: string) {
    this.currentStatus = 'offering';
    
    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.dc = this.pc.createDataChannel('fileTransfer', { ordered: true });
    this.dc.binaryType = 'arraybuffer';

    this.dc.onopen = () => this.startSending(file);
    
    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.sendSignal(recipientPub, {
          type: 'file_candidate',
          from: this.myPub,
          payload: e.candidate.toJSON(),
          timestamp: Date.now()
        });
      }
    };

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    this.sendSignal(recipientPub, {
      type: 'file_offer',
      from: this.myPub,
      payload: { sdp: offer, metaId },
      timestamp: Date.now()
    });
  }

  public async acceptFile(senderPub: string, offer: any) {
    this.currentStatus = 'transferring';

    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });
    
    this.pc.ondatachannel = (e) => {
      this.dc = e.channel;
      this.dc.binaryType = 'arraybuffer';
      this.setupReceiver(this.dc);
    };

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.sendSignal(senderPub, {
          type: 'file_candidate',
          from: this.myPub,
          payload: e.candidate.toJSON(),
          timestamp: Date.now()
        });
      }
    };

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer.sdp));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    this.sendSignal(senderPub, {
      type: 'file_answer',
      from: this.myPub,
      payload: answer,
      timestamp: Date.now()
    });
  }

  private async startSending(file: File) {
    if (!this.dc) return;
    this.currentStatus = 'transferring';
    this.onStatusChange('transferring', 0);

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
        this.onStatusChange('transferring', Math.round(((i + 1) / totalChunks) * 100));
      }
    }

    this.currentStatus = 'completed';
    this.onStatusChange('completed', 100);
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
      this.onStatusChange('transferring', receivedBytes);
    };

    dc.onclose = () => {
      if (chunks.length > 0) {
        const blob = new Blob(chunks);
        this.onFileReceived(blob, "received_file", blob.type);
        this.currentStatus = 'completed';
        this.onStatusChange('completed', 100);
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
  }
}
