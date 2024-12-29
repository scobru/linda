/**
 * @module Linda/Messenger/Notes
 * @description Module for managing encrypted and public notes
 */

/**
 * @typedef {Object} Note
 * @property {string} id - Unique identifier for the note
 * @property {string} title - Note title
 * @property {string} content - Note content
 * @property {string} author - Note author
 * @property {boolean} isPublic - Whether note is public
 * @property {string} lastUpdated - Last modification timestamp
 */

/**
 * @function createNote
 * @description Creates a new note with optional encryption
 * @param {string} title - Note title
 * @param {string} author - Note author
 * @param {string} content - Note content
 * @param {boolean} isPublic - Whether note should be public
 * @returns {Promise<string>} Note identifier hash
 */

/**
 * @function deleteNote
 * @description Deletes an existing note
 * @param {string} hash - Note identifier
 * @param {boolean} isPublic - Whether note is public
 * @returns {Promise<void>}
 */

/**
 * @function getNote
 * @description Retrieves a note by hash
 * @param {string} hash - Note identifier
 * @returns {Promise<Note>} Note object
 */

/**
 * @function updateNote
 * @description Updates an existing note
 * @param {string} hash - Note identifier
 * @param {string} title - New title
 * @param {string} author - New author
 * @param {string} content - New content
 * @param {boolean} isPublic - Note visibility
 * @returns {Promise<void>}
 */

/**
 * @function getUserNotes
 * @description Gets all notes for current user
 * @returns {Promise<Note[]>} Array of notes
 */

import createNote from './createNote.js';
import deleteNote from './deleteNote.js';
import getNote from './getNote.js';
import updateNote from './updateNote.js';
import getUserNotes from './getUserNotes.js';

export { createNote, deleteNote, getNote, updateNote, getUserNotes };

export default {
  createNote,
  deleteNote,
  getNote,
  updateNote,
  getUserNotes,
};
