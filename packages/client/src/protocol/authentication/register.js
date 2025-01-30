import { gun, user, DAPP_NAME, checkConnection, walletManager } from "../useGun";
import {
  createFriendRequestCertificate,
  createNotificationCertificate,
} from "../security/index";
import { updateGlobalMetrics } from "../system/systemService";
import { avatarService } from "../utils/avatarService";
import { WalletManager, StealthChain } from "@scobru/shogun";
import SEA from "gun/sea";

const LOGIN_TIMEOUT = 5000; // Ridotto da 10 a 5 secondi

// Inizializza StealthChain
const stealthChain = new StealthChain(gun);

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

    // Genera le chiavi stealth
    const stealthKeys = await new Promise((resolve, reject) => {
      stealthChain.generateStealthKeys((error, keys) => {
        if (error) {
          console.error("Errore generazione chiavi stealth:", error);
          reject(error);
          return;
        }
        console.log("Chiavi stealth generate:", keys);
        resolve(keys);
      });
    });

    if (!stealthKeys?.pub) {
      throw new Error("Errore nella generazione delle chiavi stealth");
    }

    // Prepara i dati utente
    const userDataToSave = {
      pub: user._.sea.pub,
      epub: user._.sea.epub,
      address: mainWallet.address,
      internalWalletAddress: mainWallet.address,
      externalWalletAddress: normalizedAddress,
      viewingPublicKey: stealthKeys.pub,
      spendingPublicKey: stealthKeys.epub,
      createdAt: Date.now(),
      authType: "metamask",
      lastSeen: Date.now(),
    };

    // Salva le chiavi private in modo sicuro
    const encryptedStealthKeys = await SEA.encrypt({
      viewingPrivateKey: stealthKeys.priv,
      spendingPrivateKey: stealthKeys.epriv
    }, user._.sea);

    // Salva le chiavi private cifrate
    await gun.get(DAPP_NAME)
      .get("users")
      .get(user._.sea.pub)
      .get("stealth-keys")
      .put(encryptedStealthKeys);

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

    // Se sono state fornite chiavi di cifratura (WebAuthn), usale
    const userKeys = credentials.encryptionKeys || user._.sea;

    // Crea il wallet principale
    const walletResult = await WalletManager.createWalletObj(userKeys);
    const mainWallet = walletResult.walletObj;

    // Salva il wallet nel localStorage per l'utente WebAuthn
    if (credentials.encryptionKeys) {
      localStorage.setItem(
        `gunWallet_${userKeys.pub}`,
        JSON.stringify({
          internalWalletAddress: mainWallet.address,
          internalWalletPk: mainWallet.privateKey
        })
      );
    }

    // Genera le chiavi stealth
    const stealthKeys = await new Promise((resolve, reject) => {
      stealthChain.generateStealthKeys((error, keys) => {
        if (error) {
          console.error("Errore generazione chiavi stealth:", error);
          reject(error);
          return;
        }
        console.log("Chiavi stealth generate:", keys);
        resolve(keys);
      });
    });

    if (!stealthKeys?.pub) {
      throw new Error("Errore nella generazione delle chiavi stealth");
    }

    // Prepara i dati utente
    const userDataToSave = {
      pub: userKeys.pub,
      epub: userKeys.epub,
      address: mainWallet.address,
      internalWalletAddress: mainWallet.address,
      externalWalletAddress: credentials.username,
      viewingPublicKey: stealthKeys.pub,
      spendingPublicKey: stealthKeys.epub,
      createdAt: Date.now(),
      authType: credentials.encryptionKeys ? "webauthn" : "credentials",
      lastSeen: Date.now(),
    };

    // Salva le chiavi private in modo sicuro
    const encryptedStealthKeys = await SEA.encrypt({
      viewingPrivateKey: stealthKeys.priv,
      spendingPrivateKey: stealthKeys.epriv
    }, userKeys);

    // Salva le chiavi private cifrate
    await gun.get(DAPP_NAME)
      .get("users")
      .get(userKeys.pub)
      .get("stealth-keys")
      .put(encryptedStealthKeys);

    // Salva i dati
    await gun
      .get(DAPP_NAME)
      .get("users")
      .get(userKeys.pub)
      .put(userDataToSave);

    // Salva il wallet localmente
    await walletManager.saveWallet(mainWallet, userKeys.pub);

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

    await avatarService.saveAvatar(userKeys.pub, avatarBase64);

    callback({
      success: true,
      pub: userKeys.pub,
      userData: {
        ...userDataToSave,
        avatar: avatarBase64,
      },
    });

    return {
      success: true,
      pub: userKeys.pub,
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
