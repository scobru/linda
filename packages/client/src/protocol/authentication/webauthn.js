import { gun, user, DAPP_NAME } from "../useGun";
import { WalletManager } from "@scobru/shogun";

// Funzione di utilità per convertire ArrayBuffer in stringa base64
const bufferToBase64 = (buffer) => {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
};

// Funzione di utilità per convertire stringa base64 in ArrayBuffer
const base64ToBuffer = (base64) => {
  const base64Url = base64.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64Padded = base64Url + padding;

  const binary = atob(base64Padded);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer.buffer;
};

// Challenge statica per generare sempre le stesse credenziali
const STATIC_CHALLENGE = new TextEncoder().encode("shogun_static_challenge");

class WebAuthnManager {
  constructor() {
    this.walletManager = new WalletManager();
  }

  // Verifica se WebAuthn è supportato
  isSupported() {
    return (
      window.PublicKeyCredential !== undefined &&
      typeof window.PublicKeyCredential === "function"
    );
  }

  // Crea un account con WebAuthn
  async generateCredentials(username) {
    try {
      if (!this.isSupported()) {
        throw new Error("WebAuthn non è supportato su questo browser");
      }

      const result = await this.walletManager.createAccountWithWebAuthn(
        username
      );

      if (!result) {
        throw new Error(
          "Errore durante la generazione delle credenziali WebAuthn"
        );
      }

      // Salva in Gun per retrocompatibilità
      await gun.get(DAPP_NAME).get("webauthn-credentials").get(username).put({
        credentialId: result.credentialId,
        timestamp: Date.now(),
      });

      return {
        success: true,
        username,
        credentialId: result.credentialId,
        pubKey: result.pubKey,
      };
    } catch (error) {
      console.error("Errore creazione account WebAuthn:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Login con WebAuthn
  async login(username) {
    try {
      if (!this.isSupported()) {
        throw new Error("WebAuthn non è supportato su questo browser");
      }

      const result = await this.walletManager.loginWithWebAuthn(username);

      if (!result) {
        throw new Error("Verifica WebAuthn fallita");
      }

      return {
        success: true,
        username,
        credentialId: result.credentialId,
        pubKey: result.pubKey,
      };
    } catch (error) {
      console.error("Errore login WebAuthn:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Recupera il credentialId da Gun (per retrocompatibilità)
  async getCredentialId(username) {
    return new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
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

// Esporta anche la classe per chi vuole creare una propria istanza
export { WebAuthnManager };
