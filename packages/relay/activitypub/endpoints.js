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
    const activityId = `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/activities/${Date.now()}`;

    // Costruisci l'attività arricchita con una struttura più robusta
    const enrichedActivity = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: activityId,
      type: activity.type,
      actor: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}`,
      published: new Date().toISOString(),
      to: activity.to || ['https://www.w3.org/ns/activitystreams#Public']
    };

    // Gestione specifica per il campo object
    if (activity.object) {
      // Se l'oggetto è una stringa (come nel caso di Follow), convertilo in un oggetto
      if (typeof activity.object === 'string') {
        enrichedActivity.object = {
          id: activity.object
        };
      } else if (typeof activity.object === 'object' && !Array.isArray(activity.object)) {
        enrichedActivity.object = {
          ...activity.object,
          id: activity.object.id || `${activityId}/object`
        };
      } else {
        throw new Error('Campo object non valido: deve essere un oggetto o una stringa');
      }
    }

    // Salva l'attività nel database con una struttura più chiara
    await gun
      .get(DAPP_NAME)
      .get('activitypub')
      .get(username)
      .get('outbox')
      .get(activityId)
      .put({
        ...enrichedActivity,
        _: {
          '#': `${DAPP_NAME}/activitypub/${username}/outbox/${activityId}`,
          '>': {
            published: Date.now()
          }
        }
      });

    // Gestione specifica per Follow
    if (activity.type === 'Follow' && enrichedActivity.object?.id) {
      await gun
        .get(DAPP_NAME)
        .get('activitypub')
        .get(username)
        .get('following')
        .get(enrichedActivity.object.id)
        .put({
          id: enrichedActivity.object.id,
          followed_at: new Date().toISOString(),
          _: {
            '#': `${DAPP_NAME}/activitypub/${username}/following/${enrichedActivity.object.id}`,
            '>': {
              followed_at: Date.now()
            }
          }
        });
    }

    // Gestione specifica per Create (Note)
    if (activity.type === 'Create' && activity.object?.type === 'Note') {
      const postId = `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/posts/${Date.now()}`;
      
      await gun
        .get(DAPP_NAME)
        .get('activitypub')
        .get(username)
        .get('posts')
        .get(postId)
        .put({
          ...activity.object,
          id: postId,
          published: new Date().toISOString(),
          _: {
            '#': `${DAPP_NAME}/activitypub/${username}/posts/${postId}`,
            '>': {
              published: Date.now()
            }
          }
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