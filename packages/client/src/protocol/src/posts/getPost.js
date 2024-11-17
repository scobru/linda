import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Retrieves a post from the decentralized network by its ID
 *
 * @async
 * @function getPost
 * @param {string} postId - The unique identifier of the post to retrieve
 * @returns {Promise<Object>} A promise that resolves to the post object
 * @throws {Error} If post is not found
 *
 * @description
 * This function fetches a post from the Gun database by:
 * 1. Looking up the post by its ID in the posts collection
 * 2. Returning the post data if found
 * 3. Throwing an error if the post doesn't exist
 *
 * @example
 * try {
 *   const post = await getPost("post_123456789");
 *   console.log("Retrieved post:", post);
 * } catch (error) {
 *   console.error("Failed to get post:", error.message);
 * }
 */
const getPost = async (postId) => {
  const post = await gun.get(DAPP_NAME).get('posts').get(postId).once();

  if (!post) throw new Error('Post not found');
  return post;
};

export default getPost;
