import { gun, user, DAPP_NAME, SEA } from "../useGun";
import { sha256 } from 'js-sha256';
import { WalletManager } from '@scobru/shogun';

// Funzione di utilità per convertire ArrayBuffer in stringa base64
const bufferToBase64 = (buffer) => {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

// Funzione di utilità per convertire stringa base64 in ArrayBuffer
const base64ToBuffer = (base64) => {
  const base64Url = base64
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = '='.repeat((4 - base64Url.length % 4) % 4);
  const base64Padded = base64Url + padding;
  
  const binary = atob(base64Padded);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer.buffer;
};

// Challenge statica per generare sempre le stesse credenziali
const STATIC_CHALLENGE = new TextEncoder().encode('shogun_static_challenge');

class WebAuthnManager {
  constructor() {
    this.walletManager = new WalletManager();
  }

  // Verifica se WebAuthn è supportato
  isSupported() {
    return this.walletManager.isWebAuthnSupported();
  }

  // Crea un account con WebAuthn
  async generateCredentials(username) {
    try {
      if (!this.isSupported()) {
        throw new Error('WebAuthn non è supportato su questo browser');
      }

      const result = await this.walletManager.createAccountWithWebAuthn(username);
      
      if (!result.success) {
        throw new Error(result.error || 'Errore durante la creazione dell\'account WebAuthn');
      }

      // Salva le informazioni necessarie in Gun
      await gun.get(DAPP_NAME)
        .get("webauthn-credentials")
        .get(username)
        .put({
          credentialId: result.credentialId,
          timestamp: Date.now(),
          epub: result.encryptionKeys.epub,
          pub: result.encryptionKeys.pub
        });

      return result;
    } catch (error) {
      console.error('Errore creazione account WebAuthn:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Login con WebAuthn
  async login(username) {
    try {
      const result = await this.walletManager.loginWithWebAuthn(username);
      
      if (!result.success) {
        throw new Error(result.error || 'Errore durante il login WebAuthn');
      }

      return result;
    } catch (error) {
      console.error('Errore login WebAuthn:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Recupera il credentialId da Gun
  async getCredentialId(username) {
    return new Promise((resolve) => {
      gun.get(DAPP_NAME)
        .get("webauthn-credentials")
        .get(username)
        .once((data) => {
          resolve(data?.credentialId || null);
        });
    });
  }
}

// Esporta un'istanza statica per l'uso diretto
export const webAuthnService = new WebAuthnManager();

// Esporta anche la classe per chi vuole creare una propria istanza con un WalletManager
export { WebAuthnManager }; 