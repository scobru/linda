/**
 * @module Linda/Messenger/Todos
 * @description Module for managing encrypted todo items with support for CRUD operations
 */

/**
 * @typedef {Object} Todo
 * @property {string} id - Unique todo identifier
 * @property {string} text - Todo content (encrypted)
 * @property {boolean} completed - Completion status
 * @property {string} author - Author's public key
 * @property {number} createdAt - Creation timestamp
 * @property {number} updatedAt - Last update timestamp
 * @property {boolean} encrypted - Whether content is encrypted
 */

/**
 * @typedef {Object} TodoUpdate
 * @property {string} [text] - New todo content
 * @property {boolean} [completed] - New completion status
 */

/**
 * @function createTodo
 * @description Creates a new encrypted todo item
 * @param {string} content - Todo content to encrypt
 * @param {string} token - Encryption token
 * @returns {Promise<string>} Todo identifier
 * @throws {Error} If user is not authenticated
 */

/**
 * @function deleteTodo
 * @description Deletes an existing todo
 * @param {string} key - Todo identifier
 * @returns {Promise<void>}
 */

/**
 * @function getTodo
 * @description Retrieves a single todo
 * @param {string} key - Todo identifier
 * @param {string} token - Decryption token
 * @returns {Promise<Todo>} Decrypted todo
 */

/**
 * @function updateTodo
 * @description Updates an existing todo
 * @param {string} key - Todo identifier
 * @param {TodoUpdate} updates - Fields to update
 * @param {string} token - Encryption token
 * @returns {Promise<void>}
 * @throws {Error} If user is not authenticated or not the todo owner
 */

/**
 * @function decryptTodo
 * @description Decrypts todo content
 * @param {Object} todo - Encrypted todo
 * @param {string} token - Decryption token
 * @returns {Promise<string>} Decrypted content
 * @throws {Error} If decryption fails
 */

/**
 * @function encryptTodo
 * @description Encrypts todo content
 * @param {string} todo - Todo content
 * @param {string} token - Encryption token
 * @returns {Promise<string>} Encrypted content
 */

/**
 * @function getAllTodos
 * @description Retrieves all todos for current user
 * @param {string} token - Decryption token
 * @returns {Promise<Todo[]>} Array of decrypted todos
 * @throws {Error} If user is not authenticated
 */

import createTodo from './createTodo';
import deleteTodo from './deleteTodo';
import updateTodo from './updateTodo';
import decryptTodo from './decryptTodo';
import encryptTodo from './encryptTodo';
import { getAllTodos, getTodo } from './getTodo';

export {
  createTodo,
  deleteTodo,
  getTodo,
  updateTodo,
  decryptTodo,
  encryptTodo,
  getAllTodos,
}; 