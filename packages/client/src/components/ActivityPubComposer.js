import React, { useState } from 'react';
import { Box, TextField, Button, Alert, CircularProgress } from '@mui/material';

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

      const activity = {
        type: 'Create',
        object: {
          type: 'Note',
          content: content.trim()
        }
      };

      const response = await fetch(
        `${process.env.REACT_APP_RELAY_URL || 'http://localhost:8765'}/users/${username}/outbox`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/activity+json'
          },
          body: JSON.stringify(activity)
        }
      );

      if (!response.ok) {
        throw new Error('Errore nella pubblicazione del post');
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
    <Box component="form" onSubmit={handleSubmit} p={2}>
      <TextField
        fullWidth
        multiline
        rows={3}
        variant="outlined"
        placeholder="Cosa stai pensando?"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={loading}
        sx={{ mb: 2 }}
      />
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2 }}>Post pubblicato con successo!</Alert>}
        </Box>
        <Button
          type="submit"
          variant="contained"
          disabled={!content.trim() || loading}
          endIcon={loading && <CircularProgress size={20} />}
        >
          Pubblica
        </Button>
      </Box>
    </Box>
  );
};

export default ActivityPubComposer; 