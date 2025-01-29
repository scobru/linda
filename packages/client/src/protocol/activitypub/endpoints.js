const { activityPubManager } = require('./index');
const { gun, user, DAPP_NAME } = require('../useGun');

// Endpoint per il profilo utente (actor)
const handleActorEndpoint = async (username) => {
  const actorData = await gun
    .get(DAPP_NAME)
    .get('activitypub')
    .get(user.is.pub)
    .then();

  return actorData;
};

// Endpoint per l'inbox
const handleInbox = async (activity) => {
  try {
    await activityPubManager.handleIncomingActivity(activity);
    return { success: true };
  } catch (error) {
    console.error('Errore nella gestione dell\'attività in arrivo:', error);
    throw error;
  }
};

// Endpoint per l'outbox
const handleOutbox = async (activity) => {
  try {
    if (!user.is) throw new Error('Utente non autenticato');

    const enrichedActivity = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      ...activity,
      actor: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${user.is.alias}`,
      published: new Date().toISOString()
    };

    await gun
      .get(DAPP_NAME)
      .get('activitypub')
      .get(user.is.pub)
      .get('outbox')
      .set(enrichedActivity);

    return enrichedActivity;
  } catch (error) {
    console.error('Errore nella pubblicazione dell\'attività:', error);
    throw error;
  }
};

// Endpoint per i follower
const handleFollowers = async (username) => {
  const followers = await gun
    .get(DAPP_NAME)
    .get('activitypub')
    .get(user.is.pub)
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
const handleFollowing = async (username) => {
  const following = await gun
    .get(DAPP_NAME)
    .get('activitypub')
    .get(user.is.pub)
    .get('following')
    .then();

  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: 'OrderedCollection',
    totalItems: following ? Object.keys(following).length : 0,
    items: following || []
  };
};

module.exports = {
  handleActorEndpoint,
  handleInbox,
  handleOutbox,
  handleFollowers,
  handleFollowing
}; 