'use strict';
import express from 'express';
import { gun } from '../index.js';

const router = express.Router();

export const configure = (router) => {
  router.get('/', async (req, res) => {
    try {
      const resource = req.query.resource;
      
      if (!resource) {
        return res.status(400).json({ error: 'Resource parameter required' });
      }

      // Estrai username dal formato acct:user@domain
      const match = resource.match(/^acct:([^@]+)@(.+)$/);
      if (!match) {
        return res.status(400).json({ error: 'Invalid resource format' });
      }

      const [, username, domain] = match;
      const profile = await getUserProfile(username);

      if (!profile) {
        return res.status(404).json({ error: 'User not found' });
      }

      const response = {
        subject: resource,
        links: [
          {
            rel: 'self',
            type: 'application/activity+json',
            href: `https://${domain}/u/${username}`
          },
          {
            rel: 'http://webfinger.net/rel/profile-page',
            type: 'text/html',
            href: `https://${domain}/@${username}`
          }
        ]
      };

      res.json(response);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
};

async function getUserProfile(username) {
  return new Promise((resolve) => {
    gun.get('accounts').get(username).once((data) => {
      resolve(data);
    });
  });
}

export default router;
