// Endpoint per il profilo utente (actor)
export const handleActorEndpoint = async (gun, DAPP_NAME, username) => {
  const actorData = await gun
    .get(DAPP_NAME)
    .get('activitypub')
    .get(username)
    .then();

  return actorData || {
    '@context': ['https://www.w3.org/ns/activitystreams'],
    type: 'Person',
    id: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}`,
    following: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/following`,
    followers: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/followers`,
    inbox: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/inbox`,
    outbox: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/outbox`,
    preferredUsername: username
  };
};

// Endpoint per l'inbox
export const handleInbox = async (gun, DAPP_NAME, username, activity) => {
  try {
    const enrichedActivity = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      ...activity,
      received_at: new Date().toISOString()
    };

    // Salva l'attività nell'inbox
    await gun
      .get(DAPP_NAME)
      .get('activitypub')
      .get(username)
      .get('inbox')
      .set(enrichedActivity);

    // Se è un Follow, aggiorna anche la lista followers
    if (activity.type === 'Follow') {
      await gun
        .get(DAPP_NAME)
        .get('activitypub')
        .get(username)
        .get('followers')
        .set({
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

// Endpoint per l'outbox
export const handleOutbox = async (gun, DAPP_NAME, username, activity) => {
  try {
    const enrichedActivity = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      ...activity,
      actor: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}`,
      published: new Date().toISOString(),
      // Aggiungi un ID univoco per l'attività
      id: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/activities/${Date.now()}`
    };

    // Salva l'attività nel database
    await gun
      .get(DAPP_NAME)
      .get('activitypub')
      .get(username)
      .get('outbox')
      .set(enrichedActivity);

    // Se è un Follow, aggiorna anche la lista following
    if (activity.type === 'Follow') {
      await gun
        .get(DAPP_NAME)
        .get('activitypub')
        .get(username)
        .get('following')
        .set({
          id: activity.object,
          followed_at: new Date().toISOString()
        });
    }

    // Se è un Create di Note, aggiorna anche la lista dei post
    if (activity.type === 'Create' && activity.object?.type === 'Note') {
      await gun
        .get(DAPP_NAME)
        .get('activitypub')
        .get(username)
        .get('posts')
        .set({
          ...activity.object,
          id: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/posts/${Date.now()}`,
          published: new Date().toISOString()
        });
    }

    return enrichedActivity;
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
    .then();

  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: 'OrderedCollection',
    totalItems: followers ? Object.keys(followers).length : 0,
    items: followers || []
  };
};

// Endpoint per i following
export const handleFollowing = async (gun, DAPP_NAME, username) => {
  const following = await gun
    .get(DAPP_NAME)
    .get('activitypub')
    .get(username)
    .get('following')
    .then();

  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: 'OrderedCollection',
    totalItems: following ? Object.keys(following).length : 0,
    items: following || []
  };
}; 