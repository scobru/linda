import React, { useState } from 'react';
import { Container, Paper, Box, Typography, TextField, Button } from '@mui/material';
import ActivityPubFeed from '../components/ActivityPubFeed';
import ActivityPubComposer from '../components/ActivityPubComposer';
import { WalletManager, StorageType } from '@scobru/shogun';
import { gun, user, walletManager, ACTIVITYPUB_URL } from '../protocol/useGun';

const ActivityPubPage = () => {
  const [currentUsername, setCurrentUsername] = useState('');
  const [error, setError] = useState(null);

  const handleConnect = async (e) => {
    e.preventDefault();
    console.log('Tentativo di connessione...');

    try {
      // Verifica che l'utente sia autenticato
      if (!user?._.sea?.pub) {
        throw new Error('Utente non autenticato');
      }
      console.log('Utente autenticato:', user.is?.alias);

      // Ottieni l'alias dell'utente
      const alias = user.is?.alias;
      if (!alias) {
        throw new Error('Alias non trovato');
      }
      console.log('Alias ottenuto:', alias);

      // Usa il nuovo endpoint
      const response = await fetch(`${ACTIVITYPUB_URL}/api/activitypub/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ account: alias })
      });

      const accountData = await response.json();
      
      // Salva tutto localmente
      await walletManager.saveActivityPubKeys(
        {
          publicKey: accountData.publicKey,
          privateKey: accountData.privateKey
        },
        StorageType.LOCAL
      );

      localStorage.setItem('apiKey', accountData.apiKey);
      setCurrentUsername(alias);
      setError(null);

    } catch (err) {
      console.error('Errore completo:', {
        name: err.name,
        message: err.message,
        stack: err.stack
      });
      setError(`Errore di connessione: ${err.message}`);
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
              <Button
                variant="contained"
                type="submit"
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