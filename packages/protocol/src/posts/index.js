/**
 * @module Posts
 * @description
 * Module for managing encrypted social posts in a decentralized network.
 * Provides functionality for creating, reading, updating and deleting posts,
 * as well as retrieving posts by user.
 *
 * @exports {Function} createPost - Creates a new encrypted post
 * @exports {Function} deletePost - Deletes an existing post
 * @exports {Function} getPost - Retrieves a single post by ID
 * @exports {Function} updatePost - Updates an existing post
 * @exports {Function} getUserPosts - Gets all posts for a user
 */

import createPost from './createPost.js';
import deletePost from './deletePost.js';
import getPost from './getPost.js';
import updatePost from './updatePost.js';
import getUserPosts from './getUserPosts.js';

export { createPost, deletePost, getPost, updatePost, getUserPosts };

export default {
  createPost,
  deletePost,
  getPost,
  updatePost,
  getUserPosts,
};
