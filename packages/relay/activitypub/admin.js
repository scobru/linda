import crypto from 'crypto';
import { handleActorEndpoint } from './endpoints.js';

// Genera una chiave API casuale
function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

// Verifica la chiave API
async function verifyApiKey(gun, DAPP_NAME, username, apiKey) {
  return new Promise((resolve) => {
    gun
      .get(DAPP_NAME)
      .get('activitypub')
      .get(username)
      .get('apiKey')
      .once((storedKey) => {
        resolve(storedKey === apiKey);
      });
  });
}

// Crea un nuovo account ActivityPub
export async function createAccount(gun, DAPP_NAME, username) {
  try {
    console.log('Creazione account:', {
      username,
      DAPP_NAME
    });

    // Verifica se l'account esiste già
    const exists = await new Promise(resolve => {
      gun
        .get(DAPP_NAME)
        .get('activitypub')
        .get(username)
        .once(data => {
          resolve(!!data);
        });
    });

    if (exists) {
      throw new Error('Account già esistente');
    }

    // Genera una nuova chiave API
    const apiKey = generateApiKey();
    console.log('Chiave API generata');

    // Salva la chiave API
    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get('activitypub')
        .get(username)
        .get('apiKey')
        .put(apiKey, (ack) => {
          if (ack.err) {
            console.error('Errore nel salvataggio della chiave API:', ack.err);
            reject(new Error(ack.err));
          } else {
            console.log('Chiave API salvata');
            resolve();
          }
        });
    });

    // Inizializza il profilo ActivityPub
    console.log('Inizializzazione profilo ActivityPub');
    await handleActorEndpoint(gun, DAPP_NAME, username);
    console.log('Profilo ActivityPub creato');

    return {
      msg: 'ok',
      apikey: apiKey
    };
  } catch (error) {
    console.error('Errore nella creazione dell\'account:', error);
    throw error;
  }
}

// Invia un messaggio a tutti i follower
export async function sendMessage(gun, DAPP_NAME, username, apiKey, message) {
  try {
    // Verifica la chiave API
    const isValid = await verifyApiKey(gun, DAPP_NAME, username, apiKey);
    if (!isValid) {
      throw new Error('Chiave API non valida');
    }

    // Recupera i follower
    const followers = await new Promise((resolve) => {
      const followersArray = [];
      gun
        .get(DAPP_NAME)
        .get('activitypub')
        .get(username)
        .get('followers')
        .map()
        .once((data, key) => {
          if (data && data.id) {
            followersArray.push(data.id);
          }
        });

      setTimeout(() => resolve(followersArray), 100);
    });

    // Crea l'attività Create con la nota
    const timestamp = Date.now();
    const activity = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `${process.env.BASE_URL}/users/${username}/activities/${timestamp}`,
      type: 'Create',
      actor: `${process.env.BASE_URL}/users/${username}`,
      published: new Date().toISOString(),
      to: ['https://www.w3.org/ns/activitystreams#Public'],
      cc: followers,
      object: {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: `${process.env.BASE_URL}/users/${username}/posts/${timestamp}`,
        type: 'Note',
        attributedTo: `${process.env.BASE_URL}/users/${username}`,
        content: message,
        published: new Date().toISOString(),
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        cc: followers
      }
    };

    // Salva l'attività nell'outbox
    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get('activitypub')
        .get(username)
        .get('outbox')
        .get(activity.id)
        .put(activity, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });

    return {
      msg: 'ok',
      activityId: activity.id
    };
  } catch (error) {
    console.error('Errore nell\'invio del messaggio:', error);
    throw error;
  }
} 