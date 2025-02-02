import fetch from 'node-fetch';
import crypto from 'crypto';
import { createHash } from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Ottieni l'equivalente di __dirname per ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carica le variabili d'ambiente dal file .env nella cartella relay
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Verifica e usa le variabili d'ambiente
const BASE_URL = process.env.BASE_URL || 'https://gun-relay.scobrudot.dev';
const DAPP_NAME = process.env.DAPP_NAME || 'linda-messenger';

if (!BASE_URL || !DAPP_NAME) {
  console.error('Errore: Variabili d\'ambiente mancanti:', {
    BASE_URL: BASE_URL || 'mancante',
    DAPP_NAME: DAPP_NAME || 'mancante'
  });
  throw new Error('Configurazione incompleta: BASE_URL e DAPP_NAME sono richiesti');
}

console.log('Inizializzazione endpoints con:', {
  BASE_URL,
  DAPP_NAME
});

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
    console.log('Gestione attività:', {
      type: activity.type,
      actor: activity.actor,
      object: activity.object,
      username
    });

    const handler = this.handlers.get(activity.type);
    if (!handler) {
      throw new Error(`Handler non trovato per il tipo di attività: ${activity.type}`);
    }

    try {
      return await handler(activity, username, this.gun, this.DAPP_NAME);
    } catch (error) {
      console.error('Errore nella gestione dell\'attività:', error);
      throw error;
    }
  }
}

// Crea l'event handler globale
const eventHandler = new ActivityPubEventHandler(null, null);

// Registra gli handler per i vari tipi di attività
eventHandler
  .on('Follow', async (activity, username, gun, DAPP_NAME) => {
    console.log('Gestione Follow:', { activity, username });

    if (!activity.actor || !activity.object) {
      throw new Error('Attività Follow non valida: mancano actor o object');
    }

    try {
      // Crea l'attività Accept
      const acceptActivity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'Accept',
        actor: `${BASE_URL}/users/${username}`,
        object: activity,
        id: `${BASE_URL}/users/${username}/activities/${Date.now()}`,
        published: new Date().toISOString()
      };

      // Salva il follower
      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get('activitypub')
          .get(username)
          .get('followers')
          .get(activity.actor)
          .put({
            id: activity.actor,
            followed_at: new Date().toISOString(),
            status: 'accepted'
          }, (ack) => {
            if (ack.err) reject(new Error(ack.err));
            else resolve();
          });
      });

      // Prepara l'invio dell'Accept
      const targetInbox = new URL(activity.actor).origin + '/inbox';
      const body = JSON.stringify(acceptActivity);
      const digest = `SHA-256=${createHash('sha256').update(body).digest('base64')}`;
      const date = new Date().toUTCString();
      const targetHost = new URL(targetInbox).host;

      const headers = {
        'Content-Type': 'application/activity+json',
        'Accept': 'application/activity+json',
        'Date': date,
        'Host': targetHost,
        'Digest': digest
      };

      // Firma la richiesta
      const keyId = `${BASE_URL}/users/${username}#main-key`;
      const signature = await signRequest({
        method: 'POST',
        url: targetInbox,
        headers,
        body
      }, keyId, username, gun, DAPP_NAME);

      headers['Signature'] = signature;

      console.log('Invio Accept con:', {
        url: targetInbox,
        headers,
        body: acceptActivity
      });

      // Invia l'Accept
      const response = await fetch(targetInbox, {
        method: 'POST',
        headers,
        body
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Errore risposta Accept:', {
          status: response.status,
          body: errorText,
          headers: response.headers
        });
        throw new Error(`Errore nell'invio dell'Accept: ${response.statusText} - ${errorText}`);
      }

      return { success: true, activity: acceptActivity };
    } catch (error) {
      console.error('Errore nella gestione del Follow:', error);
      throw error;
    }
  })
  .on('Accept', async (activity, username, gun, DAPP_NAME) => {
    console.log('Gestione Accept:', { activity, username });

    if (!activity.object || activity.object.type !== 'Follow') {
      throw new Error('Attività Accept non valida');
    }

    try {
      // Aggiorna lo stato del following
      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get('activitypub')
          .get(username)
          .get('following')
          .get(activity.actor)
          .put({
            id: activity.actor,
            accepted_at: new Date().toISOString(),
            status: 'accepted'
          }, (ack) => {
            if (ack.err) reject(new Error(ack.err));
            else resolve();
          });
      });

      return { success: true };
    } catch (error) {
      console.error('Errore nella gestione dell\'Accept:', error);
      throw error;
    }
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
    console.log('Gestione attività in arrivo:', {
      type: activity.type,
      actor: activity.actor,
      object: activity.object
    });

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

