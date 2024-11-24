/**
 * @module Security
 * @description Module for managing security and certificates in the decentralized network.
 * Provides functionality for creating and managing certificates for chats, messages,
 * friend requests and other security-related operations.
 */

import certificateManager from './certificateManager.js';
import {
  createChatsCertificate,
  createMessagesCertificate,
  revokeChatsCertificate,
  revokeMessagesCertificate,
} from './chatCertificates.js';
import {
  createFriendRequestCertificate,
  generateAddFriendCertificate,
  createNotificationCertificate,
  friendsCertificates
} from './friendsCertificates.js';
import { gun, user, DAPP_NAME } from '../useGun.js';
import SEA from 'gun/sea.js';

// Esporta le funzioni dai moduli
export {
  certificateManager,
  createChatsCertificate,
  createMessagesCertificate,
  revokeChatsCertificate,
  revokeMessagesCertificate,
  createFriendRequestCertificate,
  generateAddFriendCertificate,
  createNotificationCertificate,
  friendsCertificates
};

/**
 * Verifica un certificato
 */
export const verifyCertificate = async (cert, pubKey, type) => {
  try {
    if (!cert) return false;

    // Verifica la firma
    const verified = await SEA.verify(cert, pubKey);
    if (!verified) return false;

    // Verifica il tipo
    if (verified.type !== type) return false;

    // Verifica la validità temporale (30 giorni)
    const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - verified.timestamp > MAX_AGE) return false;

    return true;
  } catch (error) {
    console.error('Errore verifica certificato:', error);
    return false;
  }
};

/**
 * Ottiene un certificato specifico
 */
export const getCertificate = async (type) => {
  if (!user.is) return null;

  try {
    const cert = await new Promise((resolve) => {
      gun.user()
        .get(DAPP_NAME)
        .get('certificates')
        .get(type)
        .once((data) => {
          resolve(data);
        });
    });

    if (!cert) {
      // Se non esiste, crea un nuovo certificato
      if (type === 'friendRequests') {
        return await createFriendRequestCertificate();
      } else if (type === 'notifications') {
        return await createNotificationCertificate();
      }
    }

    return cert;
  } catch (error) {
    console.error(`Errore recupero certificato ${type}:`, error);
    return null;
  }
};

// Esporta un oggetto default con tutte le funzionalità
export default {
  certificateManager,
  createChatsCertificate,
  createMessagesCertificate,
  revokeChatsCertificate,
  revokeMessagesCertificate,
  createFriendRequestCertificate,
  generateAddFriendCertificate,
  createNotificationCertificate,
  verifyCertificate,
  getCertificate,
  friendsCertificates
};
