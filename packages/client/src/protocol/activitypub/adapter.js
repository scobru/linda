import { ACTIVITY_TYPES } from './index.js';

// Converte un post nel formato ActivityPub
export const convertPostToActivity = (post) => {
  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: ACTIVITY_TYPES.CREATE,
    object: {
      type: 'Note',
      content: post.content,
      published: post.timestamp,
      attributedTo: post.author,
      to: ['https://www.w3.org/ns/activitystreams#Public'],
      cc: post.mentions || []
    }
  };
};

// Converte una reazione nel formato ActivityPub
export const convertReactionToActivity = (reaction, postId) => {
  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: ACTIVITY_TYPES.LIKE,
    object: postId,
    published: new Date().toISOString()
  };
};

// Converte una richiesta di amicizia nel formato ActivityPub
export const convertFriendRequestToActivity = (targetUser) => {
  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: ACTIVITY_TYPES.FOLLOW,
    object: targetUser,
    published: new Date().toISOString()
  };
};

// Converte una risposta ad una richiesta di amicizia nel formato ActivityPub
export const convertFriendResponseToActivity = (targetUser, accepted) => {
  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: accepted ? ACTIVITY_TYPES.ACCEPT : ACTIVITY_TYPES.REJECT,
    object: {
      type: ACTIVITY_TYPES.FOLLOW,
      actor: targetUser
    },
    published: new Date().toISOString()
  };
}; 