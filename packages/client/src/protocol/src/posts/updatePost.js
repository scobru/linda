import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Updates an existing post in the decentralized network
 *
 * @async
 * @function updatePost
 * @param {string} postId - The unique identifier of the post to update
 * @param {Object} updates - Object containing the fields to update
 * @returns {Promise<void>} A promise that resolves when the post is updated
 * @throws {Error} If user is not authenticated
 * @throws {Error} If post is not found
 * @throws {Error} If user is not the post author
 *
 * @description
 * This function updates a post by:
 * 1. Verifying user authentication
 * 2. Checking if post exists
 * 3. Verifying user is post author
 * 4. Merging updates with existing post data
 * 5. Saving updated post to Gun database
 *
 * @example
 * try {
 *   await updatePost("post_123", { content: "Updated content" });
 *   console.log("Post updated successfully");
 * } catch (error) {
 *   console.error("Failed to update post:", error.message);
 * }
 */
const updatePost = async (postId, updates) => {
  if (!user.is) throw new Error('User not authenticated');

  const post = await gun.get(DAPP_NAME).get('posts').get(postId).once();

  if (!post) throw new Error('Post not found');
  if (post.author !== user.is.pub) throw new Error('Not authorized');

  const updatedPost = {
    ...post,
    ...updates,
    lastUpdated: Date.now(),
  };

  await gun.get(DAPP_NAME).get('posts').get(postId).put(updatedPost);
};

export default updatePost;
