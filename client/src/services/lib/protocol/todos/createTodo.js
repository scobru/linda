/**
 * Creates a new encrypted todo
 * @async
 * @function createTodo
 * @memberof module:Todos
 * 
 * @param {string} content - Content of the todo to encrypt
 * @param {string} token - Encryption token
 * @throws {Error} If user is not authenticated
 * @throws {Error} If creation fails
 * @returns {Promise<string>} ID of created todo
 * 
 * @example
 * const todoId = await createTodo('Buy milk', 'encryption-token');
 */

import { gun, user, DAPP_NAME } from '../../../state';
import encryptTodo from './encryptTodo';

const createTodo = async (content, token) => {
  if (!user.is) {
    throw new Error('Utente deve essere autenticato per creare un todo');
  }

  try {
    const key = Date.now().toString();
    const encryptedContent = await encryptTodo(content, token);

    const todo = {
      text: encryptedContent,
      completed: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      author: user.is.pub,
      encrypted: true,
    };

    gun.get(DAPP_NAME)
       .get('todos')
       .get(key)
       .put(todo);
       
    return key;
  } catch (error) {
    console.error('Errore nella creazione del todo:', error);
    throw new Error(`Impossibile creare il todo: ${error.message}`);
  }
};

export default createTodo;