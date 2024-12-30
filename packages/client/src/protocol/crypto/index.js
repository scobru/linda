/**
 * SEA cryptography abstraction module providing encryption, decryption, signing, verification and hashing utilities.
 * Built on top of Gun's SEA (Security, Encryption, Authorization) cryptography module.
 * @module Crypto
 * @see {@link https://github.com/amark/gun/wiki/SEA} for SEA documentation
 */

// https://github.com/amark/gun/wiki/Snippets

import SEA from 'gun/sea.js';

/**
 * Checks if a given string is a valid hash.
 * A valid hash is a 44 character string ending with '='.
 *
 * @param {string} str - The string to check.
 * @returns {boolean} - Returns true if the string is a valid hash, otherwise false.
 * @example
 * isHash('abc123=') // false
 * isHash('dGhpcyBpcyBhIHZhbGlkIGhhc2ggc3RyaW5nIHRoYXQgaXMgbG9uZyBlbm91Z2g=') // true
 */
export function isHash(str) {
  return typeof str === 'string' && str.length === 44 && str.charAt(43) === '=';
}

/**
 * Represents a cryptographic entity with public keys.
 * @typedef {object} Entity
 * @property {string} pub - The public key used for verification.
 * @property {string} epub - The elliptic encryption public key used for encryption.
 */

/**
 * Encrypts data for one receiver entity using SEA's asymmetric encryption.
 * The process involves:
 * 1. Generating an encryption secret using receiver's epub and sender's pair
 * 2. Encrypting data with this secret
 *
 * @param {string} data - Stringified data to be encrypted.
 * @param {object} sender - SEA key pair of the sender containing epriv key.
 * @param {Entity} receiver - Recipient's public keys (pub and epub).
 * @returns {Promise<string>} - Encrypted data string ready for transmission.
 * @throws {Error} If encryption fails or parameters are invalid.
 * @example
 * const encrypted = await encFor(
 *   'secret message',
 *   senderKeyPair,
 *   { pub: 'receiverPub', epub: 'receiverEpub' }
 * );
 */
export async function encFor(data, sender, receiver) {
  const secret = await SEA.secret(receiver.epub, sender);
  const encryptedData = await SEA.encrypt(data, secret);
  return encryptedData;
}

/**
 * Decrypts a private message from an entity using SEA's asymmetric decryption.
 * The process involves:
 * 1. Generating decryption secret using sender's epub and receiver's pair
 * 2. Decrypting the data with this secret
 *
 * @param {string} data - Encrypted private data to be decrypted.
 * @param {Entity} sender - Sender's public keys (pub and epub).
 * @param {object} receiver - SEA key pair of the receiver containing epriv key.
 * @returns {Promise<string>} - Decrypted data in original form.
 * @throws {Error} If decryption fails or parameters are invalid.
 * @example
 * const decrypted = await decFrom(
 *   encryptedData,
 *   { pub: 'senderPub', epub: 'senderEpub' },
 *   receiverKeyPair
 * );
 */
export async function decFrom(data, sender, receiver) {
  const secret = await SEA.secret(sender.epub, receiver);
  const decryptedData = await SEA.decrypt(data, secret);
  return decryptedData;
}

/**
 * Encrypts data using a SEA key pair with symmetric encryption.
 * Uses the pair as the encryption key.
 *
 * @param {string} data - The data to encrypt.
 * @param {object} pair - The SEA key pair for encryption.
 * @returns {Promise<string>} The encrypted data string.
 * @throws {Error} If encryption fails or parameters are invalid.
 * @example
 * const encrypted = await encrypt('secret data', myKeyPair);
 */
export async function encrypt(data, pair) {
  const encryptedData = await SEA.encrypt(data, pair);
  return encryptedData;
}

/**
 * Decrypts data using a SEA key pair with symmetric decryption.
 * Uses the pair as the decryption key.
 *
 * @param {string} data - The encrypted data to decrypt.
 * @param {object} pair - The SEA key pair for decryption.
 * @returns {Promise<string>} The decrypted data in original form.
 * @throws {Error} If decryption fails or parameters are invalid.
 * @example
 * const decrypted = await decrypt(encryptedData, myKeyPair);
 */
export async function decrypt(data, pair) {
  const decryptedData = await SEA.decrypt(data, pair);
  return decryptedData;
}

/**
 * Generates a SHA-256 hash for the given text using SEA's work function.
 *
 * @param {string} text - The text to hash.
 * @returns {Promise<string>} The generated SHA-256 hash.
 * @throws {Error} If input is not a string.
 * @example
 * const hash = await hashText('hello world');
 */
export async function hashText(text) {
  if (typeof text !== 'string') {
    throw new Error('Input must be a string');
  }
  return await SEA.work(text, null, null, { name: 'SHA-256' });
}

