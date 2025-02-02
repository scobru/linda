'use strict';
import express from 'express';
import crypto from 'crypto';
import request from 'request';
const router = express.Router();

import { gun } from '../index.js';

export const configure = (router) => {
  // Route principale per l'inbox
  router.post('/', async (req, res) => {
    try {
      const activity = req.body;
      const domain = req.app.get('domain');
      
      if (!activity || !activity.type) {
        return res.status(400).json({ 
          error: 'Attività non valida' 
        });
      }

      // Gestione Follow
      if (typeof activity.object === 'string' && activity.type === 'Follow') {
        const myURL = new URL(activity.actor);
        const targetDomain = myURL.hostname;
        const name = activity.object.replace(`https://${domain}/u/`, '');
        
        // Aggiorna followers in GUN
        const userData = await new Promise(resolve => {
          gun.get('accounts').get(name).once(data => resolve(data));
        });

        if (!userData) {
          return res.status(404).json({ msg: 'Account not found' });
        }

        let followers = userData.followers || [];
        followers.push(activity.actor);
        followers = [...new Set(followers)]; // Rimuove duplicati

        await new Promise(resolve => {
          gun.get('accounts').get(name).get('followers').put(followers, ack => resolve(ack));
        });
        
        await sendAcceptMessage(activity, name, domain, req, res, targetDomain);
        return res.status(200).json({ success: true });
      }

      // Salva l'attività nell'inbox
      await handleInboxActivity(activity);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Errore nella gestione dell\'inbox:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Route per ottenere le attività dell'inbox
  router.get('/', async (req, res) => {
    try {
      const activities = await getInboxActivities();
      res.json({
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'OrderedCollection',
        totalItems: activities.length,
        orderedItems: activities
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
};

// Funzioni di supporto
async function handleInboxActivity(activity) {
  const id = crypto.randomBytes(16).toString('hex');
  
  return new Promise((resolve, reject) => {
    gun.get('inbox').get(id).put({
      ...activity,
      received: new Date().toISOString()
    }, (ack) => {
      if (ack.err) {
        reject(new Error(ack.err));
      } else {
        resolve(true);
      }
    });
  });
}

async function getInboxActivities() {
  return new Promise((resolve) => {
    gun.get('inbox').once((data) => {
      const activities = data ? Object.values(data) : [];
      resolve(activities.sort((a, b) => 
        new Date(b.received) - new Date(a.received)
      ));
    });
  });
}

async function signAndSend(message, name, domain, req, res, targetDomain) { 
  try {
    // Recupera la chiave privata da GUN
    const userData = await new Promise((resolve) => {
      gun.get('accounts').get(name).get('profile').once((data) => {
        resolve(data);
      });
    });

    if (!userData || !userData.privateKey) {
      throw new Error(`No private key found for ${name}`);
    }

    let inbox = message.object.actor + '/inbox';
    let inboxFragment = inbox.replace('https://' + targetDomain, '');
    const privkey = userData.privateKey;
    const digestHash = crypto.createHash('sha256').update(JSON.stringify(message)).digest('base64');
    const signer = crypto.createSign('sha256');
    let d = new Date();
    let stringToSign = `(request-target): post ${inboxFragment}\nhost: ${targetDomain}\ndate: ${d.toUTCString()}\ndigest: SHA-256=${digestHash}`;
    signer.update(stringToSign);
    signer.end();
    const signature = signer.sign(privkey);
    const signature_b64 = signature.toString('base64');
    let header = `keyId="https://${domain}/u/${name}",headers="(request-target) host date digest",signature="${signature_b64}"`;

    return new Promise((resolve, reject) => {
      request({
        url: inbox,
        headers: {
          'Host': targetDomain,
          'Date': d.toUTCString(),
          'Digest': `SHA-256=${digestHash}`,
          'Signature': header
        },
        method: 'POST',
        json: true,
        body: message
      }, function (error, response) {
        if (error) {
          console.error('Error:', error, response?.body);
          reject(error);
        } else {
          console.log('Response:', response.body);
          resolve(response);
        }
      });
    });
  } catch (error) {
    console.error('Error in signAndSend:', error);
    throw error;
  }
}

async function sendAcceptMessage(thebody, name, domain, req, res, targetDomain) {
  const guid = crypto.randomBytes(16).toString('hex');
  let message = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    'id': `https://${domain}/${guid}`,
    'type': 'Accept',
    'actor': `https://${domain}/u/${name}`,
    'object': thebody,
  };
  return signAndSend(message, name, domain, req, res, targetDomain);
}

export default router;
