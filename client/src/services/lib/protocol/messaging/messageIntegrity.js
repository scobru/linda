import { SEA } from 'gun';

export const messageIntegrity = {
  sign: async (message, pair) => {
    const signature = await SEA.sign(JSON.stringify({
      content: message.content,
      timestamp: message.timestamp,
      sender: message.sender
    }), pair);
    
    return {
      ...message,
      signature
    };
  },

  verify: async (message, senderPub) => {
    if (!message.signature) return false;
    
    const verified = await SEA.verify(JSON.stringify({
      content: message.content,
      timestamp: message.timestamp,
      sender: message.sender
    }), senderPub, message.signature);
    
    return !!verified;
  }
}; 