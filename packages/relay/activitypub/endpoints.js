import fetch from 'node-fetch';
import crypto from 'crypto';
import { createHash } from 'crypto';
import { getUserActivityPubKeys } from '../index.js';

// Endpoint per il profilo utente (actor)
export const handleActorEndpoint = async (gun, DAPP_NAME, username) => {
  try {
    // Recupera le chiavi dell'utente
    const keys = await getUserActivityPubKeys(gun, username);
    
    // Recupera il profilo ActivityPub
    const actorData = await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get('activitypub')
        .get(username)
        .once((data) => {
          if (!data) {
            reject(new Error('Profilo non trovato'));
          } else {
            resolve(data);
          }
        });
    });

    // Se abbiamo trovato il profilo, aggiungiamo la chiave pubblica
    if (actorData) {
      return {
        ...actorData,
        publicKey: {
          id: `${actorData.id}#main-key`,
          owner: actorData.id,
          publicKeyPem: keys.publicKey
        }
      };
    }

    // Se non abbiamo trovato il profilo, creiamo uno di default
    const defaultActor = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'Person',
      id: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}`,
      following: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/following`,
      followers: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/followers`,
      inbox: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/inbox`,
      outbox: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/outbox`,
      preferredUsername: username,
      name: username,
      summary: `Profilo ActivityPub di ${username}`,
      url: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}`,
      published: new Date().toISOString(),
      publicKey: {
        id: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}#main-key`,
        owner: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}`,
        publicKeyPem: keys.publicKey
      }
    };

    return defaultActor;
  } catch (error) {
    console.error('Errore nel recupero del profilo ActivityPub:', error);
    throw error;
  }
};

// Endpoint per l'inbox
export const handleInbox = async (gun, DAPP_NAME, username, activity) => {
  try {
    // Verifica che l'attività sia definita e valida
    if (!activity || typeof activity !== 'object' || Array.isArray(activity)) {
      throw new Error('Attività non valida: deve essere un oggetto');
    }

    if (!activity.type) {
      throw new Error('Tipo di attività mancante');
    }

    // Crea un ID univoco per l'attività
    const activityId = activity.id || `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/inbox/${Date.now()}`;

    // Costruisci l'attività arricchita
    const enrichedActivity = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: activityId,
      type: activity.type,
      received_at: new Date().toISOString(),
      ...activity
    };

    // Salva l'attività nell'inbox
    await gun
      .get(DAPP_NAME)
      .get('activitypub')
      .get(username)
      .get('inbox')
      .get(activityId)
      .put(enrichedActivity);

    // Gestione specifica per Follow
    if (activity.type === 'Follow' && activity.actor) {
      await gun
        .get(DAPP_NAME)
        .get('activitypub')
        .get(username)
        .get('followers')
        .get(activity.actor)
        .put({
          id: activity.actor,
          followed_at: new Date().toISOString()
        });
    }

    return { success: true, activity: enrichedActivity };
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
    const digest = createHash('sha256').update(request.body).digest('base64');
    
    const headersToSign = [
      '(request-target)',
      'host',
      'date',
      'digest',
      'content-type'
    ];

    const signatureParams = headersToSign
      .map(header => {
        let value;
        if (header === '(request-target)') {
          value = `${request.method.toLowerCase()} ${url.pathname}`;
        } else {
          value = request.headers[header];
        }
        return `${header}: ${value}`;
      })
      .join('\n');

    const signature = crypto
      .createSign('sha256')
      .update(signatureParams)
      .sign(keys.privateKey, 'base64');

    const signatureHeader = [
      `keyId="${keyId}"`,
      'algorithm="rsa-sha256"',
      `headers="${headersToSign.join(' ')}"`,
      `signature="${signature}"`
    ].join(',');

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

    // Gestione specifica per Create (Note)
    if (activity.type === 'Create' && activity.object?.type === 'Note') {
      if (!activity.object.content) {
        throw new Error('Content mancante per la nota');
      }

      // Salva il post
      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get('posts')
          .get(timestamp.toString())
          .put({
            content: activity.object.content,
            author: username,
            timestamp: timestamp
          }, (ack) => {
            if (ack.err) {
              reject(new Error(ack.err));
            } else {
              resolve(ack);
            }
          });
      });

      // Restituisci una versione ActivityPub-compatibile per la risposta HTTP
      return {
        '@context': ['https://www.w3.org/ns/activitystreams'],
        id: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/activities/${timestamp}`,
        type: 'Create',
        actor: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}`,
        published: new Date(timestamp).toISOString(),
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        object: {
          type: 'Note',
          content: activity.object.content,
          id: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/posts/${timestamp}`,
          published: new Date(timestamp).toISOString(),
          attributedTo: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}`
        }
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
        id: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/activities/${timestamp}`,
        type: 'Follow',
        actor: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}`,
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
        const keyId = `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}#main-key`;
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
        id: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/activities/${timestamp}`,
        type: 'Follow',
        actor: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}`,
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