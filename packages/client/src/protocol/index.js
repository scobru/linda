/**
 * @module Linda/Messenger
 * @descrizione Modulo principale per funzionalità di messaggistica e social
 */

// Core exports
export {
  gun,
  user,
  DAPP_NAME,
  SEA,
  addPeer,
  checkConnection,
  clearLocalCache,
  getLocalCacheSize,
  getPeers,
  reconnect,
  removePeer,
  setDappName,
} from "./useGun";

// Feature modules
export { walletService } from "./wallet";
export { userUtils } from "./utils/userUtils";
export { userBlocking } from "./blocking";
export { avatarService } from "./utils/avatarService";

// Security and Authentication
export { sessionManager } from "./security";
export { friendsService } from "./friends";
export { webAuthnService } from "./authentication/webauthn";

// Messaging modules
export { default as messaging } from "./messaging";
export { channelsV2 } from "./messaging/channels.v2";
export { boardService } from "./messaging/boardService";
export { channelService } from "./messaging/channelService";

// Other modules
export * as blocking from "./blocking";
export * as friends from "./friends";
export * as system from "./system";
export * as security from "./security";
export * as crypto from "./crypto";
export * as notes from "./notes";
export * as notifications from "./notifications";
export * as posts from "./posts";
export * as todos from "./todos";
export * as boardsV2 from "./messaging/boards.v2";

// Authentication
export { loginUser, loginWithMetaMask } from "./authentication/login";
export {
  checkAuth,
  isAuthenticated,
  observeAuthState,
} from "./authentication/isAuthenticated";
export { authentication } from "./authentication";
export { default as registerUser } from "./authentication/register";