// Funzione per salvare le chiavi ActivityPub
async function saveUserActivityPubKeys(gun, username) {
  if (!gun || !username || !DAPP_NAME) {
    throw new Error('Parametri mancanti per il salvataggio delle chiavi');
  }

  console.log('Salvataggio chiavi per:', {
    username,
    DAPP_NAME
  });

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  return new Promise((resolve, reject) => {
    gun.get(DAPP_NAME)
      .get('activitypub')
      .get(username)
      .get('keys')
      .put({
        publicKey: publicKey.toString(),
        privateKey: privateKey.toString()
      }, async (ack) => {
        if (ack.err) {
          console.error('Errore nel salvataggio delle chiavi:', {
            error: ack.err,
            username,
            DAPP_NAME
          });
          reject(new Error(`Errore nel salvataggio delle chiavi: ${ack.err}`));
        } else {
          console.log('Chiavi salvate con successo:', {
            username,
            DAPP_NAME,
            publicKeyStart: publicKey.toString().substring(0, 50) + '...'
          });
          resolve({ publicKey, privateKey });
        }
      });
  });
}

// Funzione per recuperare le chiavi ActivityPub
async function getUserActivityPubKeys(gun, username) {
  if (!gun || !username || !DAPP_NAME) {
    throw new Error('Parametri mancanti per il recupero delle chiavi');
  }

  console.log('Recupero chiavi per:', {
    username,
    DAPP_NAME
  });

  return new Promise((resolve, reject) => {
    gun.get(DAPP_NAME)
      .get('activitypub')
      .get(username)
      .get('keys')
      .once(async (data) => {
        if (!data || !data.publicKey || !data.privateKey) {
          console.log('Chiavi non trovate, generazione nuove chiavi...', {
            username,
            DAPP_NAME
          });
          try {
            const newKeys = await saveUserActivityPubKeys(gun, username);
            resolve(newKeys);
          } catch (error) {
            console.error('Errore nella generazione delle chiavi:', {
              error: error.message,
              username,
              DAPP_NAME
            });
            reject(error);
          }
        } else {
          console.log('Chiavi recuperate:', {
            username,
            DAPP_NAME,
            publicKeyStart: data.publicKey.substring(0, 50) + '...'
          });
          resolve({
            publicKey: data.publicKey,
            privateKey: data.privateKey
          });
        }
      });
  });
}

