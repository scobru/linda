import SEA from 'gun/sea.js';

/**
 * Utilities for message integrity and verification
 * @namespace messageIntegrity
 */
export const messageIntegrity = {
  /**
   * Signs a message using the provided key pair
   * @async
   * @param {Object} message - The message object to sign
   * @param {string} message.content - Message content
   * @param {number} message.timestamp - Message timestamp
   * @param {string} message.sender - Sender's public key
   * @param {Object} pair - Key pair for signing
   * @returns {Object} Message with added signature
   */
  sign: async (message, pair) => {
    const signature = await SEA.sign(
      JSON.stringify({
        content: message.content,
        timestamp: message.timestamp,
        sender: message.sender,
      }),
      pair
    );

    return {
      ...message,
      signature,
    };
  },

  /**
   * Verifies a message signature
   * @async
   * @param {Object} message - The message object to verify
   * @param {string} message.content - Message content
   * @param {number} message.timestamp - Message timestamp
   * @param {string} message.sender - Sender's public key
   * @param {string} message.signature - Message signature
   * @param {string} senderPub - Public key of the sender
   * @returns {boolean} True if signature is valid, false otherwise
   */
  verify: async (message, senderPub) => {
    if (!message.signature) return false;

    const verified = await SEA.verify(
      JSON.stringify({
        content: message.content,
        timestamp: message.timestamp,
        sender: message.sender,
      }),
      senderPub,
      message.signature
    );

    return !!verified;
  },
};
