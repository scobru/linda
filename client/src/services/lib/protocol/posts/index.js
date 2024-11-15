/**
 * @module Linda/Messenger/Posts
 * @description Module for managing encrypted social posts
 */

/**
 * @typedef {Object} Post
 * @property {string} id - Unique post identifier
 * @property {string} text - Post content
 * @property {string} author - Post author's public key
 * @property {number} createdAt - Creation timestamp
 * @property {number} updatedAt - Last update timestamp
 * @property {boolean} encrypted - Whether post is encrypted
 */

/**
 * @function createPost
 * @description Creates a new encrypted post
 * @param {string} content - Post content
 * @param {string} token - Encryption token
 * @returns {Promise<string>} Post identifier
 */

/**
 * @function deletePost
 * @description Deletes an existing post
 * @param {string} key - Post identifier
 * @returns {Promise<void>}
 */

/**
 * @function getPost
 * @description Retrieves a single post
 * @param {string} key - Post identifier
 * @param {string} token - Decryption token
 * @returns {Promise<Post>} Decrypted post
 */

/**
 * @function updatePost
 * @description Updates an existing post
 * @param {string} key - Post identifier
 * @param {Object} post - Updated post data
 * @param {string} token - Encryption token
 * @returns {Promise<void>}
 */

/**
 * @function decryptPost
 * @description Decrypts post content
 * @param {Object} post - Encrypted post
 * @param {string} token - Decryption token
 * @returns {Promise<string>} Decrypted content
 */

/**
 * @function encryptPost
 * @description Encrypts post content
 * @param {string} post - Post content
 * @param {string} token - Encryption token
 * @returns {Promise<string>} Encrypted content
 */

/**
 * @function getAllPosts
 * @description Retrieves all posts
 * @param {string} token - Decryption token
 * @returns {Promise<Post[]>} Array of decrypted posts
 */

import createPost from './createPost';
import deletePost from './deletePost';
import updatePost from './updatePost';
import decryptPost from './decryptPost';
import encryptPost from './encryptPost';
import { getAllPosts, getPost } from './getPost';

export {
  createPost,
  deletePost,
  getPost,
  updatePost,
  decryptPost,
  encryptPost,
  getAllPosts,
};
