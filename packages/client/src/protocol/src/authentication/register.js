import { gun, user, DAPP_NAME } from '../useGun.js';
import { createFriendRequestCertificate } from '../security/index.js';

const REGISTRATION_TIMEOUT = 10000; // 10 seconds

/**
 * Registers a new user in the system.
 *
 * This function handles the registration process by:
 * 1. Validating the provided credentials
 * 2. Checking if username is available
 * 3. Creating the user in Gun's user system
 * 4. Updating user counts and lists
 * 5. Setting up friend request certificates
 *
 * @param {Object} credentials - The user's registration credentials
 * @param {string} credentials.username - The desired username
 * @param {string} credentials.password - The user's password (minimum 8 characters)
 * @param {Function} callback - Optional callback function that receives the registration result
 * @returns {Promise<Object>} Promise that resolves with:
 *   - success: {boolean} Whether registration succeeded
 *   - pub: {string} The user's public key
 *   - message: {string} Status message
 * @throws {Error} If credentials are invalid or registration fails
 */
const registerUser = (credentials = {}, callback = () => {}) => {
  let timeoutId;

  const registrationPromise = new Promise(async (resolve, reject) => {
    try {
      // Password validation
      if (!credentials.password || credentials.password.length < 8) {
        reject(new Error('La password deve essere di almeno 8 caratteri.'));
        return;
      }

      // Check if username is already taken
      const existingUser = await new Promise((resolve) => {
        gun.get(`~@${credentials.username}`).once((user) => resolve(user));
      });

      if (existingUser) {
        reject(new Error('Username in uso.'));
        return;
      }

      // Register the new user
      user.create(
        credentials.username,
        credentials.password,
        async ({ err, pub }) => {
          if (err) {
            reject(new Error(err));
            return;
          }

          try {
            // Update user count
            await new Promise((resolve) => {
              gun
                .get(DAPP_NAME)
                .get('userList')
                .get('count')
                .once(async (currentCount) => {
                  const newCount = (currentCount || 0) + 1;
                  gun.get(DAPP_NAME).get('userList').get('count').put(newCount);

                  // Add user to list
                  gun.get(DAPP_NAME).get('userList').get('users').set({
                    pub,
                    username: credentials.username,
                    timestamp: Date.now(),
                  });

                  let addFriendRequestCertificate = gun
                    .user(user.is.pub)
                    .get(DAPP_NAME)
                    .get('certificates')
                    .get('friendRequests');

                  if (!addFriendRequestCertificate) {
                    await createFriendRequestCertificate();
                  }

                  resolve();
                });
            });

            resolve({
              success: true,
              pub,
              message: 'Successfully created user.',
            });
          } catch (error) {
            reject(error);
          }
        }
      );
    } catch (error) {
      reject(error);
    }
  });

  // Set timeout
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Timeout durante la registrazione'));
    }, REGISTRATION_TIMEOUT);
  });

  // Execute registration with timeout
  Promise.race([registrationPromise, timeoutPromise])
    .then((result) => {
      clearTimeout(timeoutId);
      callback({
        success: true,
        ...result,
      });
    })
    .catch((error) => {
      clearTimeout(timeoutId);
      callback({
        success: false,
        errMessage: error.message,
        errCode: 'registration-error',
      });
    });
};

export default registerUser;
