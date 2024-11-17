/**
 * @module sendVoiceMessage
 * @description Module for sending voice messages between users
 */

import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Sends a voice message to a recipient in a chat room
 * @async
 * @param {string} roomId - The ID of the chat room where the message will be sent
 * @param {string} publicKey - The public key of the message recipient
 * @param {Object} voiceRecording - The voice message data to be sent
 * @param {Function} [callback] - Optional callback function to handle the result
 * @returns {void}
 * @throws {Error} If user is not authenticated or certificates are missing
 */
let sendVoiceMessage = (
  roomId,
  publicKey,
  voiceRecording,
  callback = () => {}
) => {
  (async (callback = () => {}) => {
    let userPub = await gun.user().pair().pub;

    if (!userPub)
      return callback({
        errMessage: 'Could not find pub.',
        errCode: 'failed-to-find-pub',
        success: undefined,
      });

    let createMessagesCertificate = await gun
      .user(publicKey)
      .get(DAPP_NAME)
      .get('certificates')
      .get(userPub)
      .get('messages');

    if (!createMessagesCertificate)
      return callback({
        errMessage: 'Could not find friend certificate to create message',
        errCode: 'failed-to-find-friend-messages-certificate',
        success: undefined,
      });

    let updateMetaCertificate = await gun
      .user(publicKey)
      .get(DAPP_NAME)
      .get('certificates')
      .get(userPub)
      .get('chats');

    if (!updateMetaCertificate)
      return callback({
        errMessage: 'Could not find friend certificate to add meta to chat',
        errCode: 'failed-to-find-friend-chats-certificate',
        success: undefined,
      });

    gun
      .user()
      .get(DAPP_NAME)
      .get('chats')
      .get(roomId)
      .get('latestMessage')
      .put(voiceRecording);

    gun
      .user(publicKey)
      .get(DAPP_NAME)
      .get('chats')
      .get(roomId)
      .get('latestMessage')
      .put(voiceRecording, null, { opt: { cert: updateMetaCertificate } });

    gun
      .user()
      .get(DAPP_NAME)
      .get('messages')
      .get(roomId)
      .set(voiceRecording, ({ err }) => {
        if (err)
          return callback({
            errMessage: err,
            errCode: 'message-creation-error',
            success: undefined,
          });
        else
          gun
            .user(publicKey)
            .get(DAPP_NAME)
            .get('messages')
            .get(roomId)
            .set(
              voiceRecording,
              ({ err }) => {
                if (err)
                  return callback({
                    errMessage: err,
                    errCode: 'message-creation-error',
                    success: undefined,
                  });
                else
                  return callback({
                    errMessage: undefined,
                    errCode: undefined,
                    success: 'Created a voice message with friend.',
                  });
              },
              { opt: { cert: createMessagesCertificate } }
            );
      });
  })(callback);
};

export default sendVoiceMessage;
