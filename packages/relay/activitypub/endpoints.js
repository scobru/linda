import fetch from 'node-fetch';
import crypto from 'crypto';
import { createHash } from 'crypto';
import dotenv from 'dotenv';

// Carica le variabili d'ambiente
dotenv.config();

// Usa l'URL dal file .env o un default
const BASE_URL = process.env.BASE_URL || "http://localhost:8765";

// Funzione di validazione per le attività ActivityPub
function validateActivity(activity) {
  // Verifica la presenza dei campi obbligatori
  if (!activity['@context']) {
    throw new Error('Campo @context mancante');
  }

  if (!activity.type) {
    throw new Error('Campo type mancante');
  }

  if (!activity.actor) {
    throw new Error('Campo actor mancante');
  }

  // Verifica il formato degli URL, escludendo l'object per le Note
  const urlFields = ['actor', 'target'].filter(field => activity[field]);
  if (activity.type !== 'Create' || (activity.object && activity.object.type !== 'Note')) {
    if (activity.object && typeof activity.object === 'string') {
      urlFields.push('object');
    }
  }

  for (const field of urlFields) {
    try {
      new URL(activity[field]);
    } catch (error) {
      throw new Error(`URL non valido per il campo ${field}`);
    }
  }

  // Validazione specifica per tipo di attività
  switch (activity.type) {
    case 'Create':
      if (!activity.object || typeof activity.object !== 'object') {
        throw new Error('Campo object mancante o non valido per Create');
      }
      if (!activity.object.type) {
        throw new Error('Tipo oggetto mancante per Create');
      }
      if (activity.object.type === 'Note' && !activity.object.content) {
        throw new Error('Content mancante per Note');
      }
      break;

    case 'Follow':
      if (!activity.object || typeof activity.object !== 'string') {
        throw new Error('Campo object mancante o non valido per Follow');
      }
      break;

    case 'Like':
    case 'Announce':
      if (!activity.object) {
        throw new Error(`Campo object mancante per ${activity.type}`);
      }
      break;

    case 'Accept':
      if (!activity.object || !activity.object.type) {
        throw new Error('Campo object non valido per Accept');
      }
      break;

    case 'Undo':
      if (!activity.object || !activity.object.type) {
        throw new Error('Campo object non valido per Undo');
      }
      break;
  }

  return true;
}

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

// Funzione per verificare la firma di una richiesta ActivityPub
async function verifySignature(req, publicKey) {
  try {
    const signature = req.headers.signature;
    if (!signature) {
      throw new Error('Firma mancante');
    }

    console.log('Verifica firma:', {
      signature,
      headers: req.headers,
      path: req.path,
      method: req.method
    });

    // Parsing dell'header Signature
    const sigParts = {};
    signature.split(',').forEach(part => {
      const [key, value] = part.split('=');
      sigParts[key.trim()] = value.replace(/^"/, '').replace(/"$/, '');
    });

    if (!sigParts.headers || !sigParts.signature) {
      throw new Error('Formato firma non valido');
    }

    console.log('Parti firma:', sigParts);

    // Costruisci la stringa da verificare
    const signedHeaders = sigParts.headers.split(' ');
    const signedString = signedHeaders
      .map(header => {
        if (header === '(request-target)') {
          return `(request-target): ${req.method.toLowerCase()} ${req.path}`;
        }
        return `${header}: ${req.headers[header.toLowerCase()]}`;
      })
      .join('\n');

    console.log('Stringa da verificare:', signedString);

    // Verifica la firma
    const verifier = crypto.createVerify('sha256');
    verifier.update(signedString);
    verifier.end();

    const isValid = verifier.verify(
      publicKey,
      Buffer.from(sigParts.signature, 'base64')
    );

    console.log('Risultato verifica:', isValid);

    if (!isValid) {
      throw new Error('Firma non valida');
    }

    return true;
  } catch (error) {
    console.error('Errore nella verifica della firma:', error);
    throw error;
  }
}