// Funzione per firmare una richiesta ActivityPub
async function signRequest(requestData, keyId, username, gun, DAPP_NAME) {
  try {
    console.log('Generazione firma per la richiesta:', {
      method: requestData.method,
      url: requestData.url,
      headers: requestData.headers,
      keyId,
      username,
      DAPP_NAME
    });

    // Recupera le chiavi dal database
    const keys = await getUserActivityPubKeys(gun, username);

    if (!keys || !keys.privateKey) {
      throw new Error('Chiavi non valide');
    }

    console.log('Chiavi recuperate:', {
      privateKeyStart: keys.privateKey.substring(0, 50) + '...',
      publicKeyStart: keys.publicKey.substring(0, 50) + '...'
    });

    const url = new URL(requestData.url);
    const date = requestData.headers.date;
    const digest = requestData.headers.digest;
    const contentType = requestData.headers['content-type'] || 'application/activity+json';
    
    // Prepara gli headers da firmare in ordine specifico
    const signedString = [
      `(request-target): ${requestData.method.toLowerCase()} ${url.pathname}`,
      `host: ${requestData.headers.host}`,
      `date: ${date}`,
      `digest: ${digest}`,
      `content-type: ${contentType}`
    ].join('\n');

    console.log('Stringa da firmare:', signedString);

    // Genera la firma
    const signer = crypto.createSign('sha256');
    signer.write(signedString);
    signer.end();

    const signature = signer.sign({
      key: keys.privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING
    });
    const signature_b64 = signature.toString('base64');

    console.log('Firma generata (base64):', signature_b64);

    // Verifica la firma generata
    const verifier = crypto.createVerify('sha256');
    verifier.write(signedString);
    verifier.end();

    const isValid = verifier.verify({
      key: keys.publicKey,
      padding: crypto.constants.RSA_PKCS1_PADDING
    }, signature);

    if (!isValid) {
      throw new Error('Verifica della firma fallita');
    }

    console.log('Verifica firma:', isValid);

    // Costruisci l'header Signature
    const signatureHeader = [
      `keyId="${keyId}"`,
      'algorithm="rsa-sha256"',
      'headers="(request-target) host date digest content-type"',
      `signature="${signature_b64}"`
    ].join(',');

    console.log('Header Signature completo:', signatureHeader);

    return signatureHeader;
  } catch (error) {
    console.error('Errore nella generazione della firma:', error);
    throw error;
  }
}

// Funzione per deserializzare i dati da Gun
function deserializeFromGun(data) {
  if (!data) return null;
  
  const result = { ...data };
  
  // Rimuovi i metadati di Gun
  delete result._;
  delete result['#'];
  delete result['>'];
  
  // Deserializza i campi che sono stringhe JSON
  ['to', 'cc', 'attachment', 'tag'].forEach(field => {
    if (typeof result[field] === 'string') {
      try {
        result[field] = JSON.parse(result[field]);
      } catch (e) {
        console.warn(`Errore nella deserializzazione del campo ${field}:`, e);
        result[field] = [];
      }
    }
  });
  
  // Se l'oggetto ha un campo 'object' che è una stringa, prova a deserializzarlo
  if (typeof result.object === 'string') {
    try {
      result.object = JSON.parse(result.object);
    } catch (e) {
      console.warn('Errore nella deserializzazione dell\'oggetto:', e);
    }
  }
  
  return result;
}

// Modifica nella funzione handleOutbox
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
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        cc: [],
        sensitive: activity.object.sensitive || false,
        summary: activity.object.summary || null,
        attachment: activity.object.attachment || [],
        tag: activity.object.tag || []
      };

      // Crea l'attività ActivityPub
      const createActivity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: activityId,
        type: 'Create',
        actor: `${BASE_URL}/users/${username}`,
        published: new Date(timestamp).toISOString(),
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        cc: [],
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

      console.log('Target server:', targetServer);
      console.log('Target actor URL:', targetActor);

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
      
      // Usa direttamente /inbox invece di /users/{username}/inbox
      const inboxUrl = `${targetServer}/inbox`;
      
      const headers = {
        'Content-Type': 'application/activity+json',
        'Accept': 'application/activity+json',
        'Date': date,
        'Host': new URL(targetServer).host,
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
            host: new URL(targetServer).host,
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
            body: errorText,
            inboxUrl
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

        // Salva anche lo stato del following
        await new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get('activitypub')
            .get(username)
            .get('following')
            .get(targetActor)
            .put({
              id: targetActor,
              status: 'pending',
              requested_at: new Date().toISOString()
            }, (ack) => {
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
          body,
          inboxUrl
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
  try {
    console.log('Recupero followers per:', username);

    const followers = await new Promise((resolve) => {
      const followersArray = [];
      gun
        .get(DAPP_NAME)
        .get('activitypub')
        .get(username)
        .get('followers')
        .map()
        .once((data, key) => {
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            // Rimuovi i metadati di Gun
            const cleanData = { ...data };
            delete cleanData._ 
            delete cleanData['#'];
            delete cleanData['>'];
            
            if (Object.keys(cleanData).length > 0) {
              followersArray.push(cleanData);
            }
          }
        });

      // Aspetta un po' per raccogliere i dati
      setTimeout(() => resolve(followersArray), 100);
    });

    console.log('Followers recuperati:', followers);

    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'OrderedCollection',
      totalItems: followers.length,
      orderedItems: followers
    };
  } catch (error) {
    console.error('Errore nel recupero dei followers:', error);
    throw error;
  }
};

