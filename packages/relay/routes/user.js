'use strict';

import express from 'express';
import { gun } from '../index.js';

const router = express.Router();

router.get('/:name', function (req, res) {
  const gun = req.app.get('gun');
  const domain = req.app.get('domain');
  const { name } = req.params;

  if (!name) {
    return res.status(400).send('Bad request.');
  }

  gun.get('accounts').get(name).once((userData) => {
    if (!userData) {
      return res.status(404).send(`No record found for ${name}.`);
    }

    let actor = userData.actor;
    if (!actor.followers) {
      actor.followers = `https://${domain}/u/${name}/followers`;
    }
    res.json(actor);
  });
});

router.get('/:name/followers', function (req, res) {
  const gun = req.app.get('gun');
  const domain = req.app.get('domain');
  const { name } = req.params;

  gun.get('accounts').get(name).get('followers').once((followers) => {
    followers = followers || [];
    
    const followersCollection = {
      "type": "OrderedCollection",
      "totalItems": followers.length,
      "id": `https://${domain}/u/${name}/followers`,
      "first": {
        "type": "OrderedCollectionPage",
        "totalItems": followers.length,
        "partOf": `https://${domain}/u/${name}/followers`,
        "orderedItems": followers,
        "id": `https://${domain}/u/${name}/followers?page=1`
      },
      "@context": ["https://www.w3.org/ns/activitystreams"]
    };
    res.json(followersCollection);
  });
});

router.get('/:name/outbox', async function (req, res) {
  const gun = req.app.get('gun');
  const { name } = req.params;
  const domain = req.app.get('domain');

  try {
    // Recupera i messaggi da GUN
    const messages = await new Promise((resolve) => {
      gun.get('messages').once((allMessages) => {
        const userMessages = Object.values(allMessages || {}).filter(msg => 
          msg && msg.actor === `https://${domain}/u/${name}`
        );
        resolve(userMessages);
      });
    });

    const outboxCollection = {
      "type": "OrderedCollection",
      "totalItems": messages.length,
      "id": `https://${domain}/u/${name}/outbox`,
      "first": {
        "type": "OrderedCollectionPage",
        "totalItems": messages.length,
        "partOf": `https://${domain}/u/${name}/outbox`,
        "orderedItems": messages,
        "id": `https://${domain}/u/${name}/outbox?page=1`
      },
      "@context": ["https://www.w3.org/ns/activitystreams"]
    };
    res.json(outboxCollection);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export const configure = (router) => {
  // Route per il profilo utente
  router.get('/:username', async (req, res) => {
    try {
      const { username } = req.params;
      const profile = await getUserProfile(username);
      
      if (!profile) {
        return res.status(404).json({ error: 'Utente non trovato' });
      }
      
      res.json(profile);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Route per l'outbox
  router.get('/:username/outbox', async (req, res) => {
    try {
      const { username } = req.params;
      const posts = await getUserPosts(username);
      res.json({
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'OrderedCollection',
        totalItems: posts.length,
        orderedItems: posts
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Route per l'inbox
  router.post('/:username/inbox', async (req, res) => {
    try {
      const { username } = req.params;
      const activity = req.body;
      await handleInboxActivity(username, activity);
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
};

// Funzioni di supporto
async function getUserProfile(username) {
  return new Promise((resolve) => {
    gun.get('accounts').get(username).once((data) => {
      resolve(data);
    });
  });
}

async function getUserPosts(username) {
  return new Promise((resolve) => {
    gun.get('accounts').get(username).get('posts').once((data) => {
      resolve(data ? Object.values(data) : []);
    });
  });
}

async function handleInboxActivity(username, activity) {
  // Implementa la logica per gestire le attività in arrivo
  console.log(`Attività ricevuta per ${username}:`, activity);
  return true;
}

export default router;
