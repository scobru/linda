import fetch from 'node-fetch';
import crypto from 'crypto';
import { createHash } from 'crypto';
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
const eventHandler = new ActivityPubEventHandler(null, null, 'linda-messenger');

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
  }, keyId, username, gun, DAPP_NAME);

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
      publicKeyPem: keys.publicKey
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

// Modifica la funzione signRequest per gestire meglio il recupero delle chiavi
export async function signRequest(request, keyId, username, gun, DAPP_NAME) {
  try {
    console.log('Recupero chiavi per la firma...');
    console.log('Username:', username);
    console.log('DAPP_NAME:', DAPP_NAME);

    // Recupera le chiavi dal nodo corretto con un timeout
    const keys = await Promise.race([
      new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get('activitypub')
          .get(username)
          .get('keys')
          .once((data) => {
            console.log('Dati chiavi recuperati:', data);
            if (!data || !data.privateKey) {
              reject(new Error('Chiavi non trovate nel database'));
            } else {
              resolve(data);
            }
          });
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout nel recupero delle chiavi')), 10000)
      )
    ]);

    if (!keys || !keys.privateKey) {
      console.error('Chiavi mancanti:', keys);
      throw new Error('Chiavi non trovate o non valide');
    }

    console.log('Chiavi recuperate con successo');

    const url = new URL(request.url);
    
    // Normalizza il corpo della richiesta
    const bodyString = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    const digest = `SHA-256=${createHash('sha256').update(bodyString).digest('base64')}`;

    // Prepara gli headers in ordine corretto
    const date = new Date().toUTCString();
    const requestTarget = `${request.method.toLowerCase()} ${url.pathname}`;
    const host = url.host;

    // Costruisci la stringa da firmare
    const signString = [
      `(request-target): ${requestTarget}`,
      `host: ${host}`,
      `date: ${date}`,
      `digest: ${digest}`
    ].join('\n');

    console.log('Stringa da firmare:', signString);

    // Crea la firma
    const signer = crypto.createSign('sha256');
    signer.update(signString);
    const signature = signer.sign(keys.privateKey, 'base64');

    // Aggiungi gli headers necessari alla richiesta
    request.headers = {
      ...request.headers,
      'Host': host,
      'Date': date,
      'Digest': digest
    };

    // Costruisci l'header Signature
    const signatureHeader = [
      `keyId="${keyId}"`,
      'algorithm="rsa-sha256"',
      'headers="(request-target) host date digest"',
      `signature="${signature}"`
    ].join(',');

    console.log('Header Signature:', signatureHeader);
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
      console.log('Gestione creazione nota:', activity);

      if (!activity.object.content) {
        throw new Error('Content mancante per la nota');
      }

      // Crea l'oggetto post con una struttura più semplice
      const post = {
        id: `${BASE_URL}/users/${username}/posts/${timestamp}`,
        type: 'Note',
        attributedTo: `${BASE_URL}/users/${username}`,
        content: activity.object.content,
        published: new Date(timestamp).toISOString(),
        to: 'https://www.w3.org/ns/activitystreams#Public'
      };

      // Crea l'attività ActivityPub
      const createActivity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: activityId,
        type: 'Create',
        actor: `${BASE_URL}/users/${username}`,
        published: new Date(timestamp).toISOString(),
        to: 'https://www.w3.org/ns/activitystreams#Public',
        object: post
      };

      console.log('Salvataggio post:', post);
      console.log('Salvataggio attività:', createActivity);

      try {
        // Salva il post
        await new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get('posts')
            .get(post.id)
            .put(post, (ack) => {
              if (ack.err) {
                console.error('Errore nel salvataggio del post:', ack.err);
                reject(new Error(ack.err));
              } else {
                console.log('Post salvato con successo');
                resolve(ack);
              }
            });
        });

        // Salva l'attività nell'outbox
        await new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get('activitypub')
            .get(username)
            .get('outbox')
            .get(activityId)
            .put(createActivity, (ack) => {
              if (ack.err) {
                console.error('Errore nel salvataggio dell\'attività:', ack.err);
                reject(new Error(ack.err));
              } else {
                console.log('Attività salvata con successo');
                resolve(ack);
              }
            });
        });

        return createActivity;
      } catch (error) {
        console.error('Errore durante il salvataggio:', error);
        throw error;
      }
    }

    // Gestione specifica per Follow
    if (activity.type === 'Follow') {
      console.log('Gestione richiesta Follow:', activity);

      const targetActor = activity.object;
      if (!targetActor) {
        throw new Error('Target actor mancante nella richiesta di follow');
      }

      const targetUrl = new URL(targetActor);
      const targetServer = targetUrl.origin;
      const targetUsername = targetUrl.pathname.split('/').pop();

      console.log('Target server:', targetServer);
      console.log('Target username:', targetUsername);

      // Crea l'attività di follow
      const followActivity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: activityId,
        type: 'Follow',
        actor: `${BASE_URL}/users/${username}`,
        object: targetActor,
        published: new Date().toISOString()
      };

      // Prepara la richiesta
      const body = JSON.stringify(followActivity);
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
      try {
        const signature = await signRequest({
          method: 'POST',
          url: `${targetServer}/users/${targetUsername}/inbox`,
          headers,
          body
        }, keyId, username, gun, DAPP_NAME);

        if (signature) {
          headers['Signature'] = signature;
        }

        console.log('Invio richiesta follow con headers:', headers);

        // Invia la richiesta
        const response = await fetch(`${targetServer}/users/${targetUsername}/inbox`, {
          method: 'POST',
          headers,
          body
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to send follow request: ${response.statusText} - ${errorText}`);
        }

        // Salva l'attività localmente
        await new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get('activitypub')
            .get(username)
            .get('outbox')
            .get(activityId)
            .put(followActivity, (ack) => {
              if (ack.err) {
                reject(new Error(ack.err));
              } else {
                resolve(ack);
              }
            });
        });

        return followActivity;
      } catch (error) {
        console.error('Errore durante la firma o l\'invio della richiesta follow:', error);
        throw error;
      }
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

async function getUserActivityPubProfile(gun, username) {
  try {
    // ... codice esistente ...

    // Aggiungi la chiave pubblica al profilo
    actorData.publicKey = {
      id: `${BASE_URL}/users/${username}#main-key`,
      owner: `${BASE_URL}/users/${username}`,
      publicKeyPem: keys.publicKey  // Usa la chiave generata direttamente
    };

    return actorData;
  } catch (error) {
    console.error('Errore nel recupero del profilo ActivityPub:', error);
    throw error;
  }
}

