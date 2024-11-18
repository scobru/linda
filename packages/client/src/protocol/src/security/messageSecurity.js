import { SEA } from '../useGun.js';

export const signMessage = async (message, privateKey) => {
  try {
    // Crea una stringa ordinata e deterministica del messaggio
    const messageString = JSON.stringify(message, Object.keys(message).sort());
    
    // Firma il messaggio
    const signature = await SEA.sign(messageString, privateKey);
    
    return signature;
  } catch (error) {
    console.error('Error signing message:', error);
    throw error;
  }
};

export const verifyMessageSignature = async (message, signature, senderPub) => {
  try {
    // Crea una stringa ordinata e deterministica del messaggio
    const messageString = JSON.stringify(message, Object.keys(message).sort());
    
    // Verifica la firma
    const isValid = await SEA.verify(messageString, senderPub, signature);
    
    return !!isValid;
  } catch (error) {
    console.error('Error verifying message signature:', error);
    return false;
  }
};

export const encryptMessageForChannel = async (message, channelKey) => {
  try {
    const encryptedContent = await SEA.encrypt(message.content, channelKey);
    return {
      ...message,
      content: encryptedContent
    };
  } catch (error) {
    console.error('Error encrypting message:', error);
    throw error;
  }
};

export const decryptChannelMessage = async (message, channelKey) => {
  try {
    const decryptedContent = await SEA.decrypt(message.content, channelKey);
    return {
      ...message,
      content: decryptedContent
    };
  } catch (error) {
    console.error('Error decrypting message:', error);
    return {
      ...message,
      content: '[Messaggio non decifrabile]'
    };
  }
}; 