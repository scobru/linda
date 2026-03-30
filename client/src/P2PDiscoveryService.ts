import Hyperswarm from 'hyperswarm-web';
import { getTopicFromKey } from './utils/holepunch-crypto';

export interface P2PPeerInfo {
  publicKey: string;
  topic: string;
}

export class P2PDiscoveryService {
  private swarm: any;
  private topics: Set<string> = new Set();
  public onConnection: (socket: any, info: any) => void = () => {};

  private iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ];

  constructor(opts: { bootstrap?: string[]; wsProxy?: string[]; webrtcBootstrap?: string[] } = {}) {
    // Only use the most reliable public signaling servers to reduce noise
    const defaultBootstrap = [
      'wss://hyperswarm.mauve.moe/',
      'wss://signal.dat-web.eu/'
    ];

    const swarmOpts = {
      ...opts,
      bootstrap: opts.bootstrap || defaultBootstrap,
      wsProxy: opts.wsProxy || [ 'wss://hyperswarm.mauve.moe/' ],
      webrtcBootstrap: opts.webrtcBootstrap || [
        'wss://hyperswarm.mauve.moe/',
        'wss://signal.dat-web.eu/'
      ]
    };

    this.swarm = new Hyperswarm(swarmOpts);
    this.setupListeners();
  }

  private setupListeners() {
    this.swarm.on('connection', (socket: any, info: any) => {
      console.log('[P2P] New connection from peer:', info.publicKey.toString('hex'));
      this.onConnection(socket, info);
    });
  }

  /**
   * Joins a topic based on a GunDB public key.
   */
  public async joinTopic(pubKey: string) {
    const topic = await getTopicFromKey(pubKey);
    const topicHex = Array.from(topic).map(b => b.toString(16).padStart(2, '0')).join('');
    
    if (this.topics.has(topicHex)) return;

    console.log(`[P2P] Joining topic for user: ${pubKey.slice(0, 8)}... (Hash: ${topicHex.slice(0, 8)})`);
    
    this.swarm.join(topic, {
      server: true,
      client: true
    });
    
    this.topics.add(topicHex);
  }

  /**
   * Leaves a topic.
   */
  public async leaveTopic(pubKey: string) {
    const topic = await getTopicFromKey(pubKey);
    const topicHex = Array.from(topic).map(b => b.toString(16).padStart(2, '0')).join('');
    
    if (!this.topics.has(topicHex)) return;

    this.swarm.leave(topic);
    this.topics.delete(topicHex);
  }

  public destroy() {
    this.swarm.destroy();
  }
}
