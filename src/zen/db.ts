import type {
  IZenInstance,
  IZenChain,
  IZenPair,
  AuthCallback,
  AuthResult,
  SignUpResult,
} from './types';
import * as crypto from './crypto';



export class DataBase {
  public zen: IZenInstance;
  private _pair: IZenPair | null = null;
  private _pub: string | null = null;
  public crypto: typeof crypto;

  constructor(zen: IZenInstance) {
    this.zen = zen;
    this.crypto = crypto;
  }

  private getUsernamesNode(): any {
    if (!this.zen) return null;
    return this.zen.get('usernames');
  }

  public get user(): any {
    if (!this._pub || !this.zen) return null;
    
    // Return a shim that mimics a Gun/Zen user node
    // but is actually a regular chain at ~pub/
    const node = this.zen.get(`~${this._pub}`);
    
    // Add compatibility properties
    const shim = Object.create(node);
    Object.defineProperties(shim, {
      is: { get: () => ({ pub: this._pub }) },
      _: { get: () => ({ ...node._, sea: this._pair }) },
      // Proxy put to our DataBase.Put for automatic signing
      put: { value: (data: any, cb?: any, opt?: any) => {
        return this.userPut(node._.soul.split('~').pop() || '', data, cb, opt);
      }}
    });

    return shim;
  }

  public get pair(): IZenPair | null {
    return this._pair;
  }

  private readonly onAuthCallbacks: Array<AuthCallback> = [];

  async initialize(): Promise<void> {
    await this.restoreSession();
  }

  async restoreSession(): Promise<AuthResult> {
    try {
      const storedPair = localStorage.getItem('linda_auth_pair'); // Use standard key
      if (storedPair) {
        const payload = JSON.parse(storedPair);
        const pair = payload.pair || payload;
        if (pair && pair.pub) {
          this._pair = pair;
          this._pub = pair.pub;

          // Native Zen does not use a singleton user().auth() state.
          // Instead, we store the pair locally and pass it as an 'authenticator'
          // in the options of each .put() call.

          // Fetch username (alias)
          const username = await new Promise<string | null>((resolve) => {
             this.zen.get(`~${pair.pub}`).get('alias').once((a: any) => resolve(a || null));
          });

          this.emitAuthEvent();
          return { success: true, userPub: pair.pub, username: username || pair.pub };
        }
      }
    } catch (e) {
      console.warn('[DB] Failed to restore session:', e);
    }
    return { success: false, error: 'No session found' };
  }

  private emitAuthEvent(): void {
    if (this._pub) {
      const userShim = this.user;
      this.onAuthCallbacks.forEach((cb) => cb(userShim as any));
    }
  }

  onAuth(callback: AuthCallback): () => void {
    this.onAuthCallbacks.push(callback);
    if (this._pub) callback(this.user as any);
    return () => {
      const i = this.onAuthCallbacks.indexOf(callback);
      if (i !== -1) this.onAuthCallbacks.splice(i, 1);
    };
  }

  isLoggedIn(): boolean {
    const user = this.user;
    return !!(user && user.is);
  }

  async signUp(username: string, password?: string, pair?: IZenPair | null): Promise<SignUpResult> {
    const normalizedUsername = username.trim().toLowerCase();
    try {
      const userPair = pair || await this.crypto.generatePairFromSeed(password || Math.random().toString(36), this.zen);
      const pub = userPair.pub;

      // Store profile (signed)
      await this.userPut('alias', normalizedUsername);
      
      this._pair = userPair;
      this._pub = pub;
      localStorage.setItem('linda_auth_pair', JSON.stringify({ pair: userPair, username: normalizedUsername }));
      this.emitAuthEvent();

      return { success: true, userPub: pub, username: normalizedUsername, isNewUser: true };
    } catch (error: any) {
      return { success: false, error: `SignUp failed: ${error.message}` };
    }
  }

