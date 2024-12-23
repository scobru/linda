#!/usr/bin/env node

/**
 * Command line interface for the Lonewolf protocol
 * @module cli
 * @requires gunblade
 * @requires protocol
 * @requires readline
 * @requires chalk
 * @requires ora
 * @requires commander
 * @requires url
 * @requires path
 */

import { gun, user, stateManager } from './useGun.js';
import { authentication, messaging, friends, groups } from './index.js';
import readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import { program, Option } from 'commander';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let currentUser = null;



/**
 * Get hidden password input from user
 * @param {string} prompt - Prompt message to display
 * @returns {Promise<string>} Entered password
 */
const getPasswordInput = async (prompt) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  // Hide input
  process.stdin.on('data', (char) => {
    char = char + '';
    switch (char) {
      case '\n':
      case '\r':
      case '\u0004':
        process.stdin.pause();
        break;
      default:
        process.stdout.write('*');
        break;
    }
  });

  return new Promise((resolve) => {
    rl.question(prompt, (password) => {
      process.stdout.write('\n');
      rl.close();
      resolve(password);
    });
  });
};

// Authentication commands
program
  .command('register')
  .description('Register a new user')
  .argument('<username>', 'Username')
  .option(
    '-p, --password <password>',
    'Password (will be prompted if not specified)'
  )
  .action(async (username, options) => {
    const spinner = ora('Registering...').start();

    try {
      const password =
        options.password || (await getPasswordInput('Password: '));

      // Add registration timeout
      const registrationPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Registration timeout'));
        }, 15000); // 15 seconds timeout

        authentication.registerUser(
          {
            username,
            password,
          },
          (result) => {
            clearTimeout(timeout);
            if (result.success) {
              resolve(result);
            } else {
              reject(new Error(result.errMessage || 'Registration error'));
            }
          }
        );
      });

      const result = await registrationPromise;

      if (result.success) {
        spinner.succeed(chalk.green('Registration successful'));
        console.log(chalk.blue(`Welcome ${username}! You can now login.`));
      } else {
        spinner.fail(chalk.red('Registration failed: ' + result.errMessage));
      }
    } catch (error) {
      spinner.fail(chalk.red('Error: ' + error.message));
    } finally {
      // Ensure process exits
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    }
  });

program
  .command('login')
  .description('Login to the system')
  .argument('<username>', 'Username')
  .option(
    '-p, --password <password>',
    'Password (will be prompted if not specified)'
  )
  .action(async (username, options) => {
    const spinner = ora('Logging in...').start();

    try {
      const password =
        options.password || (await getPasswordInput('Password: '));

      // Add login timeout
      const loginPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Login timeout'));
        }, 15000); // 15 seconds timeout

        authentication.loginUser(
          {
            username,
            password,
          },
          (result) => {
            clearTimeout(timeout);
            if (result.success) {
              resolve(result);
            } else {
              reject(new Error(result.errMessage || 'Login error'));
            }
          }
        );
      });

      const result = await loginPromise;

      if (result.success) {
        currentUser = result.user;
        spinner.succeed(chalk.green('Login successful'));
        console.log(chalk.blue(`Welcome ${username}!`));
      } else {
        spinner.fail(chalk.red('Login failed: ' + result.errMessage));
      }
    } catch (error) {
      spinner.fail(chalk.red('Error: ' + error.message));
    } finally {
      // Ensure process exits
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    }
  });

// Messaging commands
program
  .command('send')
  .description('Send a message')
  .argument('<recipient>', 'Recipient public key')
  .argument('<message>', 'Message text')
  .action(async (recipient, message) => {
    const spinner = ora('Sending message...').start();

    try {
      if (!currentUser) throw new Error('You must login first');

      const chatId = [currentUser.pub, recipient].sort().join('_');
      const result = await messaging.sendMessage(chatId, recipient, message);

      if (result.success) {
        spinner.succeed(chalk.green('Message sent'));
      } else {
        spinner.fail(chalk.red('Send failed: ' + result.errMessage));
      }
    } catch (error) {
      spinner.fail(chalk.red('Error: ' + error.message));
    }
  });

