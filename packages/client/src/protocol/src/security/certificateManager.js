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
   * @returns {Promise<Object|boolean>} Verified certificate data or false if invalid
   */
  async verifyCertificate(certificate, pubKey) {
    try {
      const verified = await SEA.verify(certificate, pubKey);

      if (!verified) return false;

      if (verified.exp && Date.now() > verified.exp) {
        return false;
      }

      if (this.debug) {
        console.log('Verified certificate:', verified);
      }

      return verified;
    } catch (error) {
      console.error('Certificate verification error:', error);
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
      exp: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 giorni
      iat: Date.now()
    };

    const signed = await SEA.sign(certificate, user._.sea);
    return signed;
  },

  async verifyAuthorization(certificate, requiredPermission) {
    const verified = await SEA.verify(certificate, certificate.issuer);
    if (!verified) return false;
    
    if (Date.now() > verified.exp) return false;
    return verified.permissions.includes(requiredPermission);
  }
};

export default certificateManager;
export { certificateManager };
