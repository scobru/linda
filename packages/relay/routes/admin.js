'use strict';
import express from 'express';
import { gun, relayWalletManager } from '../index.js';
import crypto from 'crypto';

const router = express.Router();

// Map per tenere traccia degli utenti in fase di creazione
const userCreationLocks = new Map();

// Funzione di utilità per attendere
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Funzione per verificare se un utente esiste già
async function checkUserExists(username) {
  return new Promise((resolve) => {
    gun.get('accounts').get(username).once((data) => {
      resolve(!!data);
    });
  });
}

function createActor(name, domain, pubkey) {
  return {
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1'
    ],
    'id': `https://${domain}/u/${name}`,
    'type': 'Person',
    'preferredUsername': `${name}`,
    'inbox': `https://${domain}/api/inbox`,
    'outbox': `https://${domain}/u/${name}/outbox`,
    'followers': `https://${domain}/u/${name}/followers`,
    'publicKey': {
      'id': `https://${domain}/u/${name}#main-key`,
      'owner': `https://${domain}/u/${name}`,
      'publicKeyPem': pubkey
    }
  };
}

function createWebfinger(name, domain) {
  return {
    'subject': `acct:${name}@${domain}`,
    'links': [
      {
        'rel': 'self',
        'type': 'application/activity+json',
        'href': `https://${domain}/u/${name}`
      }
    ]
  };
}

export const configure = (router) => {
  // Route per la creazione dell'account
  router.post('/create', async function (req, res) {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        error: 'Bad request. Please provide both username and password.'
      });
    }

    // Verifica se l'utente esiste già
    const userExists = await checkUserExists(username);
    if (userExists) {
      try {
        // Se l'utente esiste, prova ad autenticarlo
        const publicKey = await relayWalletManager.login(username, password);
        
        // Recupera l'API key esistente
        const userData = await new Promise((resolve) => {
          gun.user().get('profile').once((data) => {
            resolve(data);
          });
        });

        if (userData && userData.apikey) {
          return res.status(200).json({
            msg: 'ok',
            apikey: userData.apikey
          });
        }
      } catch (loginError) {
        return res.status(401).json({
          error: 'Invalid credentials'
        });
      }
    }

    // Verifica se l'utente è già in fase di creazione
    if (userCreationLocks.has(username)) {
      // Se il lock esiste da più di 30 secondi, lo rimuoviamo
      const lockTime = userCreationLocks.get(username);
      if (Date.now() - lockTime > 30000) {
        userCreationLocks.delete(username);
      } else {
        return res.status(409).json({
          error: 'Account creation already in progress'
        });
      }
    }

    try {
      // Imposta il lock con timestamp
      userCreationLocks.set(username, Date.now());

      // Attendi un breve momento per evitare race condition
      await wait(1000);

      // Crea l'account usando WalletManager
      await relayWalletManager.createAccount(username, password);
      
      // Genera le chiavi ActivityPub
      const { publicKey, privateKey } = await new Promise((resolve, reject) => {
        crypto.generateKeyPair('rsa', {
          modulusLength: 4096,
          publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
          },
          privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
          }
        }, (err, publicKey, privateKey) => {
          if (err) reject(err);
          resolve({ publicKey, privateKey });
        });
      });

      const domain = req.hostname || 'localhost:8765';
      const actorRecord = createActor(username, domain, publicKey);
      const webfingerRecord = createWebfinger(username, domain);
      const apikey = crypto.randomBytes(16).toString('hex');

      // Salva i dati nel profilo utente
      const userData = {
        name: `${username}@${domain}`,
        actor: actorRecord,
        webfinger: webfingerRecord,
        apikey,
        publicKey,
        privateKey,
        followers: []
      };

      await new Promise((resolve) => {
        gun.user().get('profile').put(userData, (ack) => {
          resolve(ack);
        });
      });

      // Crea anche un riferimento pubblico
      await new Promise((resolve) => {
        gun.get('accounts').get(username).put({
          name: `${username}@${domain}`,
          actor: actorRecord,
          webfinger: webfingerRecord,
          followers: []
        }, (ack) => {
          resolve(ack);
        });
      });

      res.status(201).json({
        msg: 'ok',
        apikey
      });

    } catch (error) {
      console.error('Error creating account:', error);
      
      // Se l'errore indica che l'utente esiste già, prova ad autenticarlo
      if (error.message && error.message.includes('already created')) {
        try {
          const publicKey = await relayWalletManager.login(username, password);
          const userData = await new Promise((resolve) => {
            gun.user().get('profile').once((data) => {
              resolve(data);
            });
          });

          if (userData && userData.apikey) {
            return res.status(200).json({
              msg: 'ok',
              apikey: userData.apikey
            });
          }
        } catch (loginError) {
          console.error('Login fallito dopo errore creazione:', loginError);
        }
      }
      
      res.status(500).json({ error: error.message });
    } finally {
      // Rimuovi il lock quando hai finito
      userCreationLocks.delete(username);
    }
  });

  // Route per le statistiche
  router.get('/stats', async (req, res) => {
    try {
      const stats = await getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Route per il backup
  router.post('/backup', async (req, res) => {
    try {
      const result = await performBackup();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Route per la gestione utenti
  router.get('/users', async (req, res) => {
    try {
      const users = await getUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
};

// Funzioni di supporto
async function getStats() {
  return new Promise((resolve) => {
    gun.get('stats').once((data) => {
      resolve(data || {});
    });
  });
}

async function getUsers() {
  return new Promise((resolve) => {
    gun.get('accounts').once((data) => {
      resolve(data || {});
    });
  });
}

async function performBackup() {
  // Implementa la logica di backup qui
  return { success: true, timestamp: new Date().toISOString() };
}

export default router;
