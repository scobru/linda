/**
 * Authentication module for managing user sessions and authentication state
 */
declare module "authentication" {
    /**
     * Logs out the current user by clearing session data and authentication state
     * @returns Promise that resolves to true if logout was successful, false otherwise
     */
    function logout(): Promise<boolean>;
    /**
     * Gets the current user's keypair for cryptographic operations
     * @returns Promise that resolves to the user's keypair
     */
    function getKeyPair(): Promise<object>;
    /**
     * Authentication module containing all authentication related functions
     */
    const authentication: any;
}

/**
 * BehaviorSubject that tracks the current authentication state
 */
declare var isAuthenticated: BehaviorSubject<boolean>;

/**
 * Flag to prevent concurrent auth checks
 */
declare var authCheckInProgress: boolean;

/**
 * Checks the current authentication status
 * @returns True if authenticated, false if not, undefined if check already in progress
 */
declare function checkAuth(): boolean | undefined;

/**
 * Authenticates a registered user with their credentials.
 *
 * This function handles the login process by:
 * 1. Validating the provided credentials
 * 2. Authenticating against the Gun user system
 * 3. Creating necessary security certificates
 * 4. Verifying the user session is properly established
 * @param credentials - The user's login credentials
 * @param credentials.username - The user's username
 * @param credentials.password - The user's password
 * @param callback - Optional callback function that receives the authentication result
 * @returns Promise that resolves with:
 *   - success: {boolean} Whether authentication succeeded
 *   - pub: {string} The user's public key
 *   - message: {string} Status message
 *   - user: {Object} The authenticated user object
 */
declare function loginUser(credentials: {
    username: string;
    password: string;
}, callback: (...params: any[]) => any): Promise<object>;

/**
 * Registers a new user in the system.
 *
 * This function handles the registration process by:
 * 1. Validating the provided credentials
 * 2. Checking if username is available
 * 3. Creating the user in Gun's user system
 * 4. Updating user counts and lists
 * 5. Setting up friend request certificates
 * @param credentials - The user's registration credentials
 * @param credentials.username - The desired username
 * @param credentials.password - The user's password (minimum 8 characters)
 * @param callback - Optional callback function that receives the registration result
 * @returns Promise that resolves with:
 *   - success: {boolean} Whether registration succeeded
 *   - pub: {string} The user's public key
 *   - message: {string} Status message
 */
declare function registerUser(credentials: {
    username: string;
    password: string;
}, callback: (...params: any[]) => any): Promise<object>;

/**
 * Session management utilities for handling user sessions
 */
declare namespace sessionManager {
    /**
     * Validates the current user session
     *
     * Checks if:
     * 1. User is authenticated
     * 2. Session data exists and is not expired (1 hour timeout)
     * 3. Updates the session with current timestamp and device info
     * @returns True if session is valid, false otherwise
     */
    function validateSession(): Promise<boolean>;
    /**
     * Invalidates and terminates the current user session
     *
     * Clears session data and logs out the user
     */
    function invalidateSession(): Promise<void>;
}

/**
 * Modulo di blocco utenti che fornisce funzionalità per bloccare e sbloccare gli utenti
 */
declare module "blocking" { }

/**
 * Modulo di blocco utenti che fornisce funzionalità per bloccare e sbloccare gli utenti
 */
declare module "blocking" { }

/**
 * Service that provides functionality to unblock users
 */
declare namespace unblockService {
    /**
     * Unblocks a previously blocked user
     *
     * This method:
     * 1. Verifies that the user is authenticated
     * 2. Removes the block via userBlocking
     * 3. Recreates necessary certificates for chats and messages
     * 4. Emits a status change event
     * @param userPub - The public key of the user to unblock
     * @returns Promise that resolves with:
     *   - success: {boolean} Whether the unblock was successful
     *   - message: {string} Status message
     */
    function unblockUser(userPub: string): Promise<object>;
}

/**
 * User blocking functionality module
 */