// Modifica la funzione esistente
async function saveUserActivityPubKeys(gun, username) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  return new Promise((resolve, reject) => {
    // Salva le chiavi nel nodo utente principale
    gun.get('linda-messenger')
      .get('users')
      .get(username)
      .get('keys')
      .put({
        publicKey: publicKey.toString(),
        privateKey: privateKey.toString()
      }, async (ack) => {
        if (ack.err) {
          reject(new Error(`Errore nel salvataggio delle chiavi: ${ack.err}`));
        } else {
          console.log('Chiavi salvate nel nodo utente GUN');
          resolve({ publicKey, privateKey });
        }
      });
  });
}

async function getUserActivityPubKeys(gun, username) {
  return new Promise((resolve, reject) => {
    // Cerca le chiavi nel nodo utente principale
    gun.get('linda-messenger')
      .get('users')
      .get(username)
      .get('keys')
      .once(async (data) => {
        if (!data || !data.publicKey || !data.privateKey) {
          console.log('Chiavi non trovate, rigenerazione...');
          try {
            const newKeys = await saveUserActivityPubKeys(gun, username);
            resolve(newKeys);
          } catch (error) {
            reject(error);
          }
        } else {
          console.log('Chiavi recuperate dal nodo utente');
          resolve({
            publicKey: data.publicKey,
            privateKey: data.privateKey
          });
        }
      });
  });
}

