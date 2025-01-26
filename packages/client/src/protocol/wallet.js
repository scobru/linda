import { gun, user, DAPP_NAME } from "./useGun.js";
import { ethers, JsonRpcProvider } from "ethers";
import { StealthChain } from "@scobru/shogun";

// Inizializza StealthChain
const stealthChain = new StealthChain(gun);

// Chain configurations
const SUPPORTED_CHAINS = {
  OPTIMISM_SEPOLIA: {
    name: "Optimism Sepolia",
    chainId: 11155420,
    rpcUrl:
      "https://spring-serene-snow.optimism-sepolia.quiknode.pro/d02b30b94d9d8e89cee0b2a694d5e1a5c6d87d9f",
    blockExplorer: "https://sepolia-optimism.etherscan.io/",
    nativeCurrency: {
      name: "ETH",
      symbol: "ETH",
      decimals: 18,
    },
  },
  POLYGON_MAINNET: {
    name: "Polygon",
    chainId: 137,
    rpcUrl:
      "https://polygon-mainnet.g.alchemy.com/v2/yjhjIoJ3o_at8ALT7nCJtFtjdqFpiBdx",
    blockExplorer: "https://polygonscan.com/",
    nativeCurrency: {
      name: "MATIC",
      symbol: "MATIC",
      decimals: 18,
    },
  },
};

// Funzione per ottenere o creare lo stato per un utente
const getUserChainState = () => {
  const userPub = user?.is?.pub;
  if (!userPub) return null;

  const savedState = localStorage.getItem(`chainState_${userPub}`);
  if (savedState) {
    const state = JSON.parse(savedState);
    return {
      currentChain: SUPPORTED_CHAINS[state.chainKey],
      provider: new JsonRpcProvider(SUPPORTED_CHAINS[state.chainKey].rpcUrl),
    };
  }

  const initialState = {
    currentChain: SUPPORTED_CHAINS.OPTIMISM_SEPOLIA,
    provider: new JsonRpcProvider(SUPPORTED_CHAINS.OPTIMISM_SEPOLIA.rpcUrl),
  };

  localStorage.setItem(
    `chainState_${userPub}`,
    JSON.stringify({
      chainKey: "OPTIMISM_SEPOLIA",
    })
  );

  return initialState;
};

const normalizeWalletData = (data) => {
  const address = data.internalWalletAddress || data.address;
  return {
    internalWalletAddress: address,
    internalWalletPk: data.internalWalletPk,
    viewingPublicKey: data.viewingPublicKey,
    spendingPublicKey: data.spendingPublicKey,
    pair: data.pair,
    hasValidAddress: address ? ethers.isAddress(address) : false,
  };
};

const cleanupGunData = async (path, key) => {
  return new Promise((resolve, reject) => {
    gun
      .get(path)
      .get(key)
      .put({ deleted: true, deletedAt: Date.now() }, (ack) => {
        if (ack.err) {
          reject(ack.err);
          return;
        }
        gun
          .get(path)
          .get(key)
          .put(null, (ack) => {
            if (ack.err) {
              reject(ack.err);
              return;
            }
            gun.get(path).get(key).off();
            resolve();
          });
      });
  });
};

