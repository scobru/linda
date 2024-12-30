/**
 * @module permissionService
 * @description Servizio centralizzato per la gestione dei permessi
 */

import { gun, user, DAPP_NAME } from "../useGun.js";
import { userBlocking } from "../blocking/index.js";

export const permissionService = {
  /**
   * Verifica i permessi per una chat
   * @param {Object} selected - Chat selezionata
   * @returns {Promise<Object>} Stato dei permessi
   */
  checkChatPermissions: async (selected) => {
    if (!selected || !user?.is) {
      return {
        canWrite: false,
        isBlocked: false,
        blockStatus: {
          blockedByMe: false,
          blockedByOther: false,
        },
      };
    }

    try {
      // Per le bacheche, tutti possono scrivere
      if (selected.type === "board") {
        return {
          canWrite: true,
          isBlocked: false,
          blockStatus: {
            blockedByMe: false,
            blockedByOther: false,
          },
        };
      }

      // Per i canali, solo il creatore può scrivere
      if (selected.type === "channel") {
        return {
          canWrite: selected.creator === user.is.pub,
          isBlocked: false,
          blockStatus: {
            blockedByMe: false,
            blockedByOther: false,
          },
        };
      }

      // Per le chat private
      if (selected.type === "friend" || selected.type === "chat") {
        const blockStatus = await userBlocking.getBlockStatus(selected.pub);

        return {
          canWrite: !blockStatus.blocked && !blockStatus.blockedBy,
          isBlocked: blockStatus.blocked || blockStatus.blockedBy,
          blockStatus: {
            blockedByMe: blockStatus.blocked,
            blockedByOther: blockStatus.blockedBy,
          },
        };
      }

      return {
        canWrite: false,
        isBlocked: false,
        blockStatus: {
          blockedByMe: false,
          blockedByOther: false,
        },
      };
    } catch (error) {
      console.error("Errore verifica permessi:", error);
      throw error;
    }
  },
};

export default permissionService;
