import { gun, user, DAPP_NAME } from '../../../state';
import encryptTodo from './encryptTodo';

const updateTodo = async (key, updates, token) => {
  if (!user.is) {
    throw new Error('Utente deve essere autenticato per modificare un todo');
  }

  const dbTodos = gun.get(DAPP_NAME).get('todos');
  const todo = await dbTodos.get(key).then();
  
  if (!todo) {
    throw new Error('Todo non trovato');
  }

  // Verifica che l'utente sia il proprietario del todo
  if (todo.author !== user.is.pub) {
    throw new Error('Non hai i permessi per modificare questo todo');
  }

  const updatedTodo = {
    text: todo.text,
    completed: updates.completed !== undefined ? updates.completed : todo.completed,
    createdAt: todo.createdAt,
    updatedAt: Date.now(),
    author: todo.author,
    encrypted: todo.encrypted
  };

  if (updates.text) {
    updatedTodo.text = await encryptTodo(updates.text, token);
    updatedTodo.encrypted = true;
  }

  await dbTodos.get(key).put(updatedTodo);
};

export default updateTodo; 