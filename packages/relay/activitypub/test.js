import fetch from "node-fetch";
import Gun from "gun";
import "gun/sea.js";
import { generateKeyPairSync } from "crypto";
import dotenv from 'dotenv';
import crypto from 'crypto';
import { createHash } from 'crypto';

// Carica le variabili d'ambiente
dotenv.config();

// Usa sempre il server locale per i test
const BASE_URL = "https://gun-relay.scobrudot.dev";
const TEST_USERNAME = "scobru_test3";
const TEST_PASSWORD = "test12345678";

function generateActivityPubKeys() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  console.log("Chiave pubblica generata:", publicKey);
  console.log("Chiave privata generata:", privateKey);

  return {
    privateKey,
    publicKey,
  };
}

async function saveUserActivityPubKeys(gun, username) {
  const keys = generateActivityPubKeys();

  return new Promise((resolve, reject) => {
    // Prima verifichiamo se l'utente è autenticato
    if (!gun.user().is) {
      reject(new Error("Utente non autenticato"));
      return;
    }

    gun
      .user()
      .get("activitypub")
      .get("keys")
      .put(
        {
          publicKey: keys.publicKey,
          privateKey: keys.privateKey,
          createdAt: Date.now(),
        },
        (ack) => {
          if (ack.err) {
            reject(new Error(ack.err));
          } else {
            // Verifichiamo che le chiavi siano state salvate
            gun.user().get("activitypub").get("keys").once((data) => {
              if (data && data.publicKey === keys.publicKey) {
                resolve(keys);
              } else {
                reject(new Error("Verifica salvataggio chiavi fallita"));
              }
            });
          }
        }
      );
  });
}

async function createGunUser(gun, username, password) {
  return new Promise((resolve, reject) => {
    gun.user().auth(username, password, (ack) => {
      if (ack.err) {
        // Se l'autenticazione fallisce, proviamo a creare l'utente
        console.log("Autenticazione fallita, provo a creare l'utente...");
        gun.user().create(username, password, (createAck) => {
          if (createAck.err && createAck.err !== "User already created") {
            console.error("Errore nella creazione dell'utente:", createAck.err);
            reject(new Error(createAck.err));
          } else {
            console.log("Utente creato con successo, provo ad autenticare...");
            // Dopo la creazione, proviamo ad autenticare
            gun.user().auth(username, password, (authAck) => {
              if (authAck.err) {
                console.error("Errore nell'autenticazione:", authAck.err);
                reject(new Error(authAck.err));
              } else {
                console.log("Utente autenticato con successo");
                resolve(authAck);
              }
            });
          }
        });
      } else {
        console.log("Utente autenticato con successo");
        resolve(ack);
      }
    });
  });
}

// Funzione per inizializzare il profilo ActivityPub
async function initializeActivityPubProfile(gun, username) {
  return new Promise((resolve, reject) => {
    const actorData = {
      '@context': 'https://www.w3.org/ns/activitystreams',
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
      published: new Date().toISOString()
    };

    gun
      .get("linda-messenger")
      .get("activitypub")
      .get(username)
      .put(actorData, (ack) => {
        if (ack.err) {
          reject(new Error(ack.err));
        } else {
          gun
            .get("linda-messenger")
            .get("activitypub")
            .get(username)
            .once((data) => {
              if (data && data.type === 'Person') {
                resolve(actorData);
              } else {
                reject(new Error("Verifica salvataggio profilo fallita"));
              }
            });
        }
      });
  });
}

async function verifyProfileSync(gun, username) {
  return new Promise((resolve, reject) => {
    gun
      .get("linda-messenger")
      .get("activitypub")
      .get(username)
      .once((data) => {
        if (data && data.type === 'Person') {
          console.log("Profilo sincronizzato con successo");
          resolve(data);
        } else {
          reject(new Error("Profilo non sincronizzato"));
        }
      });
  });
}

async function verifyActorEndpoint(username) {
  const profileUrl = `${BASE_URL}/users/${username}`;
  console.log("\nVerifica endpoint Actor");
  console.log("URL:", profileUrl);

  try {
    console.log("Invio richiesta GET...");
    const profileResponse = await fetch(profileUrl, {
      headers: {
        'Accept': 'application/activity+json'
      }
    });

    console.log("Status:", profileResponse.status);
    console.log("Headers:", profileResponse.headers);

    const responseText = await profileResponse.text();
    console.log("Response body:", responseText);

    if (!profileResponse.ok) {
      throw new Error(`Errore ${profileResponse.status}: ${responseText}`);
    }

    const profileData = JSON.parse(responseText);
    
    if (!profileData || profileData.type !== 'Person') {
      console.error("Dati profilo non validi:", profileData);
      throw new Error("Profilo non valido");
    }

    console.log("Profilo recuperato con successo");
    return profileData;
  } catch (error) {
    console.error("Errore dettagliato:", error);
    throw error;
  }
}

