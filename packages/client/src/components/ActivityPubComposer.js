import React, { useState } from 'react';
import { Box, TextField, Button, Alert, CircularProgress, Typography } from '@mui/material';
import { ACTIVITYPUB_URL , walletManager } from '../protocol/useGun';

const ActivityPubComposer = ({ username, onPostCreated }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    try {
      setLoading(true);
      setError(null);
      setSuccess(false);

      const apiKey = localStorage.getItem('apiKey');
      if (!apiKey) {
        throw new Error('API key non trovata. Effettua nuovamente l\'accesso.');
      }

      const response = await fetch(
        `${process.env.REACT_APP_RELAY_URL || ACTIVITYPUB_URL }/users/${username}/outbox`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/activity+json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            "@context": "https://www.w3.org/ns/activitystreams",
            type: "Note",
            content: content.trim()
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Errore nella pubblicazione');
      }

      setContent('');
      setSuccess(true);
      if (onPostCreated) {
        onPostCreated();
      }
    } catch (err) {
      console.error('Errore nella pubblicazione:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box p={2}>
      <form onSubmit={handleSubmit}>
        <TextField
          fullWidth
          multiline
          rows={4}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Scrivi il tuo post..."
          disabled={loading}
        />
        <Box mt={2} display="flex" justifyContent="flex-end">
          <Button
            type="submit"
            variant="contained"
            disabled={!content.trim() || loading}
          >
            {loading ? 'Pubblicazione...' : 'Pubblica'}
          </Button>
        </Box>
        {error && (
          <Box mt={2}>
            <Typography color="error">{error}</Typography>
          </Box>
        )}
        {success && (
          <Box mt={2}>
            <Typography color="success">Post pubblicato con successo!</Typography>
          </Box>
        )}
      </form>
    </Box>
  );
};

export default ActivityPubComposer; 