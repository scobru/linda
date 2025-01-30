import fetch from 'node-fetch';
const BASE_URL = process.env.BASE_URL || 'https://gun-relay.scobrudot.dev';
const TEST_USERNAME = 'scobru_test';

async function runTests() {
  console.log('Inizio dei test ActivityPub sul relay...\n');

  try {
    // Test 1: WebFinger
    console.log('Test 1: WebFinger');
    const webfingerResponse = await fetch(
      `${BASE_URL}/.well-known/webfinger?resource=acct:${TEST_USERNAME}@localhost`
    );
    
    // Verifica il Content-Type della risposta
    const contentType = webfingerResponse.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await webfingerResponse.text();
      throw new Error(`Risposta non JSON: ${text}`);
    }
    
    console.log('WebFinger Response:', await webfingerResponse.json(), '\n');

    // Test 2: Profilo Utente
    console.log('Test 2: Profilo Utente');
    const profileResponse = await fetch(`${BASE_URL}/users/${TEST_USERNAME}`);
    
    // Verifica il Content-Type della risposta
    const profileContentType = profileResponse.headers.get('content-type');
    if (!profileContentType || !profileContentType.includes('application/json')) {
      const text = await profileResponse.text();
      throw new Error(`Risposta non JSON: ${text}`);
    }
    
    console.log('Profile Response:', await profileResponse.json(), '\n');

    // Test 3: Creazione Post
    console.log('Test 3: Creazione Post');
    const testPost = {
      type: 'Create',
      object: {
        type: 'Note',
        content: 'Questo è un post di test ActivityPub sul relay!',
        published: new Date().toISOString(),
        to: ['https://www.w3.org/ns/activitystreams#Public']
      }
    };
    
    const postResponse = await fetch(`${BASE_URL}/users/${TEST_USERNAME}/outbox`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/activity+json',
        'Accept': 'application/activity+json'
      },
      body: JSON.stringify(testPost),
      timeout: 30000 // Aumenta il timeout a 30 secondi
    });
    
    // Verifica il Content-Type della risposta
    const postContentType = postResponse.headers.get('content-type');
    if (!postContentType || !postContentType.includes('application/json')) {
      const text = await postResponse.text();
      throw new Error(`Risposta non JSON: ${text}`);
    }
    
    console.log('Post Creation Response:', await postResponse.json(), '\n');

    // Test 4: Follow Request
    console.log('Test 4: Follow Request');
    const followActivity = {
      type: 'Follow',
      object: 'https://ftwr.scobrudot.dev/users/scobru'
    };
    
    const followResponse = await fetch(`${BASE_URL}/users/${TEST_USERNAME}/outbox`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/activity+json',
        'Accept': 'application/activity+json'
      },
      body: JSON.stringify(followActivity)
    });

    // Verifica il Content-Type della risposta
    const followContentType = followResponse.headers.get('content-type');
    if (!followContentType || !followContentType.includes('application/json')) {
      const text = await followResponse.text();
      throw new Error(`Risposta non JSON: ${text}`);
    }

    console.log('Follow Request Response:', await followResponse.json(), '\n');

    // Test 5: Verifica Followers
    console.log('Test 5: Verifica Followers');
    const followersResponse = await fetch(`${BASE_URL}/users/${TEST_USERNAME}/followers`);
    console.log('Followers Response:', await followersResponse.json(), '\n');

    // Test 6: Verifica Following
    console.log('Test 6: Verifica Following');
    const followingResponse = await fetch(`${BASE_URL}/users/${TEST_USERNAME}/following`);
    console.log('Following Response:', await followingResponse.json(), '\n');

    console.log('Tutti i test completati con successo! 🎉');
  } catch (error) {
    console.error('Errore durante i test:', error);
  }
}

// Esegui i test
runTests(); 