// Endpoint per i following
export const handleFollowing = async (gun, DAPP_NAME, username) => {
  try {
    console.log('Recupero following per:', username);

    const following = await new Promise((resolve) => {
      const followingArray = [];
      gun
        .get(DAPP_NAME)
        .get('activitypub')
        .get(username)
        .get('following')
        .map()
        .once((data, key) => {
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            // Rimuovi i metadati di Gun
            const cleanData = { ...data };
            delete cleanData._ 
            delete cleanData['#'];
            delete cleanData['>'];
            
            if (Object.keys(cleanData).length > 0) {
              followingArray.push(cleanData);
            }
          }
        });

      // Aspetta un po' per raccogliere i dati
      setTimeout(() => resolve(followingArray), 100);
    });

    console.log('Following recuperati:', following);

    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'OrderedCollection',
      totalItems: following.length,
      orderedItems: following
    };
  } catch (error) {
    console.error('Errore nel recupero dei following:', error);
    throw error;
  }
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

// Funzione per gestire il follow
async function handleFollowActivity(gun, activity, username) {
  try {
    console.log('Gestione follow activity:', {
      activity,
      username
    });

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
      id: `${BASE_URL}/users/${username}/activities/${Date.now()}`,
      published: new Date().toISOString()
    };

    // Recupera le chiavi
    const keys = await getUserActivityPubKeys(gun, username);
    if (!keys || !keys.privateKey) {
      throw new Error('Chiavi non trovate per la firma');
    }

    // Salva la relazione di follow
    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get('activitypub')
        .get(username)
        .get('followers')
        .get(activity.actor)
        .put({
          id: activity.actor,
          followed_at: new Date().toISOString(),
          status: 'accepted'
        }, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });

    // Invia l'Accept al follower
    const followerInbox = new URL(activity.actor).origin + '/inbox';
    const body = JSON.stringify(acceptActivity);
    const digest = `SHA-256=${createHash('sha256').update(body).digest('base64')}`;
    const date = new Date().toUTCString();

    const headers = {
      'Content-Type': 'application/activity+json',
      'Accept': 'application/activity+json',
      'Date': date,
      'Host': new URL(followerInbox).host,
      'Digest': digest
    };

    // Firma la richiesta
    const keyId = `${BASE_URL}/users/${username}#main-key`;
    const signature = await signRequest({
      method: 'POST',
      url: followerInbox,
      headers,
      body
    }, keyId, username, gun, DAPP_NAME);

    headers['Signature'] = signature;

    console.log('Invio Accept con headers:', headers);

    // Invia la risposta
    const response = await fetch(followerInbox, {
      method: 'POST',
      headers,
      body
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Errore nella risposta Accept:', {
        status: response.status,
        body: errorText
      });
      throw new Error(`Errore nell'invio dell'Accept: ${response.statusText} - ${errorText}`);
    }

    return { success: true, activity: acceptActivity };
  } catch (error) {
    console.error('Errore nella gestione del follow:', error);
    throw error;
  }
}

// Aggiungi l'endpoint webfinger
export const handleWebfinger = async (resource) => {
  if (!resource) {
    throw new Error('Resource parameter required');
  }

  const [, username] = resource.split(':');
  const [handle] = username.split('@');

  return {
    subject: resource,
    links: [{
      rel: 'self',
      type: 'application/activity+json',
      href: `${BASE_URL}/users/${handle}`
    }]
  };
};

// Modifica nella funzione serializeForGun
function serializeForGun(data) {
  if (Array.isArray(data)) {
    return JSON.stringify(data);
  } else if (typeof data === 'object' && data !== null) {
    const serialized = {};
    for (const [key, value] of Object.entries(data)) {
      if (key === '_' || key === '#' || key === '>') continue; // Salta i metadati di Gun
      if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
        serialized[key] = JSON.stringify(value);
      } else {
        serialized[key] = value;
      }
    }
    return serialized;
  }
  return data;
}

