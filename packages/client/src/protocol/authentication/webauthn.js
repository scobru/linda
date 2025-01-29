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

// Funzione per generare un buffer di 32 byte
const generateChallenge = () => {
  // Usa l'username come seed per generare sempre la stessa challenge
  return new TextEncoder().encode('static_challenge_for_linda_messenger');
};

// Challenge costante per generare sempre le stesse credenziali per un utente
const STATIC_CHALLENGE = generateChallenge();

export const webAuthnService = {
  // Genera credenziali deterministiche basate su WebAuthn
  generateCredentials: async (username) => {
    try {
      if (!webAuthnService.isSupported()) {
        throw new Error('WebAuthn non è supportato su questo browser');
      }

      // Verifica se l'username è già registrato
      const existingCredential = await webAuthnService.getCredentialId(username);
      if (existingCredential) {
        throw new Error('Username già registrato');
      }

      // Opzioni per la creazione della credenziale
      const createCredentialOptions = {
        challenge: STATIC_CHALLENGE,
        rp: {
          name: "Linda Messenger",
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

      return {
        success: true,
        username,
        password,
        credentialId
      };
    } catch (error) {
      console.error('Errore generazione credenziali WebAuthn:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Login con WebAuthn
  login: async (username) => {
    try {
      // Recupera il credentialId
      const credentialId = await webAuthnService.getCredentialId(username);
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

      return {
        success: true,
        username,
        password,
        credentialId
      };
    } catch (error) {
      console.error('Errore login WebAuthn:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Verifica una credenziale WebAuthn esistente
  verifyCredential: async (credentialId) => {
    try {
      // Opzioni per la verifica della credenziale
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

      // Richiedi la verifica della credenziale
      const assertion = await navigator.credentials.get({
        publicKey: assertionOptions
      });

      if (!assertion) {
        throw new Error('Verifica WebAuthn fallita');
      }

      return {
        success: true,
        authenticatorData: assertion.response.authenticatorData,
        signature: assertion.response.signature
      };
    } catch (error) {
      console.error('Errore verifica WebAuthn:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Recupera il credentialId da Gun
  getCredentialId: async (username) => {
    return new Promise((resolve) => {
      gun.get(DAPP_NAME)
        .get("webauthn-credentials")
        .get(username)
        .once((data) => {
          resolve(data?.credentialId || null);
        });
    });
  },

  // Verifica se WebAuthn è supportato dal browser
  isSupported: () => {
    return window.PublicKeyCredential !== undefined &&
           typeof window.PublicKeyCredential === 'function';
  }
}; 