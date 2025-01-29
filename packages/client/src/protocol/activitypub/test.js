import fetch from 'node-fetch';
import { activityPubManager } from './index';
import { convertPostToActivity, convertFriendRequestToActivity } from './adapter';

const BASE_URL = 'http://localhost:8765';
const TEST_USERNAME = 'testuser';

async function runTests() {
  console.log('Inizio dei test ActivityPub sul relay...\n');

  try {
    // Test 1: WebFinger
    console.log('Test 1: WebFinger');
    const webfingerResponse = await fetch(
      `${BASE_URL}/.well-known/webfinger?resource=acct:${TEST_USERNAME}@localhost`
    );
    console.log('WebFinger Response:', await webfingerResponse.json(), '\n');

    // Test 2: Inizializzazione Attore
    console.log('Test 2: Inizializzazione Attore');
    const actor = await activityPubManager.initializeActor(TEST_USERNAME);
    console.log('Actor Data:', actor, '\n');

    // Test 3: Profilo Utente
    console.log('Test 3: Profilo Utente');
    const profileResponse = await fetch(`${BASE_URL}/users/${TEST_USERNAME}`);
    console.log('Profile Response:', await profileResponse.json(), '\n');

    // Test 4: Creazione Post
    console.log('Test 4: Creazione Post');
    const testPost = {
      content: 'Questo è un post di test ActivityPub sul relay!',
      timestamp: new Date().toISOString(),
      author: `${BASE_URL}/users/${TEST_USERNAME}`,
      mentions: []
    };
    const activity = convertPostToActivity(testPost);
    const postResponse = await fetch(`${BASE_URL}/users/${TEST_USERNAME}/outbox`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/activity+json',
        'Accept': 'application/activity+json'
      },
      body: JSON.stringify(activity)
    });
    console.log('Post Creation Response:', await postResponse.json(), '\n');

    // Test 5: Follow Request
    console.log('Test 5: Follow Request');
    const targetUser = 'anotheruser@example.com';
    const followActivity = convertFriendRequestToActivity(targetUser);
    const followResponse = await fetch(`${BASE_URL}/users/${TEST_USERNAME}/outbox`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/activity+json',
        'Accept': 'application/activity+json'
      },
      body: JSON.stringify(followActivity)
    });
    console.log('Follow Request Response:', await followResponse.json(), '\n');

    // Test 6: Verifica Followers
    console.log('Test 6: Verifica Followers');
    const followersResponse = await fetch(`${BASE_URL}/users/${TEST_USERNAME}/followers`);
    console.log('Followers Response:', await followersResponse.json(), '\n');

    // Test 7: Verifica Metriche ActivityPub
    console.log('Test 7: Verifica Metriche ActivityPub');
    const metricsResponse = await fetch(`${BASE_URL}/metrics`);
    const metrics = await metricsResponse.json();
    console.log('ActivityPub Metrics:', {
      posts: metrics.totalPosts || 0,
      follows: metrics.totalFollows || 0,
      likes: metrics.totalLikes || 0,
      boosts: metrics.totalBoosts || 0
    }, '\n');

    console.log('Tutti i test completati con successo! 🎉');
  } catch (error) {
    console.error('Errore durante i test:', error);
  }
}

// Esegui i test
runTests(); 