/**
 * Zen Type Definitions
 */

export interface IZenPair {
  pub: string;
  priv: string;
  epub: string;
  epriv: string;
}

export interface IZenInstance {
  get(key: string): IZenChain;
  user(pub?: string): IZenUserInstance;
  on(event: string, callback: (ack: any) => void): void;
  opt(options: any): IZenInstance;
  [key: string]: any;
}

export interface IZenUserInstance extends IZenChain {
  is?: { pub: string; alias?: string; [key: string]: any };
  _?: { sea?: IZenPair; [key: string]: any };
  [key: string]: any;
}

export interface IZenChain {
  get(key: string): IZenChain;
  put(data: any, callback?: (ack: any) => void, opt?: any): IZenChain;
  once(callback: (data: any, key: string) => void): IZenChain;
  on(callback: (data: any, key: string) => void, opt?: any): IZenChain;
  map(): IZenChain;
  set(data: any, callback?: (ack: any) => void): IZenChain;
  [key: string]: any;
}

export type AuthCallback = (user: IZenUserInstance) => void;

export interface AuthResult {
  success: boolean;
  userPub?: string;
  username?: string;
  error?: string;
}

export interface SignUpResult extends AuthResult {
  isNewUser?: boolean;
}

export type Ack = {
  err?: any;
  ok?: any;
  [key: string]: any;
};
