import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Deletes a post from the system by its unique key identifier.
 *
 * @async
 * @function deletePost
 * @param {string} postId - The unique key identifier of the post to delete
 * @returns {Promise<void>} A promise that resolves when the post is deleted
 * @throws {Error} If user is not authenticated
 * @throws {Error} If post is not found
 * @throws {Error} If user is not the post author
 *
 * @description
 * This function handles post deletion by:
 * 1. Verifying user authentication
 * 2. Checking if post exists
 * 3. Verifying user is post author
 * 4. Setting post value to null in Gun database
 *
 * @example
 * try {
 *   await deletePost("post_123456789");
 *   console.log("Post deleted successfully");
 * } catch (error) {
 *   console.error("Failed to delete post:", error.message);
 * }
 */
const deletePost = async (postId) => {
  if (!user.is) throw new Error('User not authenticated');

  const post = await gun.get(DAPP_NAME).get('posts').get(postId).once();

  if (!post) throw new Error('Post not found');
  if (post.author !== user.is.pub) throw new Error('Not authorized');

  await gun.get(DAPP_NAME).get('posts').get(postId).put(null);
};

export default deletePost;
