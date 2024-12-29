import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Creates a new post in the decentralized network
 *
 * @async
 * @function createPost
 * @param {string} content - The content of the post
 * @param {Object} [metadata={}] - Optional metadata for the post
 * @returns {Promise<string>} The ID of the created post
 * @throws {Error} If user is not authenticated
 */
const createPost = async (content, metadata = {}) => {
  if (!user.is) throw new Error('User not authenticated');

  const postId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const postData = {
    id: postId,
    content,
    metadata,
    author: user.is.pub,
    authorAlias: user.is.alias,
    created: Date.now(),
    lastUpdated: Date.now(),
  };

  await gun.get(DAPP_NAME).get('posts').get(postId).put(postData);

  return postId;
};

export default createPost;
