import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Retrieves all posts from a specific user in the decentralized network
 *
 * @async
 * @function getUserPosts
 * @param {string} [userPub=null] - The public key of the user whose posts to retrieve. If null, gets current user's posts
 * @returns {Promise<Array>} A promise that resolves to an array of post objects, sorted by creation date
 * @throws {Error} If no user public key is available
 *
 * @description
 * This function fetches all posts for a user by:
 * 1. Using provided public key or current user's public key
 * 2. Querying the posts collection for matching author
 * 3. Filtering out system entries and invalid posts
 * 4. Sorting posts by creation date (newest first)
 *
 * @example
 * try {
 *   // Get posts for specific user
 *   const userPosts = await getUserPosts("user-public-key-123");
 *   console.log("User posts:", userPosts);
 *
 *   // Get current user's posts
 *   const myPosts = await getUserPosts();
 *   console.log("My posts:", myPosts);
 * } catch (error) {
 *   console.error("Failed to get posts:", error.message);
 * }
 */
const getUserPosts = async (userPub = null) => {
  const targetPub = userPub || (user.is ? user.is.pub : null);
  if (!targetPub) throw new Error('User public key required');

  return new Promise((resolve) => {
    const posts = [];
    gun
      .get(DAPP_NAME)
      .get('posts')
      .map()
      .once((post, id) => {
        if (post && post.author === targetPub && !post._ && id !== '_') {
          posts.push({
            ...post,
            id,
          });
        }
      });

    setTimeout(() => {
      resolve(posts.sort((a, b) => b.created - a.created));
    }, 500);
  });
};

export default getUserPosts;
