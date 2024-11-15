/**
 * @module Linda/Messenger
 * @description Core messaging and social functionality module that provides authentication, 
 * messaging, friend management and content sharing capabilities
 */

// Importa tutti i moduli
import auth from './authentication';
import * as blocking from './blocking';
import * as friends from './friends';
import * as messaging from './messaging';
import * as notes from './notes';
import * as notifications from './notifications';
import * as security from './security';
import * as system from './system';
import * as todos from './todos';
import * as posts from './posts';

// Esporta i singoli moduli
export const authentication = auth;

export { 
  blocking,
  friends, 
  messaging,
  notes,
  notifications,
  security,
  system,
  todos,
  posts
};

// Esporta anche le funzionalità specifiche più utilizzate
export const {
  checkAuth,
  isAuthenticated,
  loginUser,
  registerUser,
  logout,
  getKeyPair
} = auth;

export const {
  userBlocking
} = blocking;

export const {
  addFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  friendsService
} = friends;

export const {
  chatManagement,
  chatsList,
  createChat,
  messageList,
  sendMessage,
  sendVoiceMessage,
  messagingCertificates
} = messaging;

export const {
  createNote,
  deleteNote,
  getNote,
  updateNote,
  getUserNotes
} = notes;

export const {
  messageNotifications
} = notifications;

export const {
  certificateManager,
  blockCertificates
} = security;

export const {
  systemService
} = system;

const cacheManager = {
  store: new Map(),
  ttl: 5 * 60 * 1000, // 5 minuti
  
  async get(key) {
    const cached = this.store.get(key);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.value;
    }
    return null;
  },
  
  set(key, value) {
    this.store.set(key, {
      value,
      timestamp: Date.now()
    });
  },
  
  clear() {
    this.store.clear();
  }
};

// Esporta il cacheManager
export { cacheManager };

// Esporta un oggetto default con tutti i moduli
export default {
  authentication,
  blocking,
  friends,
  messaging,
  notes,
  notifications,
  security,
  system,
  todos,
  posts
};
