import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { 
  handleActorEndpoint, 
  handleInbox, 
  handleOutbox,
  handleFollowers,
  handleFollowing 
} from './endpoints';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Logging middleware per il debug
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  next();
});

// Endpoint WebFinger per la scoperta degli utenti
app.get('/.well-known/webfinger', async (req, res) => {
  const resource = req.query.resource;
  if (!resource) {
    return res.status(400).json({ error: 'Resource parameter required' });
  }

  // Esempio: acct:username@domain.com
  const [, username] = resource.split(':');
  const [handle] = username.split('@');

  res.json({
    subject: resource,
    links: [{
      rel: 'self',
      type: 'application/activity+json',
      href: `http://localhost:${PORT}/users/${handle}`
    }]
  });
});

// Endpoint Actor
app.get('/users/:username', async (req, res) => {
  try {
    const actorData = await handleActorEndpoint(req.params.username);
    res.json(actorData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint Inbox
app.post('/users/:username/inbox', async (req, res) => {
  try {
    await handleInbox(req.body);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint Outbox
app.get('/users/:username/outbox', async (req, res) => {
  try {
    const activities = await handleOutbox();
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint Followers
app.get('/users/:username/followers', async (req, res) => {
  try {
    const followers = await handleFollowers(req.params.username);
    res.json(followers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint Following
app.get('/users/:username/following', async (req, res) => {
  try {
    const following = await handleFollowing(req.params.username);
    res.json(following);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server ActivityPub di test in esecuzione su http://localhost:${PORT}`);
}); 