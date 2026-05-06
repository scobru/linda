import type {
  IZenInstance,
  IZenPair,
  AuthCallback,
  AuthResult,
  SignUpResult,
} from './types.ts';
import * as crypto from './crypto.ts';
import { generateRandomHandle } from '../utils/names.ts';
import { generateSecureRandomString } from '../utils/crypto.ts';



export class DataBase {
  public zen: IZenInstance;
  private _pair: IZenPair | null = null;
  private _pub: string | null = null;
  public crypto: typeof crypto;
  public static readonly DEFAULT_GET_TIMEOUT = 15000;
  public static readonly DEFAULT_PUT_TIMEOUT = 15000;

  /**
   * Cleans a Zen public key by removing the leading tilde if present.
   */
  public static cleanPub(pub: string): string {
    if (!pub) return '';
    return pub.startsWith('~') ? pub.slice(1) : pub;
  }

  constructor(zen: IZenInstance) {
    this.zen = zen;
    this.crypto = crypto;

    // Monkey-patch Zen instance to support .user() calls for legacy compatibility
    // This allows calls like db.zen.user(pub).get(...) to work.
    (this.zen as any).user = (pub?: string) => this.userShim(pub);
  }

  /**
   * Universal User Shim
   * @param pub If provided, returns a public node shim for that user.
   *            If omitted, returns the shim for the currently authenticated user.
   */
  public userShim(pub?: string): any {
    const targetPub = pub || this._pub;
    if (!targetPub || !this.zen) return null;

    const node = this.zen.get(`~${targetPub}`);
    const shim = Object.create(node);

    const isSelf = targetPub === this._pub;

    Object.defineProperties(shim, {
      is: { get: () => ({ pub: targetPub }) },
      _: { get: () => ({ ...node._, sea: isSelf ? this._pair : null }) },
      // Compatibility methods
      auth: { value: () => { console.warn('[DB] skip auth() - Zen uses explicit authenticator'); return shim; } },
      create: { value: () => { console.error('[DB] create() not supported - use signUp()'); } },
      leave: { value: () => this.logout() },
      // Proxy put for self
      put: { value: (data: any, cb?: any, opt?: any) => {
        if (isSelf) {
            return this.userPut(node._.soul.split('~').pop() || '', data, cb, opt);
        }
        return node.put(data, cb, opt);
      }}
    });

    return shim;
  }



