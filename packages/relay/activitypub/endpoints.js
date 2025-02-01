import fetch from 'node-fetch';
import crypto from 'crypto';
import { createHash } from 'crypto';
import { getUserActivityPubKeys, saveUserActivityPubKeys } from '../index.js';
import dotenv from 'dotenv';

// Carica le variabili d'ambiente
dotenv.config();

// Usa l'URL dal file .env o un default
const BASE_URL = process.env.BASE_URL || "http://localhost:8765";

// Classe per gestire gli eventi ActivityPub
class ActivityPubEventHandler {
  constructor(gun, DAPP_NAME) {
    this.gun = gun;
    this.DAPP_NAME = DAPP_NAME;
    this.handlers = new Map();
  }

  // Registra un handler per un tipo di attività
  on(activityType, handler) {
    this.handlers.set(activityType, handler);
    return this;
  }

  // Gestisce un'attività in arrivo
  async handleActivity(activity, username) {
    const handler = this.handlers.get(activity.type);
    if (handler) {
      return await handler(activity, username, this.gun, this.DAPP_NAME);
    }
    throw new Error(`Handler non trovato per il tipo di attività: ${activity.type}`);
  }
}

// Crea l'event handler globale
const eventHandler = new ActivityPubEventHandler(null, null);

// Registra gli handler per i vari tipi di attività
eventHandler
  .on('Follow', async (activity, username, gun, DAPP_NAME) => {
    if (!activity.actor || !activity.object) {
      throw new Error('Attività Follow non valida');
    }

    // Salva la relazione di follow
    await Promise.all([
      gun
        .get(DAPP_NAME)
        .get('activitypub')
        .get(username)
        .get('following')
        .get(activity.object)
        .put({
          id: activity.object,
          followed_at: new Date().toISOString()
        }),
      
      // Invia l'Accept
      sendAcceptActivity(activity, username, gun, DAPP_NAME)
    ]);

    return { success: true };
  })
  .on('Undo', async (activity, username, gun, DAPP_NAME) => {
    if (!activity.object || activity.object.type !== 'Follow') {
      throw new Error('Attività Undo non valida');
    }

    // Rimuovi la relazione di follow
    await gun
      .get(DAPP_NAME)
      .get('activitypub')
      .get(username)
      .get('following')
      .get(activity.object.object)
      .put(null);

    return { success: true };
  })
  .on('Accept', async (activity, username, gun, DAPP_NAME) => {
    if (!activity.object || activity.object.type !== 'Follow') {
      throw new Error('Attività Accept non valida');
    }

    // Aggiorna lo stato del follow
    await gun
      .get(DAPP_NAME)
      .get('activitypub')
      .get(username)
      .get('following')
      .get(activity.actor)
      .put({
        id: activity.actor,
        accepted_at: new Date().toISOString(),
        status: 'accepted'
      });

    return { success: true };
  });

// Funzione per inviare un'attività Accept
async function sendAcceptActivity(followActivity, username, gun, DAPP_NAME) {
  const acceptActivity = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: 'Accept',
    actor: `${BASE_URL}/users/${username}`,
    object: followActivity,
    id: `${BASE_URL}/users/${username}/activities/${Date.now()}`,
    published: new Date().toISOString()
  };

  const targetServer = new URL(followActivity.actor).origin;
  const body = JSON.stringify(acceptActivity);
  const digest = createHash('sha256').update(body).digest('base64');

  const headers = {
    'Content-Type': 'application/activity+json',
    'Accept': 'application/activity+json',
    'Date': new Date().toUTCString(),
    'Host': new URL(targetServer).host,
    'Digest': `SHA-256=${digest}`
  };

  // Firma la richiesta
  const keyId = `${BASE_URL}/users/${username}#main-key`;
  headers['Signature'] = await signRequest({
    method: 'POST',
    url: `${targetServer}/inbox`,
    headers,
    body
  }, keyId, username, gun);

  const response = await fetch(`${targetServer}/inbox`, {
    method: 'POST',
    headers,
    body
  });

  if (!response.ok) {
    throw new Error(`Failed to send Accept: ${response.statusText}`);
  }

  return response.json();
}

