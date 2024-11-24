import { gun, user, DAPP_NAME, SEA } from '../useGun.js';

/**
 * Creates a certificate for a group member granting specific permissions
 *
 * @async
 * @function createGroupCertificate
 * @param {string} groupId - The unique identifier of the group
 * @param {string} memberPub - The public key of the member
 * @returns {Promise<string>} The created certificate
 * @throws {Error} If user is not authenticated
 */
export const createGroupCertificate = async (groupId, memberPub) => {
  if (!user.is) throw new Error('User not authenticated');

  try {
    // Prima verifica se l'utente è admin del gruppo
    const isAdmin = await new Promise((resolve) => {
      gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('admins')
        .map()
        .once((admin) => {
          if (admin === user.is.pub) resolve(true);
        });
      setTimeout(() => resolve(false), 1000);
    });

    if (!isAdmin) {
      throw new Error('Solo gli admin possono generare certificati');
    }

    // Crea il payload del certificato
    const certificateData = {
      groupId,
      memberPub,
      issuer: user.is.pub,
      issuedAt: Date.now(),
      expiry: Date.now() + (365 * 24 * 60 * 60 * 1000), // 1 anno
      permissions: {
        read: true,
        write: true,
        invite: false
      }
    };

    // Firma il certificato con la chiave privata dell'admin
    const signature = await SEA.sign(JSON.stringify(certificateData), user.pair());

    const certificate = {
      ...certificateData,
      signature
    };

    // Salva il certificato nel gruppo
    await new Promise((resolve, reject) => {
      gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('certificates')
        .get(memberPub)
        .put(certificate, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });

    // Salva una copia nel profilo del membro
    await new Promise((resolve, reject) => {
      gun.get(`~${memberPub}`)
        .get(DAPP_NAME)
        .get('group_certificates')
        .get(groupId)
        .put(certificate, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });

    return certificate;
  } catch (error) {
    console.error('Error creating group certificate:', error);
    throw error;
  }
};

/**
 * Verifica la validità di un certificato di gruppo
 * @param {Object} certificate - Il certificato da verificare
 * @param {string} groupId - ID del gruppo
 * @param {string} memberPub - Chiave pubblica del membro
 * @returns {Promise<boolean>} True se il certificato è valido
 */
export const verifyGroupCertificate = async (certificate, groupId, memberPub) => {
  try {
    if (!certificate || !certificate.signature) {
      return false;
    }

    // Verifica la firma del certificato
    const issuedBy = certificate.issuer;
    const isValidSignature = await SEA.verify(
      JSON.stringify({
        groupId: certificate.groupId,
        memberPub: certificate.memberPub,
        issuer: certificate.issuer,
        issuedAt: certificate.issuedAt,
        expiry: certificate.expiry,
        permissions: certificate.permissions
      }),
      certificate.signature,
      issuedBy
    );

    if (!isValidSignature) {
      return false;
    }

    // Verifica che non sia scaduto
    if (Date.now() > certificate.expiry) {
      return false;
    }

    // Verifica che l'emittente sia ancora admin
    const isStillAdmin = await new Promise((resolve) => {
      gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('admins')
        .map()
        .once((admin) => {
          if (admin === issuedBy) resolve(true);
        });
      setTimeout(() => resolve(false), 1000);
    });

    if (!isStillAdmin) {
      return false;
    }

    // Verifica che il membro non sia stato espulso
    const isKicked = await new Promise((resolve) => {
      gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('kicked_members')
        .map()
        .once((kicked) => {
          if (kicked && kicked.member === memberPub) resolve(true);
        });
      setTimeout(() => resolve(false), 1000);
    });

    return !isKicked;
  } catch (error) {
    console.error('Error verifying group certificate:', error);
    return false;
  }
};

/**
 * Revoca un certificato di gruppo
 * @param {string} groupId - ID del gruppo
 * @param {string} memberPub - Chiave pubblica del membro
 * @returns {Promise<boolean>} True se la revoca ha successo
 */
export const revokeGroupCertificate = async (groupId, memberPub) => {
  if (!user.is) throw new Error('User not authenticated');

  try {
    // Verifica che chi revoca sia admin
    const isAdmin = await new Promise((resolve) => {
      gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('admins')
        .map()
        .once((admin) => {
          if (admin === user.is.pub) resolve(true);
        });
      setTimeout(() => resolve(false), 1000);
    });

    if (!isAdmin) {
      throw new Error('Solo gli admin possono revocare certificati');
    }

    // Rimuovi il certificato dal gruppo
    await new Promise((resolve) => {
      gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('certificates')
        .get(memberPub)
        .put(null, resolve);
    });

    // Rimuovi il certificato dal profilo del membro
    await new Promise((resolve) => {
      gun.get(`~${memberPub}`)
        .get(DAPP_NAME)
        .get('group_certificates')
        .get(groupId)
        .put(null, resolve);
    });

    return true;
  } catch (error) {
    console.error('Error revoking group certificate:', error);
    throw error;
  }
};

export default {
  createGroupCertificate,
  verifyGroupCertificate,
  revokeGroupCertificate
};