declare namespace userBlocking {
    /**
     * Blocks a user by their public key
     *
     * This method:
     * 1. Verifies user is authenticated
     * 2. Checks if target user is already blocked
     * 3. Revokes chat and message certificates
     * 4. Adds user to blocked list
     * 5. Cleans up existing messages
     * 6. Marks chat as blocked
     * 7. Emits block event
     * @param pubKey - Public key of user to block
     * @returns True if block successful
     */
    function blockUser(pubKey: string): Promise<boolean>;
    /**
     * Unblocks a previously blocked user
     *
     * This method:
     * 1. Verifies user is authenticated
     * 2. Removes user from blocked list
     * 3. Removes block flag from chat
     * 4. Emits unblock event
     * @param pubKey - Public key of user to unblock
     * @returns True if unblock successful
     */
    function unblockUser(pubKey: string): Promise<boolean>;
    /**
     * Checks if a user is blocked by the current user
     *
     * Verifies block status by checking blocked users list
     * and certificate validation
     * @param pubKey - Public key of user to check
     * @returns True if user is blocked
     */
    function isBlocked(pubKey: string): Promise<boolean>;
    /**
     * Checks if current user is blocked by another user
     *
     * Verifies if target user has blocked the current user
     * @param pubKey - Public key of user to check against
     * @returns True if current user is blocked
     */
    function isBlockedBy(pubKey: string): Promise<boolean>;
    /**
     * Gets list of all users blocked by current user
     *
     * Returns array of blocked user objects containing:
     * - pub: Public key
     * - timestamp: When block occurred
     * - id: Unique block ID
     * @returns Array of blocked user objects
     */
    function getBlockedUsers(): Promise<any[]>;
}

/**
 * Command line interface for the Lonewolf protocol
 */
declare module "cli" {
    /**
     * Initialize Gun with robust error handling
     */
    function initGun(): void;
    /**
     * Get hidden password input from user
     * @param prompt - Prompt message to display
     * @returns Entered password
     */
    function getPasswordInput(prompt: string): Promise<string>;
}

/**
 * SEA cryptography abstraction module providing encryption, decryption, signing, verification and hashing utilities.
 * Built on top of Gun's SEA (Security, Encryption, Authorization) cryptography module.
 */
