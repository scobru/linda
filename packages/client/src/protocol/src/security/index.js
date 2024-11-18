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
} from './friendsCertificates.js';

export {
  certificateManager,
  createChatsCertificate,
  createMessagesCertificate,
  revokeChatsCertificate,
  revokeMessagesCertificate,
  createFriendRequestCertificate,
  generateAddFriendCertificate,
  createNotificationCertificate,
};

export default {
  certificateManager,
  createChatsCertificate,
  createMessagesCertificate,
  revokeChatsCertificate,
  revokeMessagesCertificate,
  createFriendRequestCertificate,
  generateAddFriendCertificate,
  createNotificationCertificate,
};
