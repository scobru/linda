import fetch from 'node-fetch';
const BASE_URL = 'http://localhost:8765';
const TEST_USERNAME = 'scobru_test';

async function runTests() {
  console.log('Inizio dei test ActivityPub sul relay...\n');

  try {
    // Test 1: WebFinger
    console.log('Test 1: WebFinger');
    const webfingerResponse = await fetch(
      `${BASE_URL}/.well-known/webfinger?resource=acct:${TEST_USERNAME}@localhost`
    );
    
    if (!webfingerResponse.ok) {
      throw new Error(`WebFinger request failed with status ${webfingerResponse.status}`);
    }
    
    const webfingerData = await webfingerResponse.json();
    console.log('WebFinger Response:', webfingerData, '\n');

    // Test 2: Profilo Utente
    console.log('Test 2: Profilo Utente');
    const profileResponse = await fetch(`${BASE_URL}/users/${TEST_USERNAME}`);
    
    if (!profileResponse.ok) {
      throw new Error(`Profile request failed with status ${profileResponse.status}`);
    }
    
    const profileData = await profileResponse.json();
    console.log('Profile Response:', profileData, '\n');

    // Test 3: Creazione Post
    console.log('Test 3: Creazione Post');
    const testPost = {
      '@context': ['https://www.w3.org/ns/activitystreams'],
      type: 'Create',
      actor: `${BASE_URL}/users/${TEST_USERNAME}`,
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
      body: JSON.stringify(testPost)
    });
    
    if (!postResponse.ok) {
      const errorText = await postResponse.text();
      throw new Error(`Post creation failed with status ${postResponse.status}: ${errorText}`);
    }
    
    const postData = await postResponse.json();
    console.log('Post Creation Response:', postData, '\n');

    // Test 4: Follow Request
    console.log('Test 4: Follow Request');
    const followActivity = {
      '@context': ['https://www.w3.org/ns/activitystreams'],
      type: 'Follow',
      actor: `${BASE_URL}/users/${TEST_USERNAME}`,
      object: 'https://mastodon.social/users/test'
    };
    
    const followResponse = await fetch(`${BASE_URL}/users/${TEST_USERNAME}/outbox`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/activity+json',
        'Accept': 'application/activity+json'
      },
      body: JSON.stringify(followActivity)
    });

    if (!followResponse.ok) {
      const errorText = await followResponse.text();
      throw new Error(`Follow request failed with status ${followResponse.status}: ${errorText}`);
    }
    
    const followData = await followResponse.json();
    console.log('Follow Request Response:', followData, '\n');

    // Test 5: Verifica Followers
    console.log('Test 5: Verifica Followers');
    const followersResponse = await fetch(`${BASE_URL}/users/${TEST_USERNAME}/followers`);
    
    if (!followersResponse.ok) {
      throw new Error(`Followers request failed with status ${followersResponse.status}`);
    }
    
    const followersData = await followersResponse.json();
    console.log('Followers Response:', followersData, '\n');

    // Test 6: Verifica Following
    console.log('Test 6: Verifica Following');
    const followingResponse = await fetch(`${BASE_URL}/users/${TEST_USERNAME}/following`);
    
    if (!followingResponse.ok) {
      throw new Error(`Following request failed with status ${followingResponse.status}`);
    }
    
    const followingData = await followingResponse.json();
    console.log('Following Response:', followingData, '\n');

    console.log('Tutti i test completati con successo! 🎉');
  } catch (error) {
    console.error('Errore durante i test:', error);
    process.exit(1);
  }
}

// Esegui i test
runTests(); 