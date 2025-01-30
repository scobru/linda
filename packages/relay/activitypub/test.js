import fetch from "node-fetch";
import Gun from "gun";
import "gun/sea.js";
import { generateKeyPairSync } from "crypto";
import dotenv from 'dotenv';

// Carica le variabili d'ambiente
dotenv.config();

// Usa l'URL dal file .env o un default
const BASE_URL = process.env.BASE_URL || "https://gun-relay.scobrudot.dev";
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
        gun.user().create(username, password, (createAck) => {
          if (createAck.err && createAck.err !== "User already created") {
            reject(new Error(createAck.err));
          } else {
            // Dopo la creazione, proviamo ad autenticare
            gun.user().auth(username, password, (authAck) => {
              if (authAck.err) {
                reject(new Error(authAck.err));
              } else {
                resolve(authAck);
              }
            });
          }
        });
      } else {
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

async function runTests() {
  console.log("Inizio dei test ActivityPub sul relay...\n");
  console.log("Using BASE_URL:", BASE_URL); // Log dell'URL che stiamo usando

  try {
    // Inizializza Gun connettendosi al relay esistente
    const gun = Gun({
      peers: [`${BASE_URL}/gun`],
    });

    // Crea e autentica l'utente di test
    console.log("Creazione utente Gun di test...");
    await createGunUser(gun, TEST_USERNAME, TEST_PASSWORD);
    console.log("Utente Gun creato e autenticato con successo\n");

    // Genera e salva le chiavi ActivityPub
    console.log("Generazione chiavi ActivityPub...");
    const keys = await saveUserActivityPubKeys(gun, TEST_USERNAME);
    console.log("Chiavi ActivityPub generate e salvate con successo\n");

    // Inizializza il profilo ActivityPub
    console.log("Inizializzazione profilo ActivityPub...");
    const profile = await initializeActivityPubProfile(gun, TEST_USERNAME);
    console.log("Profilo ActivityPub creato:", profile, "\n");

    // Aspetta un momento per assicurarsi che i dati siano sincronizzati
    console.log("Attendo la sincronizzazione dei dati...");
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log("Sincronizzazione completata\n");

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
      type: "Create",
      object: {
        type: "Note",
        content: "Questo è un post di test ActivityPub sul relay!",
      },
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

    console.log("Tutti i test completati con successo! 🎉");
  } catch (error) {
    console.error("Errore durante i test:", error);
    process.exit(1);
  }
}

// Esegui i test
runTests();