/**
 * Generates a SHA-256 hash for the given object.
 * If input is an object, it is first stringified before hashing.
 *
 * @param {object|string} obj - The object or string to hash.
 * @returns {Promise<{hash: string, hashed: string}>} Object containing the hash and stringified input.
 * @throws {Error} If hashing fails.
 * @example
 * const { hash, hashed } = await hashObj({ foo: 'bar' });
 */
export async function hashObj(obj) {
  let hashed = typeof obj === 'string' ? obj : JSON.stringify(obj);
  let hash = await hashText(hashed);
  return { hash, hashed };
}

/**
 * Calculates a hex-encoded PBKDF2 hash for any string data with optional salt.
 *
 * @param {string} text - The text to hash.
 * @param {string} salt - The salt to use in the PBKDF2 function.
 * @returns {Promise<string>} The hex encoded PBKDF2 hash.
 * @throws {Error} If hashing fails.
 * @example
 * const shortHash = await getShortHash('hello', 'salt123');
 */
export async function getShortHash(text, salt) {
  return await SEA.work(text, null, null, {
    name: 'PBKDF2',
    encode: 'hex',
    salt,
  });
}

/**
 * Converts a standard base64 string to a URL-safe base64 string.
 * Replaces '+' with '-', '/' with '_', and '=' with '.'.
 *
 * @param {string} unsafe - The standard base64 string.
 * @returns {string|undefined} The URL-safe base64 string, or undefined if input is falsy.
 * @example
 * const safe = safeHash('abc+/=');  // Returns 'abc-_.'
 */
export function safeHash(unsafe) {
  if (!unsafe) return;
  const encode_regex = /[+=/]/g;
  return unsafe.replace(encode_regex, encodeChar);
}

/**
 * Helper function to encode individual characters for URL-safe base64.
 *
 * @param {string} c - The character to encode ('+', '=', or '/').
 * @returns {string} The encoded character ('-', '.', or '_').
 * @private
 */
function encodeChar(c) {
  switch (c) {
    case '+':
      return '-';
    case '=':
      return '.';
    case '/':
      return '_';
  }
}

/**
 * Converts a URL-safe base64 string back to a standard base64 string.
 * Replaces '-' with '+', '_' with '/', and '.' with '='.
 *
 * @param {string} safe - The URL-safe base64 string.
 * @returns {string|undefined} The standard base64 string, or undefined if input is falsy.
 * @example
 * const unsafe = unsafeHash('abc-_.');  // Returns 'abc+/='
 */
export function unsafeHash(safe) {
  if (!safe) return;
  const decode_regex = /[._-]/g;
  return safe.replace(decode_regex, decodeChar);
}

/**
 * Helper function to decode individual characters from URL-safe base64.
 *
 * @param {string} c - The character to decode ('-', '.', or '_').
 * @returns {string} The decoded character ('+', '=', or '/').
 * @private
 */
function decodeChar(c) {
  switch (c) {
    case '-':
      return '+';
    case '.':
      return '=';
    case '_':
      return '/';
  }
}

/**
 * Safely parses a JSON string, returning a default object if parsing fails.
 * Handles null inputs and objects that are already parsed.
 *
 * @param {string|object} input - The JSON string or object to parse.
 * @param {object} [def={}] - The default object to return if parsing fails.
 * @returns {object} The parsed object or the default object.
 * @example
 * const obj = safeJSONParse('{"foo": "bar"}');
 * const fallback = safeJSONParse(null, { default: true });
 */
export function safeJSONParse(input, def = {}) {
  // Convert null to empty object
  if (!input) {
    return def;
  } else if (typeof input === 'object') {
    return input;
  }
  try {
    return JSON.parse(input);
  } catch (e) {
    console.error('Error parsing JSON:', e);
    return def;
  }
}

/**
 * Signs data using a SEA key pair's private key.
 * Creates a cryptographic signature that can be verified with the corresponding public key.
 *
 * @param {string} data - The data to sign.
 * @param {object} pair - The SEA key pair containing the private key for signing.
 * @returns {Promise<string>} The signed data.
 * @throws {Error} If signing fails or parameters are invalid.
 * @example
 * const signature = await sign('verify this', myKeyPair);
 */
export async function sign(data, pair) {
  return await SEA.sign(data, pair);
}

/**
 * Verifies a signed data using a public key.
 * Checks if the signature was created by the corresponding private key.
 *
 * @param {string} signedData - The signed data to verify.
 * @param {string} pub - The public key to use for verification.
 * @returns {Promise<boolean>} True if signature is valid, false otherwise.
 * @throws {Error} If verification fails or parameters are invalid.
 * @example
 * const isValid = await verify(signedData, publicKey);
 */
export async function verify(signedData, pub) {
  return await SEA.verify(signedData, pub);
}