// Endpoint per il profilo utente (actor)
export const handleActorEndpoint = async (gun, DAPP_NAME, username) => {
  try {
    console.log(`Recupero profilo ActivityPub per ${username}`);
    
    const timeout = 5000;
    
    const actorData = await Promise.race([
      new Promise((resolve, reject) => {
        const userNode = gun
          .get(DAPP_NAME)
          .get('activitypub')
          .get(username);

        userNode.once(async (data) => {
          if (!data) {
            console.log(`Profilo non trovato per ${username}, creazione profilo di default`);
            const defaultActor = {
              '@context': ['https://www.w3.org/ns/activitystreams'],
              type: 'Person',
              id: `${BASE_URL}/users/${username}`,
              following: `${BASE_URL}/users/${username}/following`,
              followers: `${BASE_URL}/users/${username}/followers`,
              inbox: `${BASE_URL}/users/${username}/inbox`,
              outbox: `${BASE_URL}/users/${username}/outbox`,
              preferredUsername: username,
              name: username,
              summary: `Profilo ActivityPub di ${username}`,
              url: `${BASE_URL}/users/${username}`,
              published: new Date().toISOString(),
              endpoints: {
                sharedInbox: `${BASE_URL}/inbox`
              }
            };

            // Salva il profilo di default
            new Promise((resolvePut, rejectPut) => {
              userNode.put(defaultActor, (ack) => {
                if (ack.err) {
                  rejectPut(ack.err);
                } else {
                  resolvePut();
                }
              });
            }).then(() => resolve(defaultActor))
              .catch((err) => reject(new Error(`Errore nel salvataggio del profilo: ${err}`)));
          } else {
            // Se il profilo esiste già, normalizza gli URL
            const normalizedData = {
              ...data,
              id: `${BASE_URL}/users/${username}`,
              following: `${BASE_URL}/users/${username}/following`,
              followers: `${BASE_URL}/users/${username}/followers`,
              inbox: `${BASE_URL}/users/${username}/inbox`,
              outbox: `${BASE_URL}/users/${username}/outbox`,
              url: `${BASE_URL}/users/${username}`
            };

            // Salva il profilo normalizzato
            new Promise((resolvePut, rejectPut) => {
              userNode.put(normalizedData, (ack) => {
                if (ack.err) {
                  rejectPut(ack.err);
                } else {
                  resolvePut();
                }
              });
            }).then(() => resolve(normalizedData))
              .catch((err) => reject(new Error(`Errore nel salvataggio del profilo normalizzato: ${err}`)));
          }
        });

        // Gestione errori del nodo
        userNode.on('error', (err) => {
          reject(new Error(`Errore nel nodo utente: ${err}`));
        });
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout nel recupero del profilo')), timeout)
      )
    ]);

    // Recupera o genera le chiavi
    let keys = null;
    try {
      keys = await getUserActivityPubKeys(gun, username);
      console.log('Chiavi recuperate con successo');
    } catch (error) {
      console.warn('Chiavi non trovate, generazione nuove chiavi...');
      keys = await saveUserActivityPubKeys(gun, username);
    }

    // Aggiungi la chiave pubblica al profilo
    actorData.publicKey = {
      id: `${BASE_URL}/users/${username}#main-key`,
      owner: `${BASE_URL}/users/${username}`,
      publicKeyPem: keys.publicKey.replace(/\\n/g, '\n')
    };

    return actorData;
  } catch (error) {
    console.error('Errore nel recupero del profilo ActivityPub:', error);
    throw error;
  }
};

// Endpoint per l'inbox
export const handleInbox = async (gun, DAPP_NAME, username, activity) => {
  try {
    // Inizializza l'event handler con le dipendenze correnti
    eventHandler.gun = gun;
    eventHandler.DAPP_NAME = DAPP_NAME;

    // Gestisci l'attività
    const result = await eventHandler.handleActivity(activity, username);

    // Salva l'attività nell'inbox
    const activityId = activity.id || `${BASE_URL}/users/${username}/inbox/${Date.now()}`;
    await gun
      .get(DAPP_NAME)
      .get('activitypub')
      .get(username)
      .get('inbox')
      .get(activityId)
      .put({
        ...activity,
        received_at: new Date().toISOString()
      });

    return result;
  } catch (error) {
    console.error('Errore nella gestione dell\'attività in arrivo:', error);
    throw error;
  }
};

// Modifica la funzione signRequest per utilizzare le chiavi dell'utente
async function signRequest(request, keyId, username, gun) {
  try {
    const keys = await getUserActivityPubKeys(gun, username);
    const url = new URL(request.url);
    
    // 1. Normalizza il corpo della richiesta
    const bodyString = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    const digest = createHash('sha256').update(bodyString).digest('base64');

    // 2. Aggiungi header mancanti e verifica l'ordine
    const headersToSign = [
      '(request-target)',
      'host',
      'date',
      'digest',
      'content-type'
    ];

    // 3. Costruisci la stringa di firma con formattazione corretta
    const signatureParams = headersToSign
      .map(header => {
        let value;
        switch(header) {
          case '(request-target)':
            value = `${request.method.toLowerCase()} ${url.pathname}${url.search}`;
            break;
          case 'host':
            value = url.host;
            break;
          default:
            value = request.headers[header.toLowerCase()];
        }
        return `${header.toLowerCase()}: ${value}`;
      })
      .join('\n');

    // 4. Usa la codifica corretta per la firma
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signatureParams);
    const signature = signer.sign(keys.privateKey, 'base64');

    // 5. Costruisci l'header della firma
    const signatureHeader = [
      `keyId="${keyId}"`,
      'algorithm="rsa-sha256"',
      `headers="${headersToSign.join(' ')}"`,
      `signature="${signature}"`
    ].join(', ');

    return signatureHeader;
  } catch (error) {
    console.error('Errore nella firma della richiesta:', error);
    throw error;
  }
}

