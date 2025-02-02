'use strict';
import express from 'express';
import request from 'request';
import crypto from 'crypto';
import { gun } from '../index.js';

const router = express.Router();

export const configure = (router) => {
  // Route per l'invio dei messaggi
  router.post('/sendMessage', async function (req, res) {
    const domain = req.hostname || 'localhost:8765';
    const { acct, apikey, message } = req.body;

    if (!acct || !apikey || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      // Verifica apikey recuperando i dati dell'utente autenticato
      const userData = await new Promise((resolve) => {
        gun.get('accounts').get(acct).once((data) => {
          resolve(data);
        });
      });

      if (!userData || userData.apikey !== apikey) {
        return res.status(403).json({ error: 'Invalid API key' });
      }

      await sendCreateMessage(message, acct, domain, req, res);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
};

async function signAndSend(message, name, domain, req, res, targetDomain, inbox) {
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

    const inboxFragment = inbox.replace('https://' + targetDomain, '');
    const privkey = userData.privateKey;
    const digestHash = crypto.createHash('sha256').update(JSON.stringify(message)).digest('base64');
    const signer = crypto.createSign('sha256');
    const d = new Date();
    const stringToSign = `(request-target): post ${inboxFragment}\nhost: ${targetDomain}\ndate: ${d.toUTCString()}\ndigest: SHA-256=${digestHash}`;
    
    signer.update(stringToSign);
    signer.end();
    const signature = signer.sign(privkey);
    const signature_b64 = signature.toString('base64');
    const header = `keyId="https://${domain}/u/${name}",headers="(request-target) host date digest",signature="${signature_b64}"`;

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
          console.log('Error:', error);
          reject(error);
        } else {
          console.log(`Sent message to inbox at ${targetDomain}!`);
          console.log('Response Status Code:', response.statusCode);
          resolve(response);
        }
      });
    });
  } catch (error) {
    console.error('Error in signAndSend:', error);
    throw error;
  }
}

async function createMessage(text, name, domain, req, res, follower) {
  const guidCreate = crypto.randomBytes(16).toString('hex');
  const guidNote = crypto.randomBytes(16).toString('hex');
  const d = new Date();

  const noteMessage = {
    'id': `https://${domain}/m/${guidNote}`,
    'type': 'Note',
    'published': d.toISOString(),
    'attributedTo': `https://${domain}/u/${name}`,
    'content': text,
    'to': ['https://www.w3.org/ns/activitystreams#Public'],
  };

  const createMessage = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    'id': `https://${domain}/m/${guidCreate}`,
    'type': 'Create',
    'actor': `https://${domain}/u/${name}`,
    'to': ['https://www.w3.org/ns/activitystreams#Public'],
    'cc': [follower],
    'object': noteMessage
  };

  // Salva i messaggi in GUN
  await Promise.all([
    new Promise((resolve) => {
      gun.get('messages').get(guidCreate).put(createMessage, ack => resolve(ack));
    }),
    new Promise((resolve) => {
      gun.get('messages').get(guidNote).put(noteMessage, ack => resolve(ack));
    })
  ]);

  return createMessage;
}

async function sendCreateMessage(text, name, domain, req, res) {
  try {
    // Recupera i followers da GUN
    const userData = await new Promise((resolve) => {
      gun.get('accounts').get(name).once((data) => {
        resolve(data);
      });
    });

    if (!userData || !userData.followers || !userData.followers.length) {
      return res.status(400).json({ msg: `No followers for account ${name}@${domain}` });
    }

    const followers = userData.followers;
    
    // Invia il messaggio a tutti i followers
    for (let follower of followers) {
      const inbox = follower + '/inbox';
      const myURL = new URL(follower);
      const targetDomain = myURL.host;
      const message = await createMessage(text, name, domain, req, res, follower);
      await signAndSend(message, name, domain, req, res, targetDomain, inbox);
    }

    res.status(200).json({ msg: 'ok' });
  } catch (error) {
    console.error('Error in sendCreateMessage:', error);
    res.status(500).json({ error: error.message });
  }
}

export default router;  
