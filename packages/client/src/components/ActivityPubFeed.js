import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Avatar, Button, CircularProgress } from '@mui/material';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import { ACTIVITYPUB_URL } from '#protocol/useGun';

const ActivityPubFeed = ({ username }) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${process.env.REACT_APP_RELAY_URL || ACTIVITYPUB_URL }/users/${username}/outbox`
      );

      if (!response.ok) {
        throw new Error('Errore nel caricamento dei post');
      }

      const data = await response.json();
      if (data && data.orderedItems) {
        setPosts(data.orderedItems);
      } else {
        setPosts([]);
      }
    } catch (err) {
      console.error('Errore nel caricamento del feed:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (username) {
      fetchPosts();
    }
  }, [username]);

  const handleRefresh = () => {
    fetchPosts();
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Typography color="error">{error}</Typography>
        <Button onClick={handleRefresh} variant="contained" sx={{ mt: 2 }}>
          Riprova
        </Button>
      </Box>
    );
  }

  if (!posts || posts.length === 0) {
    return (
      <Box p={3} textAlign="center">
        <Typography>Nessun post trovato.</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" p={2}>
        <Typography variant="h6">Feed ActivityPub</Typography>
        <Button onClick={handleRefresh} variant="outlined">
          Aggiorna
        </Button>
      </Box>
      {posts.map((post, index) => {
        if (!post || !post.object || !post.object.content) {
          return null; // Salta i post non validi
        }

        return (
          <Card key={index} sx={{ mb: 2, mx: 2 }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Avatar sx={{ mr: 2 }}>
                  {post.actor.split('/').pop().charAt(0).toUpperCase()}
                </Avatar>
                <Box>
                  <Typography variant="subtitle1">
                    {post.actor.split('/').pop()}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {formatDistanceToNow(new Date(post.published), {
                      addSuffix: true,
                      locale: it
                    })}
                  </Typography>
                </Box>
              </Box>
              <Typography variant="body1">{post.object.content}</Typography>
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
};

export default ActivityPubFeed; 