const { gun, user, DAPP_NAME } = require('../useGun');

// Costanti ActivityPub
const ACTIVITY_TYPES = {
  CREATE: 'Create',
  UPDATE: 'Update',
  DELETE: 'Delete',
  FOLLOW: 'Follow',
  ACCEPT: 'Accept',
  REJECT: 'Reject',
  ANNOUNCE: 'Announce',
  LIKE: 'Like',
};

// Classe principale per gestire ActivityPub
class ActivityPubManager {
  constructor() {
    this.actorUrl = null;
    this.inbox = null;
    this.outbox = null;
  }

  // Inizializza l'attore ActivityPub
  async initializeActor(username) {
    const actorData = {
      '@context': ['https://www.w3.org/ns/activitystreams'],
      type: 'Person',
      id: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}`,
      following: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/following`,
      followers: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/followers`,
      inbox: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/inbox`,
      outbox: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}/outbox`,
      preferredUsername: username,
      publicKey: {
        id: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}#main-key`,
        owner: `${process.env.BASE_URL || 'http://localhost:8765'}/users/${username}`,
        publicKeyPem: user.is?.pub
      }
    };

    await gun.get(DAPP_NAME)
      .get('activitypub')
      .get(user.is.pub)
      .put(actorData);
    
    return actorData;
  }

  // Invia un'attività all'inbox di un altro attore
  async sendActivity(activity, targetInbox) {
    // Implementare la logica di invio attività
    console.log('Invio attività:', activity, 'a:', targetInbox);
  }

  // Gestisce le attività in arrivo
  async handleIncomingActivity(activity) {
    switch (activity.type) {
      case ACTIVITY_TYPES.FOLLOW:
        // Gestire richiesta di follow
        break;
      case ACTIVITY_TYPES.LIKE:
        // Gestire like
        break;
      case ACTIVITY_TYPES.ANNOUNCE:
        // Gestire boost/repost
        break;
      default:
        console.log('Attività non gestita:', activity.type);
    }
  }
}

const activityPubManager = new ActivityPubManager();

module.exports = {
  ACTIVITY_TYPES,
  activityPubManager
}; 