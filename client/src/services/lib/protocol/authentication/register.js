import { gun, user } from '../../../state';
import { generateFriendRequestsCertificate } from '../security';

/**
 * This function will register a new user.
 *
 * @param {object} credentials - The user's registration credentials.
 * @param {string} credentials.username - The user's username.
 * @param {string} credentials.password - The user's password.
 * @param {Function} callback - The callback function that returns error or success messages.
 * @returns {Promise<object>} A promise that resolves with the registration result.
 */
const registerUser = (credentials = {}, callback = () => {}) => {
  (async () => {
    try {
      // Verifica se l'username è già in uso
      const existingUser = await new Promise((resolve) => {
        gun.get(`~@${credentials.username}`).once((user) => resolve(user));
      });

      if (existingUser) {
        return callback({
          errMessage: 'Username in uso.',
          errCode: 'username-inuse',
        });
      }

      // Registra il nuovo utente
      user.create(
        credentials.username,
        credentials.password,
        async ({ err, pub }) => {
          if (err) {
            return callback({ errMessage: err, errCode: 'gun-auth-error' });
          }

          // Aggiorna il conteggio degli utenti
          await new Promise((resolve) => {
            gun
              .get('userList')
              .get('count')
              .once(async (currentCount) => {
                const newCount = (currentCount || 0) + 1;
                gun.get('userList').get('count').put(newCount);

                // Aggiungi l'utente alla lista
                gun.get('userList').get('users').set({
                  pub,
                  username: credentials.username,
                  timestamp: Date.now(),
                });

                let addFriendRequestCertificate = await gun
                  .user(user.is.pub)
                  .get('certificates')
                  .get('friendRequests');

                if (!addFriendRequestCertificate) {
                  await generateFriendRequestsCertificate();
                }

                resolve();
              });
          });

          return callback({
            errMessage: undefined,
            errCode: undefined,
            pub,
            message: 'Successfully created user.',
          });
        }
      );
    } catch (error) {
      callback({
        errMessage: error.message,
        errCode: 'registration-error',
      });
    }
  })();
};

export default registerUser;
