import { decrypt } from '../../crypto';
import { user } from '../../../state';

const decryptTodo = async (todo, token) => {
  if (!user.is) {
    throw new Error('Utente deve essere autenticato per decifrare i todos');
  }

  try {
    const decryptedText = await decrypt(todo, token);
    return decryptedText;
  } catch (error) {
    console.error('Errore di decifratura:', error);
    throw new Error('Impossibile decifrare il todo');
  }
};

export default decryptTodo; 