import { gun, user, DAPP_NAME, SEA } from '../useGun.js';

/**
 * Certificate manager for handling digital certificates in the decentralized network
 * @namespace
 */
const certificateManager = {
  /** @property {boolean} debug - Enable/disable debug logging */
  debug: false,

  /**
   * Verifies a certificate's signature and expiration
   * @async
   * @param {string} certificate - The certificate to verify
   * @param {string} pubKey - Public key to verify against
   * @param {string} type - Type of certificate to verify
   * @returns {Promise<Object|boolean>} Verified certificate data or false if invalid
   */
  async verifyCertificate(certificate, pubKey, type) {
    try {
      console.log('Inizio verifica certificato:', {
        certificate,
        pubKey,
        type,
      });

      if (!certificate) {
        console.error('Certificato mancante');
        return false;
      }

      // Verifica il certificato usando SEA.verify
      const verified = await SEA.verify(certificate, false);
      console.log('Risultato verifica:', verified);

      if (!verified || !verified.w) {
        console.error('Certificato non valido o malformato');
        return false;
      }

      // Estrai i dati del certificato
      const certData = verified.w;
      console.log('Dati certificato:', certData);

      // Verifica il tipo di certificato
      console.log('Verifica tipo:', { atteso: type, ricevuto: certData['*'] });
      if (certData['*'] !== type) {
        console.error('Tipo di certificato non corrispondente:', {
          expected: type,
          got: certData['*'],
        });
        return false;
      }

      // Verifica il destinatario
      console.log('Verifica destinatario:', {
        atteso: pubKey,
        ricevuto: certData['+'],
      });
      if (certData['+'] !== pubKey) {
        console.error('Destinatario del certificato non corrispondente:', {
          expected: pubKey,
          got: certData['+'],
        });
        return false;
      }

      // Verifica l'emittente
      if (!certData['-']) {
        console.error('Emittente del certificato mancante');
        return false;
      }

      // Verifica i permessi
      if (!certData['?'] || !Array.isArray(certData['?'])) {
        console.error('Permessi del certificato non validi');
        return false;
      }

      // Verifica la scadenza se presente
      if (certData['>'] && certData['>'] < Date.now()) {
        console.error('Certificato scaduto:', {
          expiration: certData['>'],
          now: Date.now(),
        });
        return false;
      }

      // Verifica se è stato revocato
      const isRevoked = await this.isRevoked(certificate);
      if (isRevoked) {
        console.error('Certificato revocato');
        return false;
      }

      console.log('Certificato valido:', certData);
      return certData;
    } catch (error) {
      console.error('Errore nella verifica del certificato:', error);
      return false;
    }
  },

  /**
   * Revokes a certificate by adding it to revoked certificates list
   * @async
   * @param {string} certificateId - ID of certificate to revoke
   * @throws {Error} If user is not authenticated
   */
  async revokeCertificate(certificateId) {
    if (!user.is) throw new Error('User not authenticated');

    await gun
      .user()
      .get(DAPP_NAME)
      .get('revoked_certificates')
      .get(certificateId)
      .put({
        id: certificateId,
        timestamp: Date.now(),
      });
  },

  /**
   * Checks if a certificate has been revoked
   * @async
   * @param {string} certificateId - ID of certificate to check
   * @returns {Promise<boolean>} True if certificate is revoked
   */
  async isRevoked(certificateId) {
    const revoked = await gun
      .user()
      .get(DAPP_NAME)
      .get('revoked_certificates')
      .get(certificateId)
      .once();

    return !!revoked;
  },
};

export default certificateManager;
export { certificateManager };