async function sendFollowRequest(targetActor, username, gun) {
  try {
    console.log(`Inizio follow request verso: ${targetActor}`);
    
    // Verifica iniziale dell'esistenza delle chiavi
    let keys = await getUserActivityPubKeys(gun, username)
      .catch(async (error) => {
        console.log('Primo tentativo fallito, riprovo...', error.message);
        return await getUserActivityPubKeys(gun, username);
      });

    console.log('Chiavi utilizzate per la firma:', {
      publicKey: keys.publicKey.substring(0, 50) + '...'
    });

    // Costruisci l'attività Follow
    const followActivity = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'Follow',
      actor: `${BASE_URL}/users/${username}`,
      object: targetActor
    };

    // Firma e invia la richiesta
    const signature = await signRequest({
      method: 'POST',
      url: `${targetActor}/inbox`,
      body: followActivity
    }, `${BASE_URL}/users/${username}#main-key`, username, gun);

    const response = await fetch(`${targetActor}/inbox`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/activity+json',
        'Signature': signature
      },
      body: JSON.stringify(followActivity)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Follow request failed with status ${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Errore dettagliato:', {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Modifica nella funzione saveUserProfile
async function saveUserProfile(gun, username, profileData) {
  try {
    // Converti il contesto in stringa in modo sicuro
    const context = Array.isArray(profileData['@context']) 
      ? profileData['@context'].join(', ')
      : String(profileData['@context'] || '');

    // Crea un clone dell'oggetto per evitare mutazioni
    const sanitizedProfile = {...profileData};
    delete sanitizedProfile._;
    delete sanitizedProfile['#'];
    
    // Assegna il contesto convertito
    sanitizedProfile['@context'] = context;

    // Salva con struttura piatta
    await new Promise((resolve, reject) => {
      gun.get('linda-messenger')
        .get('activitypub')
        .get(username)
        .put(sanitizedProfile, (ack) => {
          if (ack.err) {
            reject(new Error(`Dati non validi: ${ack.err}`));
          } else {
            console.log('Profilo salvato con contesto:', context.substring(0, 50) + '...');
            resolve();
          }
        });
    });

    return sanitizedProfile;
  } catch (error) {
    console.error('Errore di serializzazione:', {
      originalContext: profileData['@context'],
      error: error.message
    });
    throw new Error(`Errore nel salvataggio del profilo: ${error.message}`);
  }
}

// Aggiungi questa validazione prima di creare il profilo
function validateActivityPubProfile(profile) {
  if (!profile['@context']) {
    throw new Error('Contesto ActivityPub mancante');
  }
  
  if (typeof profile['@context'] !== 'string') {
    throw new Error('Formato contesto non valido. Atteso stringa');
  }

  if (!profile.id || !profile.id.startsWith('http')) {
    throw new Error('ID profilo non valido');
  }
}

// Modifica nella funzione verifyActorEndpoint
async function verifyActorEndpoint(url) {
  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/activity+json' }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const profile = await response.json();
    const cleanedProfile = sanitizeProfile(profile);

    // Validazione essenziale
    const requiredFields = ['@context', 'id', 'type', 'preferredUsername', 'publicKey'];
    const missingFields = requiredFields.filter(field => !cleanedProfile[field]);

    if (missingFields.length > 0) {
      throw new Error(`Campi mancanti: ${missingFields.join(', ')}`);
    }

    if (cleanedProfile.type !== 'Person') {
      throw new Error('Tipo profilo non valido');
    }

    return cleanedProfile;
  } catch (error) {
    console.error('Dettagli errore validazione:', {
      error: error.message,
      stack: error.stack
    });
    throw new Error(`Profilo non valido: ${error.message}`);
  }
}

