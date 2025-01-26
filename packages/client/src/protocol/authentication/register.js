import { gun, user, DAPP_NAME, checkConnection, walletManager } from "../useGun";
import {
  createFriendRequestCertificate,
  createNotificationCertificate,
} from "../security/index";
import { updateGlobalMetrics } from "../system/systemService";
import { avatarService } from "../utils/avatarService";
import { WalletManager } from "@scobru/shogun";

const LOGIN_TIMEOUT = 5000; // Ridotto da 10 a 5 secondi

// Funzione di utilità per attendere la riconnessione
const waitForConnection = async (maxAttempts = 5) => {
  for (let i = 0; i < maxAttempts; i++) {
    console.log(`Tentativo connessione ${i + 1}/${maxAttempts}...`);
    const isConnected = await checkConnection();
    if (isConnected) {
      console.log("Connessione ripristinata");
      return true;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Impossibile stabilire la connessione");
};

export const registerWithMetaMask = async (address) => {
  try {
    if (!address || typeof address !== "string") {
      throw new Error("Indirizzo non valido");
    }

    const normalizedAddress = address.toLowerCase();
    console.log("Avvio registrazione con indirizzo:", normalizedAddress);

    // Verifica se l'utente esiste già
    const existingUser = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get("addresses")
        .get(normalizedAddress)
        .once((data) => {
          resolve(data);
        });
    });

    if (existingUser && existingUser.pub) {
      throw new Error("Utente già registrato con questo indirizzo");
    }

    // Usa il WalletManager per creare l'account Ethereum
    const ethereumManager = walletManager.getEthereumManager();
    const pubKey = await ethereumManager.createAccountWithEthereum();

    if (!pubKey) {
      throw new Error("Errore durante la creazione dell'account");
    }

    // Crea il wallet principale
    const walletResult = await WalletManager.createWalletObj(user._.sea);
    const mainWallet = walletResult.walletObj;

    // Prepara i dati utente
    const userDataToSave = {
      pub: user._.sea.pub,
      epub: user._.sea.epub,
      address: mainWallet.address,
      internalWalletAddress: mainWallet.address,
      externalWalletAddress: normalizedAddress,
      createdAt: Date.now(),
      authType: "metamask",
      lastSeen: Date.now(),
    };

    // Salva i dati con transazione atomica
    const saveData = async () => {
      const promises = [
        new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get("addresses")
            .get(normalizedAddress)
            .put(userDataToSave, (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve(ack);
            });
        }),
        new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get("users")
            .get(user._.sea.pub)
            .put(userDataToSave, (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve(ack);
            });
        }),
      ];

      await Promise.all(promises);
    };

    await saveData();

    // Salva il wallet localmente
    await walletManager.saveWallet(mainWallet, user._.sea.pub);

    // Aggiorna metriche e crea certificati
    await Promise.all([
      updateGlobalMetrics("totalUsers", 1),
      createFriendRequestCertificate(),
      createNotificationCertificate(),
    ]);

    // Genera e salva l'avatar predefinito
    const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${normalizedAddress}&backgroundColor=b6e3f4`;
    const avatarResponse = await fetch(defaultAvatar);
    const avatarBlob = await avatarResponse.blob();
    const avatarBase64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(avatarBlob);
    });

    await avatarService.saveAvatar(user._.sea.pub, avatarBase64);

    return {
      success: true,
      pub: user._.sea.pub,
      userData: {
        ...userDataToSave,
        avatar: avatarBase64,
      },
    };
  } catch (error) {
    console.error("Errore in registerWithMetaMask:", error);

    // Pulizia in caso di errore
    if (user.is) {
      user.leave();
    }

    throw error;
  }
};

export const registerUser = async (credentials = {}, callback = () => {}) => {
  try {
    if (!credentials.username || !credentials.password) {
      throw new Error("Username e password sono richiesti");
    }

    // Usa il WalletManager per creare l'account
    await walletManager.createAccount(credentials.username, credentials.password);

    // Crea il wallet principale
    const walletResult = await WalletManager.createWalletObj(user._.sea);
    const mainWallet = walletResult.walletObj;

    // Prepara i dati utente
    const userDataToSave = {
      pub: user._.sea.pub,
      epub: user._.sea.epub,
      address: mainWallet.address,
      internalWalletAddress: mainWallet.address,
      username: credentials.username,
      createdAt: Date.now(),
      authType: "credentials",
      lastSeen: Date.now(),
    };

    // Salva i dati
    await gun
      .get(DAPP_NAME)
      .get("users")
      .get(user._.sea.pub)
      .put(userDataToSave);

    // Salva il wallet localmente
    await walletManager.saveWallet(mainWallet, user._.sea.pub);

    // Aggiorna metriche e crea certificati
    await Promise.all([
      updateGlobalMetrics("totalUsers", 1),
      createFriendRequestCertificate(),
      createNotificationCertificate(),
    ]);

    // Genera e salva l'avatar predefinito
    const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${credentials.username}&backgroundColor=b6e3f4`;
    const avatarResponse = await fetch(defaultAvatar);
    const avatarBlob = await avatarResponse.blob();
    const avatarBase64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(avatarBlob);
    });

    await avatarService.saveAvatar(user._.sea.pub, avatarBase64);

    callback({
      success: true,
      pub: user._.sea.pub,
      userData: {
        ...userDataToSave,
        avatar: avatarBase64,
      },
    });

    return {
      success: true,
      pub: user._.sea.pub,
      userData: {
        ...userDataToSave,
        avatar: avatarBase64,
      },
    };
  } catch (error) {
    console.error("Errore in registerUser:", error);

    // Pulizia in caso di errore
    if (user.is) {
      user.leave();
    }

    callback({
      success: false,
      errMessage: error.message,
    });

    throw error;
  }
};

export default registerUser;