export const walletService = {
  setChain: async (chainKey) => {
    if (!SUPPORTED_CHAINS[chainKey]) {
      throw new Error(`Chain non supportata: ${chainKey}`);
    }

    const userPub = user?.is?.pub;
    if (!userPub) throw new Error("Utente non autenticato");

    localStorage.setItem(
      `chainState_${userPub}`,
      JSON.stringify({
        chainKey: chainKey,
      })
    );

    const state = getUserChainState();
    if (!state) throw new Error("Utente non autenticato");

    return state.currentChain;
  },

  getCurrentWallet: async (userPub) => {
    try {
      if (!userPub) {
        throw new Error("userPub è richiesto per getCurrentWallet");
      }

      const localWallet = localStorage.getItem(`gunWallet_${userPub}`);
      if (localWallet) {
        try {
          const walletData = JSON.parse(localWallet);
          console.log("Wallet data from localStorage:", walletData);

          if (!walletData.internalWalletAddress || !walletData.internalWalletPk) {
            console.log("Wallet data incompleto nel localStorage, provo su Gun");
          } else {
            return normalizeWalletData(walletData);
          }
        } catch (error) {
          console.error("Error parsing localStorage wallet:", error);
        }
      }

      let userData = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("users")
          .get(userPub)
          .once((data) => {
            console.log("User data from Gun:", data);
            resolve(data);
          });
      });

      if (!userData) {
        throw new Error("Dati utente non trovati");
      }

      // Recupera le chiavi stealth
      const stealthKeys = await stealthChain.retrieveStealthKeysFromUser(userPub);
      if (!stealthKeys) {
        throw new Error("Chiavi stealth non trovate");
      }

      const walletData = {
        internalWalletAddress: userData.address,
        internalWalletPk: userData.privateKey,
        viewingPublicKey: stealthKeys.epub,
        spendingPublicKey: stealthKeys.pub,
        pair: {
          pub: stealthKeys.pub,
          priv: stealthKeys.priv,
          epub: stealthKeys.epub,
          epriv: stealthKeys.epriv
        }
      };

      localStorage.setItem(
        `gunWallet_${userPub}`,
        JSON.stringify(walletData)
      );

      return normalizeWalletData(walletData);
    } catch (error) {
      console.error("Error getting current wallet:", error);
      throw error;
    }
  },

  sendTip: async (recipientPub, amount, isStealthMode = false) => {
    try {
      console.log(
        `Sending tip to: ${recipientPub} amount: ${amount} stealth mode: ${isStealthMode}`
      );

      const senderPub = user?.is?.pub;
      if (!senderPub) {
        throw new Error("Utente non autenticato");
      }

      const senderWallet = await walletService.getCurrentWallet(senderPub);
      console.log("Sender wallet:", senderWallet);

      if (!senderWallet?.hasValidAddress) {
        throw new Error("Wallet mittente non valido");
      }

      const state = getUserChainState();
      if (!state) throw new Error("Chain non inizializzata");

      const provider = new JsonRpcProvider(state.currentChain.rpcUrl);
      const signer = new ethers.Wallet(senderWallet.internalWalletPk, provider);

      let tx;
      if (isStealthMode) {
        // Genera l'indirizzo stealth usando StealthChain
        const stealthResult = await new Promise((resolve, reject) => {
          stealthChain.generateStealthAddress(recipientPub, (error, result) => {
            if (error) reject(error);
            else resolve(result);
          });
        });

        console.log("Generated stealth data:", {
          stealthAddress: stealthResult.stealthAddress,
          ephemeralPublicKey: stealthResult.ephemeralPublicKey,
        });

        // Invia la transazione all'indirizzo stealth
        tx = await signer.sendTransaction({
          to: stealthResult.stealthAddress,
          value: ethers.parseEther(amount.toString()),
          chainId: state.currentChain.chainId,
        });

        await tx.wait();

        // Salva l'annuncio stealth
        const announcementId = `stealth_${tx.hash}_${Date.now()}`;
        const announcement = {
          stealthAddress: stealthResult.stealthAddress,
          ephemeralPublicKey: stealthResult.ephemeralPublicKey,
          recipientPublicKey: recipientPub,
          from: senderPub,
          to: recipientPub,
          amount: amount,
          txHash: tx.hash,
          timestamp: Date.now(),
          network: state.currentChain.name,
          isStealthPayment: true,
        };

        await gun
          .get(DAPP_NAME)
          .get("stealth-announcements")
          .get(announcementId)
          .put(announcement);

        await gun
          .get(DAPP_NAME)
          .get("users")
          .get(recipientPub)
          .get("stealth-received")
          .get(announcementId)
          .put(announcement);

        return tx;
      } else {
        // Gestione pagamento standard
        let recipientAddress;

        if (ethers.isAddress(recipientPub)) {
          recipientAddress = recipientPub;
        } else {
          const recipientWallet = await walletService.getUserWalletAddress(recipientPub);
          if (!recipientWallet) {
            throw new Error("Indirizzo del destinatario non trovato");
          }
          recipientAddress = recipientWallet;
        }

        tx = await signer.sendTransaction({
          to: recipientAddress,
          value: ethers.parseEther(amount.toString()),
          chainId: state.currentChain.chainId,
        });

        await tx.wait();

        await gun.get(DAPP_NAME).get("transactions").set({
          from: senderPub,
          to: recipientPub,
          amount: amount,
          txHash: tx.hash,
          timestamp: Date.now(),
          network: state.currentChain.name,
          isStealthPayment: false,
        });

        return tx;
      }
    } catch (error) {
      console.error("Error sending tip:", error);
      throw error;
    }
  },

  retrieveStealthPayments: async () => {
    try {
      const userPub = user?.is?.pub;
      if (!userPub) throw new Error("Utente non autenticato");

      const currentWallet = await walletService.getCurrentWallet(userPub);
      if (!currentWallet) throw new Error("Wallet non trovato");

      const state = getUserChainState();
      if (!state) throw new Error("Chain non inizializzata");

      const recoveredPayments = [];

      // Recupera gli annunci da Gun
      const announcements = await new Promise((resolve) => {
        const results = [];
        gun
          .get(DAPP_NAME)
          .get("stealth-announcements")
          .map()
          .once((announcement) => {
            if (announcement && announcement.to === userPub) {
              results.push(announcement);
            }
          });

        setTimeout(() => resolve(results), 1000);
      });

      if (!announcements.length) return recoveredPayments;

      for (const announcement of announcements) {
        try {
          const balance = await state.provider.getBalance(announcement.stealthAddress);

          if (balance.gt(0)) {
            // Usa StealthChain per recuperare il wallet stealth
            const stealthWallet = await new Promise((resolve, reject) => {
              stealthChain.openStealthAddress(
                announcement.stealthAddress,
                announcement.ephemeralPublicKey,
                (error, wallet) => {
                  if (error) reject(error);
                  else resolve(wallet);
                }
              );
            });

            recoveredPayments.push({
              stealthAddress: announcement.stealthAddress,
              balance: ethers.formatEther(balance),
              stealthWallet,
              originalTx: announcement.txHash,
              timestamp: announcement.timestamp,
              network: announcement.network,
              chain: state.currentChain,
            });
          }
        } catch (error) {
          console.error(`Errore nel recupero del pagamento stealth:`, error);
        }
      }

      return recoveredPayments;
    } catch (error) {
      console.error("Errore nel recupero dei pagamenti stealth:", error);
      throw error;
    }
  },

  claimStealthPayment: async (recoveredPayment) => {
    try {
      const userPub = user?.is?.pub;
      if (!userPub) throw new Error("Utente non autenticato");

      const currentWallet = await walletService.getCurrentWallet(userPub);
      const state = getUserChainState();

      const feeData = await state.provider.getFeeData();
      const gasLimit = 21000n;
      const gasCost = feeData.gasPrice * gasLimit;

      const valueToSend = recoveredPayment.balance - gasCost;

      const tx = await recoveredPayment.stealthWallet.sendTransaction({
        to: currentWallet.internalWalletAddress,
        value: valueToSend,
        gasLimit: gasLimit,
        gasPrice: feeData.gasPrice,
        chainId: state.currentChain.chainId,
      });

      await tx.wait();

      // Rimuovi l'annuncio
      gun
        .get(DAPP_NAME)
        .get("stealth-announcements")
        .get(recoveredPayment.originalTx)
        .put(null);

      return tx;
    } catch (error) {
      console.error("Errore nel riscatto del pagamento stealth:", error);
      throw error;
    }
  },

  getCurrentChain: () => {
    const state = getUserChainState();
    return state ? state.currentChain : SUPPORTED_CHAINS.OPTIMISM_SEPOLIA;
  },

  getSupportedChains: () => SUPPORTED_CHAINS,

  clearWallet: () => {
    const userPub = user?.is?.pub;
    if (userPub) {
      localStorage.removeItem(`gunWallet_${userPub}`);
      localStorage.removeItem(`chainState_${userPub}`);
    }
  },

  getUserWalletAddress: async (userPub) => {
    try {
      // Prima cerca nei dati utente
      const userData = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("users")
          .map()
          .once((data) => {
            if (data && data.pub === userPub) {
              resolve(data);
            }
          });
        setTimeout(() => resolve(null), 2000);
      });

      console.log("Found user data:", userData);

      if (userData?.address) {
        return userData.address;
      }

      // Se non trovato, cerca nel profilo
      const userProfile = await gun
        .user()
        .get(DAPP_NAME)
        .get("profiles")
        .get(userPub)
        .once((data) => {
          console.log("Found user profile:", data);
          return data.address;
        });

      throw new Error("Indirizzo wallet non trovato per questo utente");
    } catch (error) {
      console.error("Error getting user wallet address:", error);
      throw error;
    }
  },

  sendTransaction: async (to, amount) => {
    try {
      const state = getUserChainState();
      if (!state) throw new Error("User not authenticated");

      // Get sender's wallet
      const senderWallet = await walletService.getCurrentWallet();
      const signer = new ethers.Wallet(senderWallet.privateKey, state.provider);

      // Send transaction
      const tx = await signer.sendTransaction({
        to: to,
        value: ethers.parseEther(amount),
        chainId: state.currentChain.chainId,
      });

      await tx.wait();

      // Save transaction record
      gun
        .get(DAPP_NAME)
        .get("transactions")
        .set({
          from: user.is.pub,
          to: to,
          amount: ethers.formatEther(tx.value),
          txHash: tx.hash,
          timestamp: Date.now(),
          network: state.currentChain.name,
        });

      return tx;
    } catch (error) {
      console.error("Error sending transaction:", error);
      throw error;
    }
  },

  // Modifica la funzione che salva gli annunci stealth
  saveStealthAnnouncement: async (announcement, userPub) => {
    try {
      // Aggiungi un ID univoco all'annuncio
      const announcementId = announcement.txHash;

      // Salva nel percorso generale usando l'ID come chiave
      await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("stealth-announcements")
          .get(announcementId)
          .put(announcement, (ack) => {
            if (ack.err) {
              console.error("Errore nel salvare l'annuncio stealth:", ack.err);
            }
            resolve();
          });
      });

      // Salva nel percorso dell'utente usando lo stesso ID
      await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("users")
          .get(userPub)
          .get("stealth-received")
          .get(announcementId)
          .put(announcement, (ack) => {
            if (ack.err) {
              console.error(
                "Errore nel salvare l'annuncio stealth per l'utente:",
                ack.err
              );
            }
            resolve();
          });
      });
    } catch (error) {
      console.error("Errore nel salvare l'annuncio stealth:", error);
    }
  },

  // Aggiungi questa nuova funzione per la pulizia delle transazioni
  cleanTransaction: async (txHash, userPub, isStealthPayment = false) => {
    try {
      if (isStealthPayment) {
        await Promise.all([
          cleanupGunData(`${DAPP_NAME}/stealth-announcements`, txHash),
          cleanupGunData(
            `${DAPP_NAME}/users/${userPub}/stealth-received`,
            txHash
          ),
        ]);
      } else {
        await cleanupGunData(`${DAPP_NAME}/transactions`, txHash);
      }
      return true;
    } catch (error) {
      console.error("Errore nella pulizia della transazione:", error);
      throw error;
    }
  },
};