declare module "Crypto" {
    /**
     * Checks if a given string is a valid hash.
     * A valid hash is a 44 character string ending with '='.
     * @example
     * isHash('abc123=') // false
     * isHash('dGhpcyBpcyBhIHZhbGlkIGhhc2ggc3RyaW5nIHRoYXQgaXMgbG9uZyBlbm91Z2g=') // true
     * @param str - The string to check.
     * @returns - Returns true if the string is a valid hash, otherwise false.
     */
    function isHash(str: string): boolean;
    /**
     * Represents a cryptographic entity with public keys.
     * @property pub - The public key used for verification.
     * @property epub - The elliptic encryption public key used for encryption.
     */
    type Entity = {
        pub: string;
        epub: string;
    };
    /**
     * Encrypts data for one receiver entity using SEA's asymmetric encryption.
     * The process involves:
     * 1. Generating an encryption secret using receiver's epub and sender's pair
     * 2. Encrypting data with this secret
     * @example
     * const encrypted = await encFor(
     *   'secret message',
     *   senderKeyPair,
     *   { pub: 'receiverPub', epub: 'receiverEpub' }
     * );
     * @param data - Stringified data to be encrypted.
     * @param sender - SEA key pair of the sender containing epriv key.
     * @param receiver - Recipient's public keys (pub and epub).
     * @returns - Encrypted data string ready for transmission.
     */
    function encFor(data: string, sender: any, receiver: Entity): Promise<string>;
    /**
     * Decrypts a private message from an entity using SEA's asymmetric decryption.
     * The process involves:
     * 1. Generating decryption secret using sender's epub and receiver's pair
     * 2. Decrypting the data with this secret
     * @example
     * const decrypted = await decFrom(
     *   encryptedData,
     *   { pub: 'senderPub', epub: 'senderEpub' },
     *   receiverKeyPair
     * );
     * @param data - Encrypted private data to be decrypted.
     * @param sender - Sender's public keys (pub and epub).
     * @param receiver - SEA key pair of the receiver containing epriv key.
     * @returns - Decrypted data in original form.
     */
    function decFrom(data: string, sender: Entity, receiver: any): Promise<string>;
    /**
     * Encrypts data using a SEA key pair with symmetric encryption.
     * Uses the pair as the encryption key.
     * @example
     * const encrypted = await encrypt('secret data', myKeyPair);
     * @param data - The data to encrypt.
     * @param pair - The SEA key pair for encryption.
     * @returns The encrypted data string.
     */
    function encrypt(data: string, pair: any): Promise<string>;
    /**
     * Decrypts data using a SEA key pair with symmetric decryption.
     * Uses the pair as the decryption key.
     * @example
     * const decrypted = await decrypt(encryptedData, myKeyPair);
     * @param data - The encrypted data to decrypt.
     * @param pair - The SEA key pair for decryption.
     * @returns The decrypted data in original form.
     */
    function decrypt(data: string, pair: any): Promise<string>;
    /**
     * Generates a SHA-256 hash for the given text using SEA's work function.
     * @example
     * const hash = await hashText('hello world');
     * @param text - The text to hash.
     * @returns The generated SHA-256 hash.
     */
    function hashText(text: string): Promise<string>;
    /**
     * Generates a SHA-256 hash for the given object.
     * If input is an object, it is first stringified before hashing.
     * @example
     * const { hash, hashed } = await hashObj({ foo: 'bar' });
     * @param obj - The object or string to hash.
     * @returns Object containing the hash and stringified input.
     */
    function hashObj(obj: any | string): Promise<{ hash: string; hashed: string; }>;
    /**
     * Calculates a hex-encoded PBKDF2 hash for any string data with optional salt.
     * @example
     * const shortHash = await getShortHash('hello', 'salt123');
     * @param text - The text to hash.
     * @param salt - The salt to use in the PBKDF2 function.
     * @returns The hex encoded PBKDF2 hash.
     */
    function getShortHash(text: string, salt: string): Promise<string>;
    /**
     * Converts a standard base64 string to a URL-safe base64 string.
     * Replaces '+' with '-', '/' with '_', and '=' with '.'.
     * @example
     * const safe = safeHash('abc+/=');  // Returns 'abc-_.'
     * @param unsafe - The standard base64 string.
     * @returns The URL-safe base64 string, or undefined if input is falsy.
     */
    function safeHash(unsafe: string): string | undefined;
    /**
     * Converts a URL-safe base64 string back to a standard base64 string.
     * Replaces '-' with '+', '_' with '/', and '.' with '='.
     * @example
     * const unsafe = unsafeHash('abc-_.');  // Returns 'abc+/='
     * @param safe - The URL-safe base64 string.
     * @returns The standard base64 string, or undefined if input is falsy.
     */
    function unsafeHash(safe: string): string | undefined;
    /**
     * Safely parses a JSON string, returning a default object if parsing fails.
     * Handles null inputs and objects that are already parsed.
     * @example
     * const obj = safeJSONParse('{"foo": "bar"}');
     * const fallback = safeJSONParse(null, { default: true });
     * @param input - The JSON string or object to parse.
     * @param [def = {}] - The default object to return if parsing fails.
     * @returns The parsed object or the default object.
     */
    function safeJSONParse(input: string | any, def?: any): any;
    /**
     * Signs data using a SEA key pair's private key.
     * Creates a cryptographic signature that can be verified with the corresponding public key.
     * @example
     * const signature = await sign('verify this', myKeyPair);
     * @param data - The data to sign.
     * @param pair - The SEA key pair containing the private key for signing.
     * @returns The signed data.
     */
    function sign(data: string, pair: any): Promise<string>;
    /**
     * Verifies a signed data using a public key.
     * Checks if the signature was created by the corresponding private key.
     * @example
     * const isValid = await verify(signedData, publicKey);
     * @param signedData - The signed data to verify.
     * @param pub - The public key to use for verification.
     * @returns True if signature is valid, false otherwise.
     */
    function verify(signedData: string, pub: string): Promise<boolean>;
}

/**
 * Accepts a friend request and establishes friendship between users
 *
 * This function:
 * 1. Creates necessary certificates for messaging and chat
 * 2. Cleans up any existing chat/friendship data
 * 3. Creates a new chat room
 * 4. Establishes friendship record
 * 5. Updates friend lists for both users
 * 6. Removes pending friend requests
 * @param request - The friend request to accept
 * @param request.pub - Public key of requesting user
 * @param request.alias - Display name of requesting user
 * @param request.senderInfo - Additional sender information
 * @param callback - Optional callback function
 */
