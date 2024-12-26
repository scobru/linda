import { gun, user, DAPP_NAME, SEA } from '../useGun.js';

/**
 * Certificate manager for handling digital certificates in the decentralized network
 * @namespace
 */
const certificateManager = {
  /** @property {boolean} debug - Enable/disable debug logging */
  debug: false,

  /**
   * Creates and signs a new certificate
   * @async
   * @param {Object} data - Certificate data to sign
   * @returns {Promise<string>} Signed certificate string
   * @throws {Error} If user is not authenticated
   */
  async createCertificate(data) {
    if (!user.is) throw new Error('User not authenticated');

    const certificate = {
      ...data,
      iat: Date.now(),
      iss: user.is.pub,
    };

    const signed = await SEA.sign(certificate, user._.sea);

    if (this.debug) {
      console.log('Created certificate:', {
        certificate,
        signed,
      });
    }

    return signed;
  },

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

      // Rimuovi il prefisso SEA se presente
      const certStr = certificate.startsWith('SEA')
        ? certificate.slice(3)
        : certificate;

      // Verifica la firma
      const parsed = JSON.parse(certStr);
      console.log('Certificato parsato:', parsed);

      if (!parsed || !parsed.m) {
        console.error('Certificato malformato');
        return false;
      }

      console.log('Verifica firma con chiave:', parsed.m.pub);
      const verified = await SEA.verify(parsed, parsed.m.pub);
      console.log('Risultato verifica:', verified);

      if (!verified) {
        console.error('Firma del certificato non valida');
        return false;
      }

      // Verifica il tipo
      console.log('Verifica tipo:', { atteso: type, ricevuto: verified.type });
      const expectedTypes = {
        messages: ['message', 'messages'],
        chats: ['chat', 'chats'],
      };

      if (!expectedTypes[type]?.includes(verified.type)) {
        console.error('Tipo di certificato non corrispondente:', {
          expected: expectedTypes[type],
          got: verified.type,
        });
        return false;
      }

      // Verifica il destinatario
      console.log('Verifica destinatario:', {
        atteso: pubKey,
        ricevuto: verified.target,
      });
      if (verified.target !== pubKey) {
        console.error('Destinatario del certificato non corrispondente:', {
          expected: pubKey,
          got: verified.target,
        });
        return false;
      }

      // Verifica la scadenza
      if (verified.exp && verified.exp < Date.now()) {
        console.error('Certificato scaduto:', {
          expiration: verified.exp,
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

      console.log('Certificato valido:', verified);
      return verified;
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

  async createAuthorizationCertificate(targetPub, permissions) {
    if (!user.is) throw new Error('User not authenticated');

    const certificate = {
      type: 'authorization',
      issuer: user.is.pub,
      target: targetPub,
      permissions,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 giorni
      iat: Date.now(),
    };

    const signed = await SEA.sign(certificate, user._.sea);
    return signed;
  },

  async verifyAuthorization(certificate, requiredPermission) {
    const verified = await SEA.verify(certificate, certificate.issuer);
    if (!verified) return false;

    if (Date.now() > verified.exp) return false;
    return verified.permissions.includes(requiredPermission);
  },
};

export default certificateManager;
export { certificateManager };