async function checkRelayConnection() {
  try {
    const response = await fetch(`${BASE_URL}/gun`);
    if (!response.ok) {
      throw new Error(`Relay non raggiungibile: ${response.status}`);
    }
    console.log("Relay raggiungibile con successo");
  } catch (error) {
    console.error("Errore nella connessione al relay:", error);
    process.exit(1);
  }
}

async function verifyUserAuthentication(gun) {
  return new Promise((resolve, reject) => {
    if (gun.user().is) {
      console.log("Utente autenticato con successo");
      resolve();
    } else {
      console.error("Utente non autenticato");
      reject(new Error("Utente non autenticato"));
    }
  });
}

async function signRequest(request, keyId, username, gun) {
  const userData = await gun
    .user()
    .get("activitypub")
    .get("keys")
    .once();

  if (!userData?.privateKey) {
    throw new Error('Chiave privata non trovata per l\'utente');
  }

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
    .sign(userData.privateKey, 'base64');

  const signatureHeader = [
    `keyId="${keyId}"`,
    'algorithm="rsa-sha256"',
    `headers="${headersToSign.join(' ')}"`,
    `signature="${signature}"`
  ].join(',');

  return signatureHeader;
}

async function testActivityPubEvents(username) {
  console.log("\nTest Eventi ActivityPub");

  // Test Follow e Accept
  console.log("\nTest Follow e Accept");
  const followActivity = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: 'Follow',
    actor: `${BASE_URL}/users/test_follower`,
    object: `${BASE_URL}/users/${username}`,
    id: `${BASE_URL}/users/test_follower/activities/${Date.now()}`
  };

  const followResponse = await fetch(`${BASE_URL}/users/${username}/inbox`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/activity+json'
    },
    body: JSON.stringify(followActivity)
  });

  if (!followResponse.ok) {
    throw new Error(`Follow request failed: ${followResponse.statusText}`);
  }

  console.log("Follow accettato con successo");

  // Test Undo Follow
  console.log("\nTest Undo Follow");
  const undoActivity = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: 'Undo',
    actor: `${BASE_URL}/users/test_follower`,
    object: followActivity,
    id: `${BASE_URL}/users/test_follower/activities/${Date.now()}`
  };

  const undoResponse = await fetch(`${BASE_URL}/users/${username}/inbox`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/activity+json'
    },
    body: JSON.stringify(undoActivity)
  });

  if (!undoResponse.ok) {
    throw new Error(`Undo request failed: ${undoResponse.statusText}`);
  }

  console.log("Undo completato con successo");
}