declare function acceptFriendRequest(request: {
    pub: string;
    alias: string;
    senderInfo: any;
}, callback: (...params: any[]) => any): Promise<void>;

/**
 * Sends a friend request to another user
 *
 * This function:
 * 1. Validates the current user is authenticated
 * 2. Resolves target user by public key or alias
 * 3. Verifies target user exists and is not self
 * 4. Checks for existing pending requests or friendships
 * 5. Generates necessary certificates
 * 6. Creates and stores the friend request
 * @param publicKeyOrAlias - Public key or alias of target user
 * @param callback - Optional callback function
 * @returns Resolves when request is sent
 */
declare function addFriendRequest(publicKeyOrAlias: string, callback: (...params: any[]) => any): Promise<void>;

/**
 * Acquires a lock for concurrent operations
 * @param lockKey - Unique key for the lock
 */
declare function acquireLock(lockKey: string): void;

/**
 * Releases a previously acquired lock
 * @param lockKey - Key of the lock to release
 */
declare function releaseLock(lockKey: string): void;

/**
 * Service for managing friend relationships and requests
 */
declare const friendsService: any;

/**
 * Modulo per la gestione delle amicizie e delle richieste di amicizia
 */
declare module "protocol/friends" { }

/**
 * Modulo per la gestione delle amicizie e delle richieste di amicizia
 */
declare module "protocol/friends" { }

/**
 * Modulo per la gestione delle amicizie e delle richieste di amicizia
 */
declare module "protocol/friends" { }

/**
 * Rejects a friend request from another user
 *
 * This function:
 * 1. Validates the current user is authenticated
 * 2. Revokes any existing certificates with the requesting user
 * 3. Removes all related friend requests
 * 4. Cleans up temporary request data
 * @param request - The friend request to reject
 * @param request.from - Public key of requesting user
 * @param [request.id] - Optional request ID
 * @param callback - Optional callback function
 * @returns Resolves when request is rejected
 */
declare function rejectFriendRequest(request: {
    from: string;
    id?: string;
}, callback: (...params: any[]) => any): Promise<void>;

/**
 * Removes a friend and cleans up all associated data
 *
 * This function:
 * 1. Revokes all certificates with the friend
 * 2. Removes friendship records from both users
 * 3. Removes friend from both users' friend lists
 * 4. Deletes chat history and messages
 * 5. Cleans up pending friend requests
 * 6. Removes local storage data
 * 7. Forces garbage collection
 * @param friendPub - Public key of friend to remove
 * @returns Result object with success status and message
 */
declare function removeFriend(friendPub: string): Promise<object>;

declare module "Linda/Messenger" {
    type CacheManager = any;
    const cacheManager: any;
}

/**
 * Creates a new chat room between two users
 *
 * This function:
 * 1. Validates user authentication
 * 2. Generates required security certificates
 * 3. Checks for existing chat room
 * 4. Creates new chat room if none exists
 * 5. Sets up chat references for both users
 * @param recipientPub - Public key of chat recipient
 * @param callback - Optional callback function
 * @returns Resolves with chat details via callback
 */
declare function createChat(recipientPub: string, callback: (...params: any[]) => any): Promise<void>;

/**
 * Gestione della messaggistica
 */
declare module "Linda/Messenger/Messaging" { }

/**
 * Utilities for message integrity and verification
 */
declare namespace messageIntegrity {
    /**
     * Signs a message using the provided key pair
     * @param message - The message object to sign
     * @param message.content - Message content
     * @param message.timestamp - Message timestamp
     * @param message.sender - Sender's public key
     * @param pair - Key pair for signing
     * @returns Message with added signature
     */
    function sign(message: {
        content: string;
        timestamp: number;
        sender: string;
    }, pair: any): any;
    /**
     * Verifies a message signature
     * @param message - The message object to verify
     * @param message.content - Message content
     * @param message.timestamp - Message timestamp
     * @param message.sender - Sender's public key
     * @param message.signature - Message signature
     * @param senderPub - Public key of the sender
     * @returns True if signature is valid, false otherwise
     */
    function verify(message: {
        content: string;
        timestamp: number;
        sender: string;
        signature: string;
    }, senderPub: string): boolean;
}