  public get user(): any {
    return this.userShim();
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

          // Fetch username (alias) with a short timeout (3s) to avoid blocking startup
          const cachedAlias = localStorage.getItem('linda_alias');
          const username = await this.safeGet(`~${pair.pub}/alias`, 6000);
          const isPub = (s: string | null) => !!(s && s.length >= 30 && !s.includes(" ") && !s.startsWith("@"));
          
          let finalUsername = pair.pub;
          if (!isPub(username)) {
            finalUsername = username || "";
          } else if (!isPub(cachedAlias)) {
            finalUsername = cachedAlias || "";
          }

          if (!finalUsername || isPub(finalUsername)) {
            if (cachedAlias && !isPub(cachedAlias)) finalUsername = cachedAlias;
            else finalUsername = pair.pub;
          }

          if (isPub(finalUsername) && !username && !cachedAlias) {
              console.warn(`[DB] restoreSession: no alias found for ${pair.pub.substring(0,8)} within 6s, and no cache found`);
          }

          this.emitAuthEvent();
          
          // Re-generate deterministic handle if not in sync or lost
          const uniqueName = localStorage.getItem("linda_user_unique_username") || generateRandomHandle(pair.pub);
          localStorage.setItem("linda_user_unique_username", uniqueName);

          return { success: true, userPub: pair.pub, username: finalUsername };
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
      const salt = generateSecureRandomString(16);
      const seed = password ? (normalizedUsername + password) : generateSecureRandomString(32);
      const userPair = pair || await this.crypto.generatePairFromSeed(seed, salt, this.zen);
      const pub = userPair.pub;

      // Set state first so userPut and other operations can use it
      this._pair = userPair;
      this._pub = pub;

      // Store in usernames mapping node for login lookup
      await this.Put(`usernames/${normalizedUsername}`, { pub, salt });

      // Pre-initialize unique username handle (deterministic based on pubkey)
      const uniqueName = generateRandomHandle(pub);
      
      // Store in user profile (signed) and global discovery index
      await this.userPut('profile/uniqueUsername', uniqueName);
      await this.userPut('profile/nickname', normalizedUsername);
      await this.Put(`linda_unique_usernames/${uniqueName}`, pub);

      // Store basic profile alias (fallback)
      await this.userPut('alias', normalizedUsername);
      
      localStorage.setItem('linda_auth_pair', JSON.stringify({ pair: userPair, username: normalizedUsername }));
      localStorage.setItem("linda_user_unique_username", uniqueName);
      this.emitAuthEvent();

      return { success: true, userPub: pub, username: normalizedUsername, uniqueUsername: uniqueName, isNewUser: true };
    } catch (error: any) {
      console.error('[DB] SignUp error:', error);
      return { success: false, error: `SignUp failed: ${error.message || error}` };
    }
  }

  async login(username: string, password: string): Promise<AuthResult> {
    const normalizedUsername = username.trim().toLowerCase();
    console.log(`[DB] Attempting login for: ${normalizedUsername}...`);
    try {
      // Use Get (safeGet) with a generous 10s timeout for initial discovery
      const userData = await this.Get(`usernames/${normalizedUsername}`, 10000);

      if (!userData) {
        console.warn(`[DB] Login failed: User "${normalizedUsername}" not found in index.`);
        return { success: false, error: 'User not found' };
      }

      let pub: string;
      let salt: string | undefined;

      if (typeof userData === 'string') {
        pub = userData;
      } else if (typeof userData === 'object' && userData.pub) {
        pub = userData.pub;
        salt = userData.salt;
      } else {
        console.warn(`[DB] Login failed: Invalid user data for "${normalizedUsername}".`);
        return { success: false, error: 'Invalid user data' };
      }

      // Combine username and password for a unique deterministic seed
      const pair = await this.crypto.generatePairFromSeed(normalizedUsername + password, salt, this.zen);
      if (pair.pub !== pub) return { success: false, error: 'Invalid password' };

      // Native Zen uses explicit authenticator in put options.

      this._pair = pair;
      this._pub = pub;
      localStorage.setItem('linda_auth_pair', JSON.stringify({ pair, username: normalizedUsername }));
      this.emitAuthEvent();

      return { success: true, userPub: pub, username: normalizedUsername };
    } catch (error: any) {
      console.error('[DB] Login error:', error);
      return { success: false, error: `Login failed: ${error.message || error}` };
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
      console.error('[DB] LoginWithPair error:', e);
      return { success: false, error: e.message || e };
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
  /**
   * Safe read with forced timeout to prevent relay-sync hangs
   */
  public async safeGet(pathOrChain: string | any, timeoutMs: number = DataBase.DEFAULT_GET_TIMEOUT, silent: boolean = false): Promise<any> {
    if (!this.zen) return null;
    
    let chain: any;
    if (typeof pathOrChain === 'string') {
        // Handle absolute vs relative paths
        if (pathOrChain.includes('~')) {
            const parts = pathOrChain.split('/');
            chain = this.zen.get(parts[0]);
            for (let i = 1; i < parts.length; i++) {
                chain = chain.get(parts[i]);
            }
        } else {
            chain = this.getChain(pathOrChain);
        }
    } else {
        chain = pathOrChain;
    }

    if (!chain) return null;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const soul = chain._?.soul || 'unknown';
        const pathStr = typeof pathOrChain === 'string' ? pathOrChain : soul;
        if (!silent) console.warn(`[DB] safeGet timeout (${timeoutMs}ms) for path: ${pathStr}`);
        resolve(null);
      }, timeoutMs);

      chain.once((data: any) => {
        clearTimeout(timer);
        resolve(data || null);
      });
    });
  }

  private getChain(path: string): any {
    if (!this.zen) return null;

    const parts = path.split('/').filter(p => !!p);
    let chain: any = this.zen;

    if (parts.length > 0 && parts[0].startsWith('~')) {
      const pub = DataBase.cleanPub(parts[0]);
      if (pub === DataBase.cleanPub(this._pub || '')) {
        chain = this.user;
      } else {
        chain = this.zen.get(`~${pub}`);
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

  Get(path: string, timeoutMs?: number, silent: boolean = false): Promise<any> {
    return this.safeGet(path, timeoutMs, silent);
  }

  private injectAuth(path: string, opt: any): any {
    const isUserPath = path.startsWith('~') || path.includes('/~');
    if (isUserPath && this._pair && !opt.authenticator) {
      return { ...opt, authenticator: this._pair };
    }
    return opt;
  }

  Put(path: string, data: any, opt: any = {}): Promise<any> {
    const chain = this.getChain(path);
    if (!chain || typeof chain.put !== 'function') return Promise.reject('Invalid path');
    
    const finalOpt = this.injectAuth(path, opt);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn(`[DB] Put timeout (${DataBase.DEFAULT_PUT_TIMEOUT}ms) for path: ${path}`);
        resolve({ err: 'timeout' });
      }, DataBase.DEFAULT_PUT_TIMEOUT);
      chain.put(data, (ack: any) => {
        clearTimeout(timeout);
        resolve(ack);
      }, finalOpt);
    });
  }

  Set(path: string, data: any, opt: any = {}): Promise<any> {
    const chain = this.getChain(path);
    if (!chain || typeof chain.set !== 'function') return Promise.reject('Invalid path for Set');
    
    const finalOpt = this.injectAuth(path, opt);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn(`[DB] Set timeout (${DataBase.DEFAULT_PUT_TIMEOUT}ms) for path: ${path}`);
        resolve({ err: 'timeout' });
      }, DataBase.DEFAULT_PUT_TIMEOUT);
      chain.set(data, (ack: any) => {
        clearTimeout(timeout);
        resolve(ack);
      }, finalOpt);
    });
  }

  async userGet(path: string, timeoutMs: number = DataBase.DEFAULT_GET_TIMEOUT): Promise<any> {
    if (!this._pub) return null;
    return this.safeGet(`~${this._pub}/${path}`, timeoutMs);
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
      const timeout = setTimeout(() => {
        console.warn(`[DB] userPut timeout (${DataBase.DEFAULT_PUT_TIMEOUT}ms) for path: ${path}`);
        resolve({ err: 'timeout' });
      }, DataBase.DEFAULT_PUT_TIMEOUT);
      chain.put(data, (ack: any) => {
        clearTimeout(timeout);
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
