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

import createPost from "./createPost.js";
import deletePost from "./deletePost.js";
import getPost from "./getPost.js";
import updatePost from "./updatePost.js";
import getUserPosts from "./getUserPosts.js";
import {
  addReaction,
  removeReaction,
  getReactions,
  CONTENT_TYPES,
} from "../reactions/reactions";

export { createPost, deletePost, getPost, updatePost, getUserPosts };

export default {
  createPost,
  deletePost,
  getPost,
  updatePost,
  getUserPosts,
};

export const addPostReaction = async (postId, reaction, userPub) => {
  return await addReaction(CONTENT_TYPES.POST, postId, reaction, userPub);
};

export const removePostReaction = async (postId, reaction, userPub) => {
  return await removeReaction(CONTENT_TYPES.POST, postId, reaction, userPub);
};

export const getPostReactions = async (postId) => {
  return await getReactions(CONTENT_TYPES.POST, postId);
};