/**
 * Module for handling message lists and real-time message updates
 */
declare module "messageList" {
    /**
     * Creates an Observable that monitors and processes messages for a given room
     * @param roomId - The ID of the chat room to monitor
     * @returns An Observable that emits message updates
     */
    function messageList(roomId: string): Observable;
}

/**
 * Rate limiter utility to control frequency of actions
 */
declare namespace rateLimiter {
    /**
     * Map to store rate limit data
     */
    var limits: any;
    /**
     * Checks if an action is allowed based on rate limits
     * @param userId - The ID of the user performing the action
     * @param action - The type of action being performed
     * @param [limit = 10] - Maximum number of actions allowed in time window
     * @param [timeWindow = 60000] - Time window in milliseconds
     * @returns True if action is allowed
     */
    function check(userId: string, action: string, limit?: number, timeWindow?: number): Promise<boolean>;
}

/**
 * Module for sending encrypted messages between users
 */
declare module "sendMessage" {
    /**
     * Sends an encrypted message to a recipient in a chat
     * @param chatId - The ID of the chat where the message will be sent
     * @param recipientPub - The public key of the message recipient
     * @param content - The message content to be encrypted and sent
     * @param [callback] - Optional callback function to handle the result
     * @returns Object containing success status and message details
     */
    function sendMessage(chatId: string, recipientPub: string, content: string, callback?: (...params: any[]) => any): Promise<object>;
}

/**
 * Module for sending voice messages between users
 */
declare module "sendVoiceMessage" {
    /**
     * Sends a voice message to a recipient in a chat room
     * @param roomId - The ID of the chat room where the message will be sent
     * @param publicKey - The public key of the message recipient
     * @param voiceRecording - The voice message data to be sent
     * @param [callback] - Optional callback function to handle the result
     */
    function sendVoiceMessage(roomId: string, publicKey: string, voiceRecording: any, callback?: (...params: any[]) => any): void;
}

/**
 * This function creates a new note with the provided details. For private notes,
 * the content is encrypted before storage. Public notes are stored unencrypted.
 * The note's unique identifier is generated by hashing the title and content.
 * @example
 * // Create a public note
 * const publicHash = await createNote(
 *   "My Public Note",
 *   "John Doe",
 *   "Hello World!",
 *   true
 * );
 *
 * // Create a private note
 * const privateHash = await createNote(
 *   "My Private Note",
 *   "John Doe",
 *   "Secret content",
 *   false
 * );
 * @param title - The title of the note
 * @param author - The author name/identifier for the note
 * @param content - The main content/body of the note
 * @param isPublic - Flag indicating if note should be public (true) or private (false)
 * @returns A promise that resolves to the unique hash identifier of the created note
 */
declare function createNote(title: string, author: string, content: string, isPublic: boolean): Promise<string>;

/**
 * This function deletes either a public or private note based on the provided hash and isPublic flag.
 * For private notes, the user must be authenticated. The deletion is performed by setting the note
 * reference to null in the appropriate storage location.
 * @example
 * // Delete a public note
 * await deleteNote("abc123", true);
 *
 * // Delete a private note
 * await deleteNote("xyz789", false);
 * @param hash - The unique hash identifier of the note to delete
 * @param isPublic - Flag indicating if the note is public (true) or private (false)
 * @returns A promise that resolves when the note is deleted
 */
declare function deleteNote(hash: string, isPublic: boolean): Promise<void>;

/**
 * Retrieves a note by its hash.
 * @param hash - Note identifier
 * @returns Note object
 */
declare function getNote(hash: string): Promise<Note>;

/**
 * Carica le note da una collezione specifica
 * @param collection - Collezione Gun
 * @param isPublic - Flag per note pubbliche/private
 * @returns Array di note
 */
declare function loadNotes(collection: any, isPublic: boolean): Promise<any[]>;

/**
 * Recupera tutte le note dell'utente
 * @returns Array di note filtrate
 */
declare function getUserNotes(): Promise<any[]>;

/**
 * Recupera tutte le note dell'utente
 * @returns Array di note filtrate
 */
declare function getUserNotes(): Promise<any[]>;

/**
 * Module for managing encrypted and public notes
 */
