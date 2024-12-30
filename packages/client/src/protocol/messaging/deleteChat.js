import { gun, user, DAPP_NAME } from '../useGun.js';
import { chatList } from './chatList.js';

export const deleteChat = async (chatId) => {
  if (!user.is) throw new Error('User not authenticated');
  if (!chatId) throw new Error('Chat ID is required');

  try {
    // Elimina la chat
    await chatList.delete(chatId);

    return {
      success: true,
      message: 'Chat deleted successfully',
    };
  } catch (error) {
    console.error('Error deleting chat:', error);
    throw error;
  }
};

export default deleteChat;