// Funzione per recuperare la chiave pubblica di un attore remoto
async function fetchActorPublicKey(actorUrl) {
  try {
    const response = await fetch(actorUrl, {
      headers: { 'Accept': 'application/activity+json' }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const actor = await response.json();
    if (!actor.publicKey?.publicKeyPem) {
      throw new Error('Chiave pubblica non trovata nel profilo attore');
    }

    return actor.publicKey.publicKeyPem;
  } catch (error) {
    console.error('Errore nel recupero della chiave pubblica:', error);
    throw error;
  }
}

// Modifica nella funzione handleInbox per verificare le firme
export const handleInbox = async (gun, DAPP_NAME, username, activity, req) => {
  try {
    // Valida l'attività in arrivo
    validateActivity(activity);

    // Verifica la firma se presente
    if (req?.headers?.signature) {
      const actorPublicKey = await fetchActorPublicKey(activity.actor);
      await verifySignature(req, actorPublicKey);
    }

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

// Funzione per firmare una richiesta ActivityPub
async function signRequest(requestData, keyId, username, gun) {
  let headers = [];
  let body;

  try {
    const { privateKey } = await getUserKeys(gun, username);
    
    body = JSON.stringify(requestData.body, Object.keys(requestData.body).sort());
    const digest = crypto.createHash('sha256')
      .update(body)
      .digest('base64');

    const url = new URL(requestData.url);
    const path = `${url.pathname}${url.search}`.replace(/\/{2,}/g, '/');

    headers = [
      `(request-target): post ${path}`,
      `host: ${url.hostname}`,
      `date: ${new Date().toUTCString()}`,
      `digest: SHA-256=${digest}`,
      `content-type: ${requestData.headers['Content-Type']}`
    ].map(h => h.toLowerCase());

    // 4. Firma con codifica esplicita
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(headers.join('\n'));
    const signature = signer.sign({
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
    }, 'base64');

    // 5. Verifica sincrona con chiave pubblica
    const publicKey = crypto.createPublicKey(privateKey);
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(headers.join('\n'));
    
    if (!verifier.verify(publicKey, signature, 'base64')) {
      throw new Error('Verifica locale fallita');
    }

    // 6. Formattazione header RFC 9421
    return [
      `keyId="${keyId}"`,
      `algorithm="rsa-sha256"`,
      `headers="(request-target) host date digest content-type"`,
      `signature="${signature}"`
    ].join(', ');

  } catch (error) {
    console.error('Dettagli errore firma:', {
      headers,
      digest: body ? crypto.createHash('sha256').update(body).digest('base64') : 'N/A',
      publicKey: (await getUserKeys(gun, username))?.publicKey?.substring(0, 50) + '...',
      error: error.stack
    });
    throw new Error(`Errore di firma: ${error.message}`);
  }
}

// Funzione per serializzare i dati per Gun
function serializeForGun(data) {
  if (Array.isArray(data)) {
    return JSON.stringify(data);
  } else if (typeof data === 'object' && data !== null) {
    const serialized = {};
    for (const [key, value] of Object.entries(data)) {
      serialized[key] = serializeForGun(value);
    }
    return serialized;
  }
  return data;
}

// Endpoint per l'outbox
export const handleOutbox = async (gun, DAPP_NAME, username, activity) => {
  try {
    // Valida l'attività in uscita
    validateActivity(activity);

    // Crea un ID univoco per l'attività
    const timestamp = Date.now();
    const activityId = `${BASE_URL}/users/${username}/activities/${timestamp}`;

    // Gestione specifica per Create (Note)
    if (activity.type === 'Create' && activity.object?.type === 'Note') {
      console.log('Gestione creazione nota:', activity);

      if (!activity.object.content) {
        throw new Error('Content mancante per la nota');
      }

      // Crea l'oggetto post con una struttura più completa
      const post = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: `${BASE_URL}/users/${username}/posts/${timestamp}`,
        type: 'Note',
        attributedTo: `${BASE_URL}/users/${username}`,
        content: activity.object.content,
        published: new Date(timestamp).toISOString(),
        to: JSON.stringify(['https://www.w3.org/ns/activitystreams#Public']),
        cc: JSON.stringify([]),
        sensitive: activity.object.sensitive || false,
        summary: activity.object.summary || null,
        attachment: JSON.stringify(activity.object.attachment || []),
        tag: JSON.stringify(activity.object.tag || [])
      };

      // Crea l'attività ActivityPub
      const createActivity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: activityId,
        type: 'Create',
        actor: `${BASE_URL}/users/${username}`,
        published: new Date(timestamp).toISOString(),
        to: JSON.stringify(['https://www.w3.org/ns/activitystreams#Public']),
        cc: JSON.stringify([]),
        object: serializeForGun(post)
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
            .put(serializeForGun(post), (ack) => {
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
            .put(serializeForGun(createActivity), (ack) => {
              if (ack.err) {
                console.error('Errore nel salvataggio dell\'attività:', ack.err);
                reject(new Error(ack.err));
              } else {
                console.log('Attività salvata con successo');
                resolve(ack);
              }
            });
        });

        // Restituisci l'attività originale (non serializzata) per la risposta HTTP
        return {
          ...createActivity,
          to: ['https://www.w3.org/ns/activitystreams#Public'],
          cc: [],
          object: {
            ...post,
            to: ['https://www.w3.org/ns/activitystreams#Public'],
            cc: [],
            attachment: activity.object.attachment || [],
            tag: activity.object.tag || []
          }
        };
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
      const digest = `SHA-256=${createHash('sha256').update(body).digest('base64')}`;
      const date = new Date().toUTCString();
      const targetHost = new URL(targetServer).host;
      const inboxUrl = `${targetServer}/users/${targetUsername}/inbox`;
      
      const headers = {
        'Content-Type': 'application/activity+json',
        'Accept': 'application/activity+json',
        'Date': date,
        'Host': targetHost,
        'Digest': digest
      };

      // Firma la richiesta
      const keyId = `${BASE_URL}/users/${username}#main-key`;
      try {
        console.log('Preparazione firma con:', {
          method: 'POST',
          url: inboxUrl,
          headers,
          keyId,
          username,
          DAPP_NAME
        });

        const signature = await signRequest({
          method: 'POST',
          url: inboxUrl,
          headers: {
            ...headers,
            date: date,
            host: targetHost,
            digest: digest
          },
          body
        }, keyId, username, gun, DAPP_NAME);

        headers['Signature'] = signature;

        console.log('Headers completi per la richiesta:', headers);

        // Invia la richiesta
        const response = await fetch(inboxUrl, {
          method: 'POST',
          headers,
          body
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Risposta errore dal server:', {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body: errorText
          });
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
        console.error('Errore dettagliato nella richiesta follow:', {
          error: error.message,
          stack: error.stack,
          headers,
          body
        });
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

// Modifica nella funzione getUserKeys
async function getUserKeys(gun, username) {
  return new Promise((resolve, reject) => {
    gun.get('linda-messenger')
      .get('activitypub')
      .get(username)
      .get('keys')
      .once(async (data) => {
        if (!data) {
          console.error('Chiavi non trovate per:', username);
          return reject(new Error('Chiavi non trovate nel database'));
        }
        
        // Pulizia approfondita dei metadati GUN
        const sanitizedKeys = JSON.parse(JSON.stringify({
          privateKey: data.privateKey,
          publicKey: data.publicKey
        }));

        if (!sanitizedKeys.privateKey?.includes('BEGIN PRIVATE KEY') || 
            !sanitizedKeys.publicKey?.includes('BEGIN PUBLIC KEY')) {
          console.error('Chiavi corrotte per:', username, sanitizedKeys);
          return reject(new Error('Formato chiavi non valido'));
        }

        resolve(sanitizedKeys);
      });
  });
}

// Aggiornamento nella gestione del follow
async function handleFollowActivity(gun, activity) {
  try {
    const targetUser = activity.object.split('/users/')[1];
    const followerKey = await getUserKeys(gun, targetUser);

    // Verifica aggiuntiva della struttura delle chiavi
    if (!followerKey.publicKey || typeof followerKey.publicKey !== 'string') {
      throw new Error('Chiave pubblica non valida');
    }

    // Verifica la validità dell'attività
    if (!activity.actor || !activity.object) {
      throw new Error('Attività Follow non valida: mancano actor o object');
    }

    // Crea l'attività Accept
    const acceptActivity = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'Accept',
      actor: activity.object,
      object: activity,
      id: `${BASE_URL}/users/${targetUser}/activities/${Date.now()}`,
      published: new Date().toISOString()
    };

    // Salva la relazione di follow
    await gun
      .get(DAPP_NAME)
      .get('activitypub')
      .get(targetUser)
      .get('followers')
      .get(activity.actor)
      .put({
        id: activity.actor,
        followed_at: new Date().toISOString(),
        status: 'accepted'
      });

    // Invia l'Accept al follower
    const followerInbox = new URL(activity.actor).origin + '/inbox';
    const body = JSON.stringify(acceptActivity);
    const digest = createHash('sha256').update(body).digest('base64');

    const headers = {
      'Content-Type': 'application/activity+json',
      'Accept': 'application/activity+json',
      'Date': new Date().toUTCString(),
      'Host': new URL(followerInbox).host,
      'Digest': `SHA-256=${digest}`
    };

    // Firma la richiesta
    const keyId = `${BASE_URL}/users/${targetUser}#main-key`;
    headers['Signature'] = await signRequest({
      method: 'POST',
      url: followerInbox,
      headers,
      body
    }, keyId, targetUser, gun, DAPP_NAME);

    // Invia la risposta
    const response = await fetch(followerInbox, {
      method: 'POST',
      headers,
      body
    });

    if (!response.ok) {
      throw new Error(`Errore nell'invio dell'Accept: ${response.statusText}`);
    }

    return { success: true, activity: acceptActivity };
  } catch (error) {
    console.error('Errore nella gestione del follow:', error);
    throw error;
  }
}

