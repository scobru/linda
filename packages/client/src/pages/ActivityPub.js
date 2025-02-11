import React, { useState } from 'react';
import { Container, Paper, Box, Typography, TextField, Button } from '@mui/material';
import ActivityPubFeed from '../components/ActivityPubFeed';
import ActivityPubComposer from '../components/ActivityPubComposer';
import { gun, user,  activityPubManager, ACTIVITYPUB_URL } from '../protocol/useGun';

const ActivityPubPage = () => {
  const [currentUsername, setCurrentUsername] = useState('');
  const [error, setError] = useState(null);

  const handleConnect = async (e) => {
    e.preventDefault();
    console.log('Avvio connessione ActivityPub...');

    try {
      // 1. Verifica stato autenticazione
      if (!user?.is) {
        throw new Error('Devi effettuare il login prima');
      }

      const alias = user.is?.alias;
      if (!alias) {
        throw new Error('Impossibile ottenere il tuo username');
      }

      console.log('Tentativo di connessione per alias:', alias);

      // 2. Richiesta al relay
      console.log('Invio richiesta al relay:', `${ACTIVITYPUB_URL}/api/activitypub/accounts`);
      const response = await fetch(`${ACTIVITYPUB_URL}/api/activitypub/accounts`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Pub': user._.sea.pub
        },
        body: JSON.stringify({ 
          account: alias 
        })
      });

      let data = null;

      // 3. Gestione errori HTTP
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Risposta non ok dal server:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        
        if(response.status == 409) {
          data = errorData.account;
          console.log('Account esistente:', data);
        }
      } else {
        data = await response.json();
      }

      // 4. Salvataggio sicuro delle chiavi
      console.log('Risposta ricevuta dal server:', { data, privateKey: '[NASCOSTA]' });
      
      if (!data.success || !data.apiKey) {
        throw new Error('Risposta del server non valida');
      }

      await activityPubManager.saveKeys(
        { publicKey: data.publicKey, privateKey: data.privateKey }
      );

      // 5. Aggiornamento stato UI
      localStorage.setItem('apiKey', data.apiKey);
      setCurrentUsername(alias);
      setError(null);

      console.log('Connessione ActivityPub completata con successo per:', alias);

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