'use strict';
import express from 'express';
import { gun } from '../index.js';
import crypto from 'crypto';

const router = express.Router();

export const configure = (router) => {
  // Route per ottenere un messaggio specifico
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const message = await getMessage(id);
      
      if (!message) {
        return res.status(404).json({ error: 'Messaggio non trovato' });
      }
      
      res.json(message);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Route per creare un nuovo messaggio
  router.post('/', async (req, res) => {
    try {
      const { content, actor } = req.body;
      
      if (!content || !actor) {
        return res.status(400).json({ 
          error: 'Content e actor sono richiesti' 
        });
      }

      const message = await createMessage(content, actor);
      res.status(201).json(message);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Route per eliminare un messaggio
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await deleteMessage(id);
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
};

// Funzioni di supporto
async function getMessage(id) {
  return new Promise((resolve) => {
    gun.get('messages').get(id).once((data) => {
      resolve(data);
    });
  });
}

async function createMessage(content, actor) {
  const id = crypto.randomBytes(16).toString('hex');
  const message = {
    id,
    content,
    actor,
    type: 'Note',
    published: new Date().toISOString(),
    '@context': 'https://www.w3.org/ns/activitystreams'
  };

  return new Promise((resolve, reject) => {
    gun.get('messages').get(id).put(message, (ack) => {
      if (ack.err) {
        reject(new Error(ack.err));
      } else {
        resolve(message);
      }
    });
  });
}

async function deleteMessage(id) {
  return new Promise((resolve, reject) => {
    gun.get('messages').get(id).put(null, (ack) => {
      if (ack.err) {
        reject(new Error(ack.err));
      } else {
        resolve(true);
      }
    });
  });
}

export default router;