declare module "Linda/Messenger/Notes" {
    /**
     * @property id - Unique identifier for the note
     * @property title - Note title
     * @property content - Note content
     * @property author - Note author
     * @property isPublic - Whether note is public
     * @property lastUpdated - Last modification timestamp
     */
    type Note = {
        id: string;
        title: string;
        content: string;
        author: string;
        isPublic: boolean;
        lastUpdated: string;
    };
    /**
     * Creates a new note with optional encryption
     * @param title - Note title
     * @param author - Note author
     * @param content - Note content
     * @param isPublic - Whether note should be public
     * @returns Note identifier hash
     */
    function createNote(title: string, author: string, content: string, isPublic: boolean): Promise<string>;
    /**
     * Deletes an existing note
     * @param hash - Note identifier
     * @param isPublic - Whether note is public
     */
    function deleteNote(hash: string, isPublic: boolean): Promise<void>;
    /**
     * Retrieves a note by hash
     * @param hash - Note identifier
     * @returns Note object
     */
    function getNote(hash: string): Promise<Note>;
    /**
     * Updates an existing note
     * @param hash - Note identifier
     * @param title - New title
     * @param author - New author
     * @param content - New content
     * @param isPublic - Note visibility
     */
    function updateNote(hash: string, title: string, author: string, content: string, isPublic: boolean): Promise<void>;
    /**
     * Gets all notes for current user
     * @returns Array of notes
     */
    function getUserNotes(): Promise<Note[]>;
}

/**
 * Updates an existing note.
 * @param hash - Note identifier
 * @param title - New title
 * @param content - New content
 * @param isPublic - Note visibility
 */
declare function updateNote(hash: string, title: string, content: string, isPublic: boolean): Promise<void>;

/**
 * Module for managing message notifications and tracking
 */
declare module "Linda/Messenger/Notifications" { }

/**
 * Message notification and tracking functionality
 */
declare namespace messageNotifications {
    /**
     * Initializes tracking for a new message
     * @param messageId - Unique identifier of the message
     * @param chatId - ID of the chat the message belongs to
     */
    function initMessageTracking(messageId: string, chatId: string): Promise<void>;
    /**
     * Observes status changes for a message
     * @param messageId - ID of message to observe
     * @returns Observable that emits message status updates
     */
    function observeMessageStatus(messageId: string): Observable;
    /**
     * Updates the status of a message
     * @param messageId - ID of the message to update
     * @param status - New status to set
     */
    function updateMessageStatus(messageId: string, status: string): Promise<void>;
    /**
     * Observes new incoming messages for notifications
     * @returns Observable that emits new message notifications
     */
    function observeNewMessages(): Observable;
}

/**
 * Read receipts functionality for messages
 */
declare namespace readReceipts {
    /**
     * Marks a message as visible/read for a recipient
     * @param messageId - ID of the message
     * @param chatId - ID of the chat
     * @param recipientPub - Public key of message recipient
     * @returns Success status of marking message as read
     */
    function observeMessageVisibility(messageId: string, chatId: string, recipientPub: string): Promise<boolean>;
    /**
     * Observes read receipts for a message
     * @param messageId - ID of message to observe
     * @param chatId - ID of chat containing the message
     * @returns Observable that emits read receipt events
     */
    function observeReadReceipts(messageId: string, chatId: string): Observable;
}

/**
 * Creates a new post in the decentralized network
 * @param content - The content of the post
 * @param [metadata = {}] - Optional metadata for the post
 * @returns The ID of the created post
 */
declare function createPost(content: string, metadata?: any): Promise<string>;

/**
 * This function handles decryption of encrypted post content by:
1. Verifying that a user is authenticated
2. Using the provided token to decrypt the post content
3. Returning the decrypted text or throwing an error if decryption fails

The function requires user authentication to ensure only authorized users can decrypt posts.
It uses the decrypt utility from the crypto module to perform the actual decryption.
 * @example
 * try {
  const encryptedPost = {
    content: "encrypted-content-here",
    // ... other post metadata
  };

  const decryptedText = await decryptPost(
    encryptedPost,
    "decryption-token-123"
  );
  console.log("Decrypted post:", decryptedText);
} catch (error) {
  console.error("Failed to decrypt:", error.message);
}
 * @param post - The encrypted post content to decrypt
 * @param token - The decryption token used to decrypt the post content
 * @returns A promise that resolves to the decrypted post text
 */