async function runTests() {
  console.log("Inizio dei test ActivityPub sul relay...\n");
  console.log("Using BASE_URL:", BASE_URL);

  try {
    // Verifica che il server sia in ascolto
    console.log("\nVerifica connessione al server...");
    await checkRelayConnection();

    // Inizializza Gun
    console.log("\nInizializzazione Gun...");
    const gun = Gun({
      peers: [`${BASE_URL}/gun`],
      multicast: false, // Disabilita multicast per i test locali
      axe: true
    });

    // Crea e autentica l'utente di test
    console.log("\nCreazione utente Gun di test...");
    await createGunUser(gun, TEST_USERNAME, TEST_PASSWORD);
    await verifyUserAuthentication(gun);
    console.log("Utente Gun creato e autenticato con successo\n");

    // Genera e salva le chiavi ActivityPub
    console.log("\nGenerazione chiavi ActivityPub...");
    const keys = await saveUserActivityPubKeys(gun, TEST_USERNAME);
    console.log("Chiavi ActivityPub generate e salvate con successo\n");

    // Inizializza il profilo ActivityPub
    console.log("\nInizializzazione profilo ActivityPub...");
    const profile = await initializeActivityPubProfile(gun, TEST_USERNAME);
    await verifyProfileSync(gun, TEST_USERNAME);
    console.log("Profilo ActivityPub creato:", profile, "\n");

    // Verifica l'endpoint Actor
    console.log("\nVerifica endpoint Actor...");
    const actorData = await verifyActorEndpoint(TEST_USERNAME);
    console.log("Actor Endpoint Response:", actorData, "\n");

    // Test 1: WebFinger
    console.log("Test 1: WebFinger");
    const webfingerUrl = `${BASE_URL}/.well-known/webfinger?resource=acct:${TEST_USERNAME}@localhost`;
    console.log("Richiesta WebFinger a:", webfingerUrl);
    
    const webfingerResponse = await fetch(webfingerUrl);
    console.log("Status WebFinger:", webfingerResponse.status);
    
    if (!webfingerResponse.ok) {
      throw new Error(
        `WebFinger request failed with status ${webfingerResponse.status}`
      );
    }
    
    const webfingerData = await webfingerResponse.json();
    console.log("WebFinger Response:", webfingerData, "\n");

    // Test 2: Profilo Utente
    console.log("Test 2: Profilo Utente");
    const profileUrl = `${BASE_URL}/users/${TEST_USERNAME}`;
    console.log("Richiesta profilo a:", profileUrl);
    
    const profileResponse = await fetch(profileUrl, {
      headers: {
        'Accept': 'application/activity+json'
      }
    });
    console.log("Status profilo:", profileResponse.status);
    
    if (!profileResponse.ok) {
      const errorText = await profileResponse.text();
      throw new Error(
        `Profile request failed with status ${profileResponse.status}: ${errorText}`
      );
    }
    
    const profileData = await profileResponse.json();
    console.log("Profile Response:", profileData, "\n");

    // Test 3: Creazione Post
    console.log("Test 3: Creazione Post");
    const testPost = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'Create',
      actor: `${BASE_URL}/users/${TEST_USERNAME}`,
      object: {
        type: 'Note',
        content: 'Questo è un post di test ActivityPub sul relay!',
        published: new Date().toISOString(),
        attributedTo: `${BASE_URL}/users/${TEST_USERNAME}`,
        to: ['https://www.w3.org/ns/activitystreams#Public']
      },
      published: new Date().toISOString(),
      to: ['https://www.w3.org/ns/activitystreams#Public']
    };

    const postResponse = await fetch(
      `${BASE_URL}/users/${TEST_USERNAME}/outbox`,
      {
        method: "POST",
      headers: {
          "Content-Type": "application/activity+json",
      },
        body: JSON.stringify(testPost),
      }
    );
    
    if (!postResponse.ok) {
      const errorText = await postResponse.text();
      throw new Error(
        `Post creation failed with status ${postResponse.status}: ${errorText}`
      );
    }
    
    const postData = await postResponse.json();
    console.log("Post Creation Response:", postData, "\n");

    // Test 4: Follow Request
    console.log("Test 4: Follow Request");
    const followActivity = {
      type: "Follow",
      object: "https://ftwr.scobrudot.dev/users/scobru",
    };

    const followResponse = await fetch(
      `${BASE_URL}/users/${TEST_USERNAME}/outbox`,
      {
        method: "POST",
      headers: {
          "Content-Type": "application/activity+json",
      },
        body: JSON.stringify(followActivity),
      }
    );

    if (!followResponse.ok) {
      const errorText = await followResponse.text();
      throw new Error(
        `Follow request failed with status ${followResponse.status}: ${errorText}`
      );
    }
    
    const followData = await followResponse.json();
    console.log("Follow Request Response:", followData, "\n");

    // Test 5: Verifica Followers
    console.log("Test 5: Verifica Followers");
    const followersResponse = await fetch(
      `${BASE_URL}/users/${TEST_USERNAME}/followers`
    );
    
    if (!followersResponse.ok) {
      throw new Error(
        `Followers request failed with status ${followersResponse.status}`
      );
    }
    
    const followersData = await followersResponse.json();
    console.log("Followers Response:", followersData, "\n");

    // Test 6: Verifica Following
    console.log("Test 6: Verifica Following");
    const followingResponse = await fetch(
      `${BASE_URL}/users/${TEST_USERNAME}/following`
    );
    
    if (!followingResponse.ok) {
      throw new Error(
        `Following request failed with status ${followingResponse.status}`
      );
    }
    
    const followingData = await followingResponse.json();
    console.log("Following Response:", followingData, "\n");

    // Aggiungi i nuovi test
    await testActivityPubEvents(TEST_USERNAME);

    console.log("\nTutti i test completati con successo! 🎉");
  } catch (error) {
    console.error("\nErrore durante i test:", error);
    process.exit(1);
  }
}

// Esegui i test
runTests(); 
