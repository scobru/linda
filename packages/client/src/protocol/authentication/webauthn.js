import { webAuthnService } from "../useGun";

class WebAuthnManager {
  constructor() {
    this.webAuthnService = webAuthnService;
  }

  isSupported() {
    return this.webAuthnService.isSupported();
  }

  async checkExistingUser(username) {
    try {
      // Chiama Shogun per verificare se l'utente esiste
      return await this.webAuthnService.webAuthnService.checkExistingUser(username);
    } catch (error) {
      console.error('Errore verifica esistenza utente:', error);
      return false;
    }
  }

  async generateCredentials(username) {
    try {
      if (!this.isSupported()) {
        throw new Error('WebAuthn non è supportato su questo browser');
      }

      // Chiama Shogun per generare le credenziali WebAuthn
      const result = await this.webAuthnService.webAuthnService.generateCredentials(username);
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
      const result = await this.webAuthnService.webAuthnService.login(username);
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
    return this.webAuthnService.webAuthnService.getCredentialId(username);
  }
}

// Esporta un'istanza statica per l'uso diretto
export const webAuthn = webAuthnService;