declare function decryptPost(post: any, token: string): Promise<string>;

/**
 * This function handles post deletion by:
 * 1. Verifying user authentication
 * 2. Checking if post exists
 * 3. Verifying user is post author
 * 4. Setting post value to null in Gun database
 * @example
 * try {
 *   await deletePost("post_123456789");
 *   console.log("Post deleted successfully");
 * } catch (error) {
 *   console.error("Failed to delete post:", error.message);
 * }
 * @param postId - The unique key identifier of the post to delete
 * @returns A promise that resolves when the post is deleted
 */
declare function deletePost(postId: string): Promise<void>;

/**
 * This function encrypts a post's content using the following steps:
1. Takes the post content as input
2. Encrypts it using the provided token
3. Returns the encrypted text
 * @example
 * // Encrypt a post
const encryptedText = await encryptPost(
  "My secret message",
  "encryption-token-123"
);
console.log(`Encrypted text: ${encryptedText}`);
 * @param post - The post content to encrypt
 * @param token - The encryption token used to encrypt the post content
 * @returns A promise that resolves to the encrypted post text
 */
declare function encryptPost(post: string, token: string): Promise<string>;

/**
 * This function fetches a post from the Gun database by:
 * 1. Looking up the post by its ID in the posts collection
 * 2. Returning the post data if found
 * 3. Throwing an error if the post doesn't exist
 * @example
 * try {
 *   const post = await getPost("post_123456789");
 *   console.log("Retrieved post:", post);
 * } catch (error) {
 *   console.error("Failed to get post:", error.message);
 * }
 * @param postId - The unique identifier of the post to retrieve
 * @returns A promise that resolves to the post object
 */
declare function getPost(postId: string): Promise<object>;

/**
 * This function fetches all posts for a user by:
 * 1. Using provided public key or current user's public key
 * 2. Querying the posts collection for matching author
 * 3. Filtering out system entries and invalid posts
 * 4. Sorting posts by creation date (newest first)
 * @example
 * try {
 *   // Get posts for specific user
 *   const userPosts = await getUserPosts("user-public-key-123");
 *   console.log("User posts:", userPosts);
 *
 *   // Get current user's posts
 *   const myPosts = await getUserPosts();
 *   console.log("My posts:", myPosts);
 * } catch (error) {
 *   console.error("Failed to get posts:", error.message);
 * }
 * @param [userPub = null] - The public key of the user whose posts to retrieve. If null, gets current user's posts
 * @returns A promise that resolves to an array of post objects, sorted by creation date
 */
declare function getUserPosts(userPub?: string): Promise<any[]>;

/**
 * Module for managing encrypted social posts in a decentralized network.
 * Provides functionality for creating, reading, updating and deleting posts,
 * as well as retrieving posts by user.
 */
declare module "Posts" { }

/**
 * This function updates a post by:
 * 1. Verifying user authentication
 * 2. Checking if post exists
 * 3. Verifying user is post author
 * 4. Merging updates with existing post data
 * 5. Saving updated post to Gun database
 * @example
 * try {
 *   await updatePost("post_123", { content: "Updated content" });
 *   console.log("Post updated successfully");
 * } catch (error) {
 *   console.error("Failed to update post:", error.message);
 * }
 * @param postId - The unique identifier of the post to update
 * @param updates - Object containing the fields to update
 * @returns A promise that resolves when the post is updated
 */
declare function updatePost(postId: string, updates: any): Promise<void>;

/**
 * Certificate manager for handling digital certificates in the decentralized network
 */
declare namespace certificateManager {
    /**
     * @property debug - Enable/disable debug logging
     */
    var debug: {
        debug: boolean;
    };
    /**
     * Creates and signs a new certificate
     * @param data - Certificate data to sign
     * @returns Signed certificate string
     */
    function createCertificate(data: any): Promise<string>;
    /**
     * Verifies a certificate's signature and expiration
     * @param certificate - The certificate to verify
     * @param pubKey - Public key to verify against
     * @returns Verified certificate data or false if invalid
     */
    function verifyCertificate(certificate: string, pubKey: string): Promise<object | boolean>;
    /**
     * Revokes a certificate by adding it to revoked certificates list
     * @param certificateId - ID of certificate to revoke
     */
    function revokeCertificate(certificateId: string): void;
    /**
     * Checks if a certificate has been revoked
     * @param certificateId - ID of certificate to check
     * @returns True if certificate is revoked
     */
    function isRevoked(certificateId: string): Promise<boolean>;
}

