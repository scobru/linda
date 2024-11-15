import { gun, user, DAPP_NAME } from '../../../state';
import decryptTodo from './decryptTodo';

export const getTodo = async (key, token) => {
  const dbTodos = gun.get(DAPP_NAME).get('todos');
  
  const todo = await dbTodos.get(key).then();
  if (todo) {
    return await decryptTodo(todo, token);
  }
  return null;
};

export const getAllTodos = async (token) => {
  if (!user.is) {
    throw new Error('Utente deve essere autenticato per vedere i todos');
  }

  const dbTodos = gun.get(DAPP_NAME).get('todos');

  return new Promise((resolve) => {
    const todos = [];
    let completed = false;

    dbTodos.map().once(async (data, key) => {
      if (!data) return;

      try {
        if (data.author !== user.is.pub) {
          return;
        }

        if (data.encrypted && data.text) {
          try {
            const decryptedText = await decryptTodo(data.text, token);
            if (decryptedText) {
              todos.push({
                id: key,
                text: decryptedText,
                completed: data.completed || false,
                author: data.author,
                createdAt: data.createdAt,
                encrypted: true,
              });
            }
          } catch (decryptError) {
            console.warn(`Errore decifratura todo ${key}:`, decryptError);
          }
        } else if (data.text) {
          todos.push({
            id: key,
            text: data.text,
            completed: data.completed || false,
            author: data.author,
            createdAt: data.createdAt,
            encrypted: false,
          });
        }

        if (!completed) {
          completed = true;
          setTimeout(() => resolve(todos), 100);
        }
      } catch (err) {
        console.error(`Errore processando todo ${key}:`, err);
      }
    });

    setTimeout(() => {
      if (!completed) {
        completed = true;
        resolve(todos);
      }
    }, 1000);
  });
}; 