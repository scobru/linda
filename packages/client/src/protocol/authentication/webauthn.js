import { gun, user, DAPP_NAME } from "../useGun";
import { sha256 } from 'js-sha256';

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
  constructor(walletManager = null) {
    this.walletManager = walletManager;
  }

  // Verifica se WebAuthn è supportato
  isSupported() {
    return window.PublicKeyCredential !== undefined &&
           typeof window.PublicKeyCredential === 'function';
  }

  // Crea un account con WebAuthn
  async generateCredentials(username) {
    try {
      if (!this.isSupported()) {
        throw new Error('WebAuthn non è supportato su questo browser');
      }

      // Verifica se l'username è già registrato
      const existingCredential = await this.getCredentialId(username);
      if (existingCredential) {
        throw new Error('Username già registrato');
      }

      // Opzioni per la creazione della credenziale
      const createCredentialOptions = {
        challenge: STATIC_CHALLENGE,
        rp: {
          name: "Shogun Wallet",
          id: window.location.hostname
        },
        user: {
          id: new TextEncoder().encode(username),
          name: username,
          displayName: username
        },
        pubKeyCredParams: [
          {
            type: "public-key",
            alg: -7 // ES256
          }
        ],
        timeout: 60000,
        attestation: "none",
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          requireResidentKey: false
        }
      };

      // Crea la credenziale
      const credential = await navigator.credentials.create({
        publicKey: createCredentialOptions
      });

      // Genera password deterministica
      const credentialId = bufferToBase64(credential.rawId);
      const password = sha256(username + credentialId);

      // Salva il credentialId
      localStorage.setItem("webauthn_credential_id", credentialId);
      localStorage.setItem("webauthn_username", username);
      
      // Salva in Gun
      await gun.get(DAPP_NAME)
        .get("webauthn-credentials")
        .get(username)
        .put({
          credentialId,
          timestamp: Date.now()
        });

      // Se abbiamo un WalletManager, crea l'account
      if (this.walletManager) {
        await this.walletManager.createAccount(username, password);
      }

      return {
        success: true,
        username,
        password,
        credentialId
      };
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
      // Recupera il credentialId
      const credentialId = await this.getCredentialId(username);
      if (!credentialId) {
        throw new Error("Nessuna credenziale WebAuthn trovata per questo username");
      }

      // Opzioni per la verifica
      const assertionOptions = {
        challenge: STATIC_CHALLENGE,
        allowCredentials: [{
          id: base64ToBuffer(credentialId),
          type: 'public-key',
          transports: ['internal', 'platform']
        }],
        timeout: 60000,
        userVerification: "required"
      };

      // Verifica la credenziale
      const assertion = await navigator.credentials.get({
        publicKey: assertionOptions
      });

      if (!assertion) {
        throw new Error('Verifica WebAuthn fallita');
      }

      // Genera la stessa password usata durante la registrazione
      const password = sha256(username + credentialId);

      // Se abbiamo un WalletManager, effettua il login
      let pubKey = null;
      if (this.walletManager) {
        pubKey = await this.walletManager.login(username, password);
      }

      return {
        success: true,
        username,
        password,
        credentialId,
        pubKey
      };
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