  async login(username: string, password: string): Promise<AuthResult> {
    const normalizedUsername = username.trim().toLowerCase();
    try {
      const pub = await new Promise<string | null>((resolve) => {
        this.zen.get('usernames').get(normalizedUsername).once((p: any) => resolve(p || null));
      });

      if (!pub) return { success: false, error: 'User not found' };

      const pair = await this.crypto.generatePairFromSeed(password, this.zen);
      if (pair.pub !== pub) return { success: false, error: 'Invalid password' };

      // Native Zen uses explicit authenticator in put options.

      this._pair = pair;
      this._pub = pub;
      localStorage.setItem('linda_auth_pair', JSON.stringify({ pair, username: normalizedUsername }));
      this.emitAuthEvent();

      return { success: true, userPub: pub, username: normalizedUsername };
    } catch (error: any) {
      return { success: false, error: `Login failed: ${error.message}` };
    }
  }

  async loginWithPair(username: string, pair: IZenPair): Promise<AuthResult> {
    try {
      // Native Zen uses explicit authenticator in put options.

      this._pair = pair;
      this._pub = pair.pub;
      localStorage.setItem('linda_auth_pair', JSON.stringify({ pair, username }));
      this.emitAuthEvent();
      return { success: true, userPub: pair.pub, username };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  logout(): void {
    this._pair = null;
    this._pub = null;
    localStorage.removeItem('linda_auth_pair');
  }

  getUserPub(): string | null {
    return this._pub;
  }

  // Basic Zen Wrappers
  private getChain(path: string): any {
    if (!this.zen) return null;

    const parts = path.split('/').filter(p => !!p);
    let chain: any = this.zen;

    if (parts.length > 0 && parts[0].startsWith('~')) {
      const pub = parts[0].substring(1);
      if (pub === this._pub) {
        chain = this.user;
      } else {
        chain = this.zen.get(parts[0]);
      }
      parts.shift();
    }

    for (const p of parts) {
      if (!chain || typeof chain.get !== 'function') return null;
      try {
        chain = chain.get(p);
      } catch (err) {
        console.warn(`[DataBase] Zen get crash at part ${p}:`, err);
        return null;
      }
    }
    return chain;
  }

  Get(path: string): Promise<any> {
    const chain = this.getChain(path);
    if (!chain) return Promise.resolve(null);
    return new Promise((resolve) => {
      chain.once((s: any) => resolve(s));
    });
  }

  Put(path: string, data: any, opt: any = {}): Promise<any> {
    const chain = this.getChain(path);
    if (!chain || typeof chain.put !== 'function') return Promise.reject('Invalid path');
    
    // Inject authenticator if it's a user path and we have a pair
    const isUserPath = path.startsWith('~') || path.includes('/~');
    if (isUserPath && this._pair && !opt.authenticator) {
      opt.authenticator = this._pair;
    }

    return new Promise((resolve) => {
      chain.put(data, (ack: any) => resolve(ack), opt);
    });
  }

  Set(path: string, data: any): Promise<any> {
    return this.Put(path, data);
  }

  userGet(path: string): Promise<any> {
    const user = this.user;
    if (!user) return Promise.reject('Not logged in');
    return new Promise((resolve) => {
      user.get(path).once((s: any) => resolve(s));
    });
  }

  userPut(path: string, data: any, cb?: any, opt: any = {}): Promise<any> {
    if (!this._pub || !this._pair) return Promise.reject('Not logged in');
    
    // Ensure bitwise-stable authenticator injection
    const options = { 
      ...opt, 
      authenticator: opt.authenticator || this._pair 
    };

    const parts = path.split('/').filter(p => !!p);
    let chain = this.zen.get(`~${this._pub}`);
    
    for (const p of parts) {
      chain = chain.get(p);
    }

    return new Promise((resolve) => {
      chain.put(data, (ack: any) => {
        if (cb) cb(ack);
        resolve(ack);
      }, options);
    });
  }

  On(path: string, callback: (data: any) => void): void {
    const chain = this.getChain(path);
    if (chain && typeof chain.on === 'function') {
      chain.on((v: any) => callback(v));
    }
  }

  Off(path: string): void {
    const chain = this.getChain(path);
    if (chain && typeof chain.off === 'function') {
      chain.off();
    }
  }
}
