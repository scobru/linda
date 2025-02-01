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
    console.log('Creazione account:', username);

    // Genera una nuova chiave API
    const apiKey = generateApiKey();

    // Salva la chiave API
    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get('activitypub')
        .get(username)
        .get('apiKey')
        .put(apiKey, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });

    // Inizializza il profilo ActivityPub
    await handleActorEndpoint(gun, DAPP_NAME, username);

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