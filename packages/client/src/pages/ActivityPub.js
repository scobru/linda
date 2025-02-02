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

      // Genera le chiavi RSA per ActivityPub
      console.log('Generazione chiavi RSA...');
      const activityPubKeys = await walletManager.generateActivityPubKeys();
      
      // Salva le chiavi
      console.log('Salvataggio chiavi...');
      await walletManager.saveActivityPubKeys(activityPubKeys, StorageType.BOTH);

      // Crea la richiesta
      const apiUrl = `${process.env.REACT_APP_RELAY_URL || ACTIVITYPUB_URL}/api/admin/create`;
      console.log('Invio richiesta a:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('apiKey') || ''}`
        },
        body: JSON.stringify({
          account: alias,
          privateKey: activityPubKeys.privateKey
        })
      });

      console.log('Ricevuta risposta:', {
        status: response.status,
        statusText: response.statusText
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Dettaglio errore:', errorData);
        throw new Error(`Errore HTTP ${response.status}: ${response.statusText}`);
      }

      const createData = await response.json();
      console.log('Dati creazione:', createData);

      // Se l'account esiste già, recupera l'API key esistente
      if (createData.message === 'Account già esistente') {
        console.log('Account già esistente:', createData.account);
        // Recupera l'API key dal nodo privato
        const existingApiKey = await new Promise((resolve) => {
          user.get('apiKeys').get(alias).once(resolve);
        });
        if (existingApiKey) {
          localStorage.setItem('apiKey', existingApiKey);
        }
      } else {
        // Salva la nuova API key
        if (createData.apiKey) {
          localStorage.setItem('apiKey', createData.apiKey);
        }
      }

      // Imposta l'username corrente
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