/**
 * Creates a chat certificate for communicating with a target user
 */
declare const createChatsCertificate: any;

/**
 * Creates a messages certificate for exchanging messages with a target user
 */
declare const createMessagesCertificate: any;

/**
 * Revokes an existing chats certificate for a target user
 */
declare const revokeChatsCertificate: any;

/**
 * Revokes an existing messages certificate for a target user
 */
declare const revokeMessagesCertificate: any;

/**
 * Creates a friend request certificate that allows a user to send friend requests
 * @returns The created certificate
 */
declare function createFriendRequestCertificate(): Promise<string>;

/**
 * Generates a certificate for adding a specific user as a friend
 * @param targetPub - Public key of the user to add as friend
 * @returns The created certificate
 */
declare function generateAddFriendCertificate(targetPub: string): Promise<string>;

/**
 * This method creates a certificate that grants the member the following permissions:
1. Read group messages
2. Send messages (if not a channel)
3. Access group information
 * @param groupId - The unique identifier of the group
 * @param memberPub - The public key of the member
 * @returns The created certificate
 */
declare function createGroupCertificate(groupId: string, memberPub: string): Promise<string>;

/**
 * Module for managing security and certificates in the decentralized network.
 * Provides functionality for creating and managing certificates for chats, messages,
 * friend requests and other security-related operations.
 */
declare module "Security" { }

/**
 * Creates a chat certificate for communicating with a target user
 */
declare const createChatsCertificate: any;

/**
 * Creates a messages certificate for exchanging messages with a target user
 */
declare const createMessagesCertificate: any;

/**
 * Revokes an existing chats certificate for a target user
 */
declare const revokeChatsCertificate: any;

/**
 * Revokes an existing messages certificate for a target user
 */
declare const revokeMessagesCertificate: any;

/**
 * System management and monitoring module
 */
declare module "Linda/Messenger/System" { }

/**
 * System service for monitoring and managing system status, configuration and maintenance
 */
declare const systemService: any;

/**
 * Creates a new todo item.
 * @param title - Todo title
 * @param description - Todo description
 * @param dueDate - Due date for the todo
 * @param priority - Priority level (high, medium, low)
 * @returns Todo identifier
 */
declare function createTodo(title: string, description: string, dueDate: Date, priority: string): Promise<string>;

/**
 * Decrypts a todo item using the provided token
 * @param todo - The encrypted todo object to decrypt
 * @param token - The decryption token/key
 * @returns The decrypted todo object
 */
declare function decryptTodo(todo: any, token: string): Promise<object>;

/**
 * Deletes a todo item by its ID
 * @param todoId - The ID of the todo to delete
 */
declare function deleteTodo(todoId: string): Promise<void>;

/**
 * Encrypts a todo item using the provided token
 * @param todo - The todo object to encrypt
 * @param token - The encryption token/key
 * @returns The encrypted todo text
 */
declare function encryptTodo(todo: any, token: string): Promise<string>;

/**
 * Recupera un todo tramite il suo ID
 * @param todoId - L'ID del todo da recuperare
 * @returns Il todo richiesto
 */
declare function getTodo(todoId: string): Promise<object>;

/**
 * Each todo object contains:
 * - id: Unique identifier
 * - title: Todo title
 * - description: Todo description
 * - dueDate: Due date (ISO string)
 * - priority: Priority level (high/medium/low)
 * - status: Current status
 * - created: Creation timestamp
 * - lastUpdated: Last update timestamp
 * - author: Public key of creator
 * @returns Array of todo objects sorted by creation date (newest first)
 */
declare function getUserTodos(): Promise<any[]>;

/**
 * Module for managing encrypted todo items with support for CRUD operations
 */
declare module "Todos" { }

/**
 * Updates an existing todo item
 * @param todoId - The ID of the todo to update
 * @param updates - Object containing the fields to update
 */
declare function updateTodo(todoId: string, updates: any): Promise<void>;

