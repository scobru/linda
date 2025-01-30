import { walletManager } from "../useGun";

class WebAuthnManager {
  constructor() {
    this.walletManager = walletManager;
  }

  isSupported() {
    return this.walletManager.isWebAuthnSupported();
  }

  async generateCredentials(username) {
    try {
      if (!this.isSupported()) {
        throw new Error('WebAuthn non è supportato su questo browser');
      }

      // Chiama Shogun per generare le credenziali WebAuthn
      const result = await this.walletManager.webAuthnService.generateCredentials(username);
      return result;
    } catch (error) {
      console.error('Errore generazione credenziali WebAuthn:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async login(username) {
    try {
      // Chiama Shogun per effettuare il login con WebAuthn
      const result = await this.walletManager.webAuthnService.login(username);
      return result;
    } catch (error) {
      console.error('Errore login WebAuthn:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getCredentialId(username) {
    // Chiama Shogun per recuperare il credentialId
    return this.walletManager.webAuthnService.getCredentialId(username);
  }
}

// Esporta un'istanza statica per l'uso diretto
export const webAuthnService = new WebAuthnManager();

// Esporta anche la classe per chi vuole creare una propria istanza
export { WebAuthnManager };