// Message reading commands
program
  .command('read')
  .description('Read chat messages')
  .argument('<chatId>', 'Chat ID')
  .option('-l, --limit <number>', 'Maximum number of messages', '50')
  .action(async (chatId, options) => {
    const spinner = ora('Loading messages...').start();

    try {
      if (!currentUser) throw new Error('You must login first');

      const subscription = messaging.messageList(chatId).subscribe({
        next: ({ initial, individual }) => {
          spinner.stop();

          if (initial) {
            console.log(chalk.yellow('\nChat messages:'));
            initial.slice(-options.limit).forEach((msg) => {
              const isOurs = msg.sender === currentUser.pub;
              console.log(
                chalk[isOurs ? 'green' : 'blue'](
                  `[${new Date(msg.timestamp).toLocaleTimeString()}] ${
                    isOurs ? 'You' : msg.senderAlias
                  }: ${msg.content}`
                )
              );
            });
          }

          if (individual) {
            const isOurs = individual.sender === currentUser.pub;
            console.log(
              chalk[isOurs ? 'green' : 'blue'](
                `[${new Date(individual.timestamp).toLocaleTimeString()}] ${
                  isOurs ? 'You' : individual.senderAlias
                }: ${individual.content}`
              )
            );
          }
        },
        error: (error) => {
          spinner.fail(chalk.red('Error: ' + error.message));
        },
      });

      // Handle exit
      process.on('SIGINT', () => {
        subscription.unsubscribe();
        process.exit();
      });
    } catch (error) {
      spinner.fail(chalk.red('Error: ' + error.message));
    }
  });

// Friend management commands
program
  .command('friends')
  .description('Friend management')
  .argument('<action>', 'Action to perform')
  .argument('[pubKey]', 'Friend public key (required for add/remove)')
  .addOption(
    new Option('-a, --action <type>', 'Action type').choices([
      'list',
      'add',
      'accept',
      'remove',
    ])
  )
  .action(async (action, pubKey, options) => {
    const spinner = ora('Processing...').start();

    try {
      if (!currentUser) throw new Error('You must login first');

      switch (action) {
        case 'list':
          const subscription = friends.friendsService
            .observeFriendsList()
            .subscribe({
              next: (friendsList) => {
                spinner.stop();
                console.log(chalk.yellow('\nFriends list:'));
                friendsList.forEach((friend) => {
                  console.log(chalk.blue(`- ${friend.alias} (${friend.pub})`));
                });
              },
              error: (error) => {
                spinner.fail(chalk.red('Error: ' + error.message));
              },
            });
          break;

        case 'add':
          if (!pubKey) throw new Error('Public key required');
          const addResult = await friends.addFriendRequest(pubKey);
          if (addResult.success) {
            spinner.succeed(chalk.green('Friend request sent'));
          } else {
            spinner.fail(chalk.red('Request failed: ' + addResult.errMessage));
          }
          break;

        default:
          spinner.fail(
            chalk.red('Invalid action. Use: list, add, accept, or remove')
          );
          break;
      }
    } catch (error) {
      spinner.fail(chalk.red('Error: ' + error.message));
    }
  });

// Group commands
program
  .command('group')
  .description('Group management')
  .argument('<action>', 'Action to perform')
  .argument('[groupId]', 'Group ID (required for some actions)')
  .argument('[message]', 'Message to send (required for send)')
  .addOption(
    new Option('-a, --action <type>', 'Action type').choices([
      'create',
      'list',
      'join',
      'leave',
      'send',
    ])
  )
  .action(async (action, groupId, message) => {
    const spinner = ora('Processing...').start();

    try {
      if (!currentUser) throw new Error('You must login first');

      switch (action) {
        case 'create':
          const name = await getPasswordInput('Group name: ');
          const newGroupId = await groups.createGroup(name);
          spinner.succeed(chalk.green(`Group created with ID: ${newGroupId}`));
          break;

        case 'send':
          if (!groupId || !message)
            throw new Error('Group ID and message required');
          const sendResult = await groups.sendGroupMessage(groupId, message);
          if (sendResult) {
            spinner.succeed(chalk.green('Message sent to group'));
          }
          break;

        default:
          spinner.fail(
            chalk.red('Invalid action. Use: create, list, join, leave, or send')
          );
          break;
      }
    } catch (error) {
      spinner.fail(chalk.red('Error: ' + error.message));
    }
  });

// Add global error handling
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('Unhandled promise rejection:', error));
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log(chalk.yellow('\nShutting down...'));
  if (gun) {
    gun.off();
  }
  process.exit();
});

program.parse();
