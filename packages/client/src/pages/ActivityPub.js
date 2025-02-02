import React, { useState } from 'react';
import { Container, Paper, Box, Typography, TextField, Button } from '@mui/material';
import ActivityPubFeed from '../components/ActivityPubFeed';
import ActivityPubComposer from '../components/ActivityPubComposer';
import { WalletManager, StorageType } from '@scobru/shogun';
import { gun, user , walletManager, ACTIVITYPUB_URL} from '../protocol/useGun';

const ActivityPubPage = () => {
  const [username, setUsername] = useState('');
  const [currentUsername, setCurrentUsername] = useState('');
  const [error, setError] = useState(null);

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;

    try {
      // Verifica che l'utente sia autenticato
      if (!user._.sea.pub) {
        throw new Error('Utente non autenticato');
      }

      // Crea l'account ActivityPub
      const createResponse = await fetch(`${ACTIVITYPUB_URL}/api/admin/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          account: username.trim()
        })
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(errorData.error || 'Errore nella creazione dell\'account');
      }

      // Genera le chiavi RSA per ActivityPub
      const activityPubKeys = await walletManager.generateActivityPubKeys();
      
      // Salva le chiavi sia su Gun che localmente
      await walletManager.saveActivityPubKeys(activityPubKeys, StorageType.BOTH);

      // Imposta l'username corrente
      setCurrentUsername(username.trim());
      setError(null);
    } catch (err) {
      console.error('Errore nella creazione dell\'utente:', err);
      setError(err.message);
    }
  };

  return (
    <Container maxWidth="md">
      <Box py={4}>
        <Typography variant="h4" component="h1" gutterBottom>
          ActivityPub Feed
        </Typography>

        <Paper sx={{ mb: 4 }}>
          <Box p={2} component="form" onSubmit={handleConnect}>
            <Typography variant="h6" gutterBottom>
              Connetti al tuo account ActivityPub
            </Typography>
            <Box display="flex" gap={2}>
              <TextField
                fullWidth
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="es. scobru_test"
                error={!!error}
                helperText={error}
              />
              <Button
                variant="contained"
                type="submit"
                disabled={!username.trim()}
              >
                Connetti
              </Button>
            </Box>
          </Box>
        </Paper>

        {currentUsername && (
          <>
            <Paper sx={{ mb: 4 }}>
              <ActivityPubComposer
                username={currentUsername}
                onPostCreated={() => {
                  // Forza l'aggiornamento del feed
                  const feed = document.querySelector('#activity-pub-feed');
                  if (feed) {
                    feed.dispatchEvent(new Event('refresh'));
                  }
                }}
              />
            </Paper>

            <Paper id="activity-pub-feed">
              <ActivityPubFeed username={currentUsername} />
            </Paper>
          </>
        )}
      </Box>
    </Container>
  );
};

export default ActivityPubPage; 