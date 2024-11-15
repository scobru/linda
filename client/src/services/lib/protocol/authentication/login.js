import { gun, user } from '../../../state';
import { generateFriendRequestsCertificate } from '../security';

/**
 * This function will authenticate a user who has registered.
 *
 * @param {object} credentials - The user's authentication credentials.
 * @param {string} credentials.username - The user's username.
 * @param {string} credentials.password - The user's password.
 * @param {Function} callback - The callback function that returns error or success messages.
 * @returns {Promise<object>} A promise that resolves with the authentication result.
 */
const loginUser = async (credentials = {}, callback = () => {}) => {
  try {
    if (!credentials.username || !credentials.password) {
      const error = new Error('Username and password are required');
      callback({ errMessage: error.message, errCode: 'invalid-credentials', success: false });
      return { errMessage: error.message, errCode: 'invalid-credentials', success: false };
    }

    return new Promise((resolve) => {
      gun.user().auth(credentials.username, credentials.password, async (ack) => {
        if (ack.err) {
          const result = {
            errMessage: ack.err,
            errCode: 'gun-auth-error',
            success: false,
          };
          callback(result);
          resolve(result);
          return;
        }

        // Attendi che user.is sia disponibile
        let attempts = 0;
        const maxAttempts = 10;
        
        const checkUser = setInterval(() => {
          attempts++;
          console.log('Checking user.is:', user.is, 'Attempt:', attempts); // Debug log

          if (user.is) {
            clearInterval(checkUser);
            const result = {
              errMessage: undefined,
              errCode: undefined,
              pub: user.is.pub,
              message: 'Successfully authenticated user.',
              success: true,
              user: user.is,
            };
            callback(result);
            resolve(result);
          } else if (attempts >= maxAttempts) {
            clearInterval(checkUser);
            const result = {
              errMessage: 'Failed to get user data',
              errCode: 'user-data-error',
              success: false,
            };
            callback(result);
            resolve(result);
          }
        }, 100);
      });
    });
  } catch (error) {
    console.error('Error during login:', error);
    const result = {
      errMessage: error.message,
      errCode: 'login-error',
      success: false,
    };
    callback(result);
    return result;
  }
};

export default loginUser;