// Endpoint per l'outbox
export const handleOutbox = async (gun, DAPP_NAME, username, activity) => {
  try {
    // Verifica che l'attività sia definita e valida
    if (!activity || typeof activity !== 'object' || Array.isArray(activity)) {
      throw new Error('Attività non valida: deve essere un oggetto');
    }

    if (!activity.type) {
      throw new Error('Tipo di attività mancante');
    }

    // Crea un ID univoco per l'attività
    const timestamp = Date.now();
    const activityId = `${BASE_URL}/users/${username}/activities/${timestamp}`;

    // Gestione specifica per Create (Note)
    if (activity.type === 'Create' && activity.object?.type === 'Note') {
      if (!activity.object.content) {
        throw new Error('Content mancante per la nota');
      }

      // Crea l'oggetto post
      const post = {
        content: activity.object.content,
        author: username,
        timestamp: timestamp,
        id: `${BASE_URL}/users/${username}/posts/${timestamp}`
      };

      // Salva il post
      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get('posts')
          .get(post.id)
          .put(post, (ack) => {
            if (ack.err) {
              reject(new Error(ack.err));
            } else {
              resolve(ack);
            }
          });
      });

      // Crea l'attività ActivityPub
      const activityPubResponse = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: activityId,
        type: 'Create',
        actor: `${BASE_URL}/users/${username}`,
        published: new Date(timestamp).toISOString(),
        to: 'https://www.w3.org/ns/activitystreams#Public',
        object: {
          type: 'Note',
          id: post.id,
          content: post.content,
          published: new Date(timestamp).toISOString(),
          attributedTo: `${BASE_URL}/users/${username}`,
          to: 'https://www.w3.org/ns/activitystreams#Public'
        }
      };

      // Salva l'attività nell'outbox
      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get('activitypub')
          .get(username)
          .get('outbox')
          .get(activityId)
          .put(activityPubResponse, (ack) => {
            if (ack.err) {
              reject(new Error(ack.err));
            } else {
              // Verifica che i dati siano stati salvati correttamente
              gun
                .get(DAPP_NAME)
                .get('activitypub')
                .get(username)
                .get('outbox')
                .get(activityId)
                .once((data) => {
                  if (data) {
                    resolve(data);
                  } else {
                    reject(new Error('Verifica salvataggio attività fallita'));
                  }
                });
            }
          });
      });

      // Restituisci la risposta con array per ActivityPub ma stringa per Gun
      return {
        ...activityPubResponse,
        '@context': ['https://www.w3.org/ns/activitystreams'],
        to: [activityPubResponse.to]
      };
    }

    // Gestione specifica per Follow
    if (activity.type === 'Follow' && typeof activity.object === 'string') {
      const targetUser = activity.object.split('/').pop();
      if (!targetUser) {
        throw new Error('Target user non valido');
      }

      // Salva il follow localmente
      await Promise.all([
        gun
          .get(DAPP_NAME)
          .get('activitypub')
          .get(username)
          .get('following')
          .get(targetUser)
          .put({
            id: targetUser,
            followed_at: new Date().toISOString()
          }),
          
        gun
          .get(DAPP_NAME)
          .get('activitypub')
          .get(targetUser)
          .get('followers')
          .get(username)
          .put({
            id: username,
            followed_at: new Date().toISOString()
          })
      ]);

      // Invia la richiesta di follow al server remoto
      const targetServer = activity.object.split('/users/')[0];
      const followActivity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: `${BASE_URL}/users/${username}/activities/${timestamp}`,
        type: 'Follow',
        actor: `${BASE_URL}/users/${username}`,
        object: activity.object
      };

      const body = JSON.stringify(followActivity);
      const digest = createHash('sha256').update(body).digest('base64');

      const headers = {
        'Content-Type': 'application/activity+json',
        'Accept': 'application/activity+json',
        'Date': new Date().toUTCString(),
        'Host': new URL(targetServer).host,
        'Digest': `SHA-256=${digest}`
      };

      // Se è configurata una chiave privata, firma la richiesta
      if (process.env.ACTIVITYPUB_PRIVATE_KEY) {
        const keyId = `${BASE_URL}/users/${username}#main-key`;
        headers['Signature'] = await signRequest({
          method: 'POST',
          url: `${targetServer}/users/${targetUser}/inbox`,
          headers: headers,
          body: body
        }, keyId, username, gun);
      }

      const response = await fetch(`${targetServer}/users/${targetUser}/inbox`, {
        method: 'POST',
        headers: headers,
        body: body
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to send follow request: ${response.statusText} - ${errorText}`);
      }

      // Restituisci una versione ActivityPub-compatibile per la risposta HTTP
      return {
        '@context': ['https://www.w3.org/ns/activitystreams'],
        id: `${BASE_URL}/users/${username}/activities/${timestamp}`,
        type: 'Follow',
        actor: `${BASE_URL}/users/${username}`,
        published: new Date(timestamp).toISOString(),
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        object: activity.object
      };
    }

    throw new Error('Tipo di attività non supportato');
  } catch (error) {
    console.error('Errore nella pubblicazione dell\'attività:', error);
    throw error;
  }
};

// Endpoint per i follower
export const handleFollowers = async (gun, DAPP_NAME, username) => {
  const followers = await gun
    .get(DAPP_NAME)
    .get('activitypub')
    .get(username)
    .get('followers')
    .then(data => {
      if (!data) return [];
      return Object.keys(data).map(key => ({
        id: key,
        ...data[key]
      }));
    });

  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: 'OrderedCollection',
    totalItems: followers.length,
    items: followers
  };
};

// Endpoint per i following
export const handleFollowing = async (gun, DAPP_NAME, username) => {
  const following = await gun
    .get(DAPP_NAME)
    .get('activitypub')
    .get(username)
    .get('following')
    .then(data => {
      if (!data) return [];
      return Object.keys(data).map(key => ({
        id: key,
        ...data[key]
      }));
    });

  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: 'OrderedCollection',
    totalItems: following.length,
    items: following
  };
};