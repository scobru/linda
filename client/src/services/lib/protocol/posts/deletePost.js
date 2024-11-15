import { gun, DAPP_NAME } from '../../../state';

/**
 * Deletes a post from the system by its unique key identifier.
 *
 * @async
 * @function deletePost
 * @param {string} key - The unique key identifier of the post to delete
 * @returns {Promise<void>} A promise that resolves when the post is deleted
 * @throws {Error} Throws error if deletion fails
 *
 * @description
 * This function deletes a post from the gun database by setting its value to null.
 * The post is identified by its unique key in the posts collection.
 *
 * @example
 * // Delete a post
 * await deletePost("post-123");
 */
const deletePost = async (key) => {
  const dbPosts = gun.get(DAPP_NAME).get('posts');
  await dbPosts.get(key).put(null);
};

export default deletePost;
