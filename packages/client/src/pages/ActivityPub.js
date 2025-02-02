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
    console.log('Avvio connessione...');

    try {
      // 1. Verifica stato autenticazione
      if (!user?.is) throw new Error('Devi effettuare il login prima');
      const alias = user.is?.alias;
      if (!alias) throw new Error('Impossibile ottenere il tuo username');

      // 2. Richiesta al relay
      const response = await fetch(`${ACTIVITYPUB_URL}/api/activitypub/accounts`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Pub': user._.sea.pub // Aggiungi firma
        },
        body: JSON.stringify({ account: alias })
      });

      // 3. Gestione errori HTTP
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Errore sconosciuto' }));
        throw new Error(error.message || `Errore HTTP: ${response.status}`);
      }

      // 4. Salvataggio sicuro delle chiavi
      const { publicKey, privateKey, apiKey } = await response.json();
      
      await walletManager.saveActivityPubKeys(
        { publicKey, privateKey },
        StorageType.LOCAL
      );

      // 5. Aggiornamento stato UI
      localStorage.setItem('apiKey', apiKey);
      setCurrentUsername(alias);
      setError(null);

      console.log('Connessione ActivityPub riuscita per:', alias);

    } catch (err) {
      console.error('Errore di connessione ActivityPub:', err);
      setError(err.message);
      setCurrentUsername(null);
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