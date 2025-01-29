import { gun, user, DAPP_NAME } from "./useGun.js";
import { ethers, JsonRpcProvider } from "ethers";
import { StealthChain } from "@scobru/shogun";
import GUN from 'gun';

const SEA = GUN.SEA;

// Cache per i wallet
const walletCache = new Map();
const CACHE_DURATION = 30000; // 30 secondi di cache

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
  SEPOLIA_TESTNET: {
    name: "Sepolia Testnet",
    chainId: 11155111,
    rpcUrl:
      "https://eth-sepolia.g.alchemy.com/v2/pq9eEUbylJw5ENv94Z1lu0h4bU4OHhRQ",
    blockExplorer: "https://sepolia.etherscan.io/",
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

// Funzione per normalizzare la chiave privata
const normalizePrivateKey = (privateKey) => {
  try {
    // Rimuovi eventuali spazi
    let cleanKey = privateKey.trim();
    
    // Aggiungi 0x se non presente
    if (!cleanKey.startsWith('0x')) {
      cleanKey = '0x' + cleanKey;
    }
    
    // Verifica che la lunghezza sia corretta (32 bytes = 64 caratteri + '0x')
    if (cleanKey.length !== 66) {
      throw new Error("Lunghezza chiave privata non valida");
    }
    
    // Verifica che sia una stringa esadecimale valida
    if (!/^0x[0-9a-fA-F]{64}$/.test(cleanKey)) {
      throw new Error("Formato chiave privata non valido");
    }
    
    return cleanKey;
  } catch (error) {
    console.error("Error normalizing private key:", error);
    throw new Error("Chiave privata non valida");
  }
};

const getFromCache = (key) => {
  const cached = walletCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log("Recupero wallet dalla cache per:", key);
    return cached.data;
  }
  return null;
};

const setInCache = (key, data) => {
  console.log("Salvo wallet in cache per:", key);
  walletCache.set(key, {
    data,
    timestamp: Date.now()
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

      // Controlla la cache
      const cached = getFromCache(`wallet_${userPub}`);
      if (cached) {
        return cached;
      }

      // Prova prima dal localStorage
      const localWallet = localStorage.getItem(`gunWallet_${userPub}`);
      if (localWallet) {
        try {
          const walletData = JSON.parse(localWallet);
          console.log("Dati wallet da localStorage:", walletData);

          if (walletData.internalWalletAddress && walletData.internalWalletPk) {
            const normalized = normalizeWalletData(walletData);
            setInCache(`wallet_${userPub}`, normalized);
            return normalized;
          }
        } catch (error) {
          console.error("Errore parsing localStorage wallet:", error);
        }
      }

      // Prova da Gun
      const userData = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("users")
          .get(userPub)
          .once((data) => {
            console.log("Dati utente da Gun:", data);
            resolve(data);
          });
      });

      if (userData?.address && userData?.privateKey) {
        const walletData = {
          internalWalletAddress: userData.address,
          internalWalletPk: userData.privateKey,
        };

        // Salva nel localStorage
        localStorage.setItem(
          `gunWallet_${userPub}`,
          JSON.stringify(walletData)
        );

        const normalized = normalizeWalletData(walletData);
        setInCache(`wallet_${userPub}`, normalized);
        return normalized;
      }

      // Se non troviamo il wallet, ne creiamo uno nuovo
      console.log("Nessun wallet trovato, ne creo uno nuovo");
      
      const wallet = ethers.Wallet.createRandom();
      console.log("Nuovo wallet creato:", wallet.address);

      const newWalletData = {
        internalWalletAddress: wallet.address,
        internalWalletPk: wallet.privateKey,
      };

      // Salva in Gun
      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get("users")
          .get(userPub)
          .put({
            address: wallet.address,
            privateKey: wallet.privateKey,
            createdAt: Date.now(),
          }, (ack) => {
            if (ack.err) {
              console.error("Errore salvataggio wallet in Gun:", ack.err);
              reject(new Error("Errore salvataggio wallet in Gun"));
            } else {
              resolve();
            }
          });
      });

      // Salva in localStorage
      localStorage.setItem(
        `gunWallet_${userPub}`,
        JSON.stringify(newWalletData)
      );

      console.log("Nuovo wallet salvato con successo");
      const normalized = normalizeWalletData(newWalletData);
      setInCache(`wallet_${userPub}`, normalized);
      return normalized;

    } catch (error) {
      console.error("Errore recupero/creazione wallet:", error);
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
        console.log("Generazione chiavi stealth per:", recipientPub);

        // Ottieni la chiave pubblica del destinatario
        const recipientData = await new Promise((resolve) => {
          gun.get(DAPP_NAME)
            .get("users")
            .get(recipientPub)
            .once((data) => {
              console.log("Dati destinatario:", data);
              resolve(data);
            });
        });

        // Verifica e normalizza la chiave pubblica
        let viewingPublicKey = recipientData?.viewingPublicKey;
        if (!viewingPublicKey || typeof viewingPublicKey !== 'string') {
          console.log("Chiave pubblica mancante o non valida, la genero per:", recipientPub);
          
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

          // Normalizza la chiave pubblica
          viewingPublicKey = stealthKeys.pub;

          // Aggiorna i dati utente con le nuove chiavi
          const updatedUserData = {
            ...recipientData,
            viewingPublicKey: viewingPublicKey,
            spendingPublicKey: stealthKeys.epub
          };

          console.log("Salvo i dati utente aggiornati:", updatedUserData);

          // Salva le chiavi pubbliche
          await gun.get(DAPP_NAME)
            .get("users")
            .get(recipientPub)
            .put(updatedUserData);

          // Salva le chiavi private in modo sicuro
          const encryptedStealthKeys = await SEA.encrypt({
            viewingPrivateKey: stealthKeys.priv,
            spendingPrivateKey: stealthKeys.epriv
          }, recipientData);

          // Salva le chiavi private cifrate
          await gun.get(DAPP_NAME)
            .get("users")
            .get(recipientPub)
            .get("stealth-keys")
            .put(encryptedStealthKeys);
        }

        // Verifica che la chiave pubblica sia una stringa valida
        if (typeof viewingPublicKey !== 'string' || !viewingPublicKey.startsWith('0x')) {
          throw new Error("Chiave pubblica di visualizzazione non valida");
        }

        console.log("Uso la chiave di visualizzazione:", viewingPublicKey);

        // Genera una nuova coppia di chiavi effimere per questa transazione
        const ephemeralKeys = await new Promise((resolve, reject) => {
          stealthChain.generateStealthKeys((error, keys) => {
            if (error) {
              console.error("Errore generazione chiavi effimere:", error);
              reject(error);
              return;
            }
            console.log("Chiavi effimere generate:", keys);
            resolve(keys);
          });
        });

        if (!ephemeralKeys?.pub) {
          throw new Error("Errore nella generazione delle chiavi effimere");
        }

        // Genera l'indirizzo stealth usando StealthChain
        const stealthResult = await new Promise((resolve, reject) => {
          stealthChain.generateStealthAddress({
            recipientViewingKey: viewingPublicKey,
            ephemeralKeyPair: ephemeralKeys,
            callback: (error, result) => {
              if (error) {
                console.error("Errore generazione indirizzo stealth:", error);
                reject(error);
                return;
              }
              console.log("Dati stealth generati:", result);
              resolve({
                ...result,
                ephemeralPublicKey: ephemeralKeys.pub
              });
            }
          });
        });

        if (!stealthResult?.stealthAddress) {
          throw new Error("Indirizzo stealth non generato correttamente");
        }

        console.log("Invio transazione stealth a:", stealthResult.stealthAddress);

        // Invia la transazione all'indirizzo stealth
        tx = await signer.sendTransaction({
          to: stealthResult.stealthAddress,
          value: ethers.parseEther(amount.toString()),
          chainId: state.currentChain.chainId,
        });

        await tx.wait();
        console.log("Transazione stealth confermata:", tx.hash);

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

        console.log("Annuncio stealth salvato");
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
      if (!userPub) {
        throw new Error("userPub non fornito");
      }

      // Controlla la cache
      const cached = getFromCache(`address_${userPub}`);
      if (cached) {
        return cached;
      }

      // Prima cerca nei dati utente
      const userData = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("users")
          .get(userPub)
          .once((data) => {
            console.log("Found user data:", data);
            resolve(data);
          });
      });

      if (userData?.address) {
        setInCache(`address_${userPub}`, userData.address);
        return userData.address;
      }

      // Se non trovato, cerca nel profilo
      const profileData = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("profiles")
          .get(userPub)
          .once((data) => {
            console.log("Found profile data:", data);
            resolve(data);
          });
      });

      if (profileData?.address) {
        setInCache(`address_${userPub}`, profileData.address);
        return profileData.address;
      }

      // Se non trovato, cerca nel wallet
      const walletData = await walletService.getCurrentWallet(userPub);
      if (walletData?.internalWalletAddress) {
        setInCache(`address_${userPub}`, walletData.internalWalletAddress);
        return walletData.internalWalletAddress;
      }

      throw new Error("Indirizzo wallet non trovato per questo utente");
    } catch (error) {
      console.error("Error getting user wallet address:", error);
      throw error;
    }
  },

  sendTransaction: async (recipientAddress, amount) => {
    try {
      const userPub = user?.is?.pub;
      if (!userPub) {
        throw new Error("Utente non autenticato");
      }

      const currentWallet = await walletService.getCurrentWallet(userPub);
      if (!currentWallet) {
        throw new Error("Wallet non trovato");
      }

      if (!currentWallet.internalWalletPk) {
        throw new Error("Chiave privata non trovata nel wallet");
      }

      const state = getUserChainState();
      if (!state) {
        throw new Error("Chain non inizializzata");
      }

      console.log("Chain corrente:", state.currentChain.name);
      console.log("Chain ID:", state.currentChain.chainId);

      // Normalizza la chiave privata
      const normalizedPrivateKey = normalizePrivateKey(currentWallet.internalWalletPk);
      console.log("Chiave privata normalizzata:", normalizedPrivateKey ? "presente" : "mancante");

      const provider = new JsonRpcProvider(state.currentChain.rpcUrl);
      const network = await provider.getNetwork();
      console.log("Network chainId:", network.chainId);

      const signer = new ethers.Wallet(normalizedPrivateKey, provider);
      console.log("Signer creato con successo");

      // Verifica il saldo
      const balance = await provider.getBalance(signer.address);
      console.log("Saldo wallet:", ethers.formatEther(balance), "ETH");

      const amountWei = ethers.parseEther(amount.toString());
      if (balance < amountWei) {
        throw new Error(`Saldo insufficiente. Hai ${ethers.formatEther(balance)} ETH, necessari ${amount} ETH`);
      }

      // Stima il gas
      const gasEstimate = await provider.estimateGas({
        from: signer.address,
        to: recipientAddress,
        value: amountWei,
      });

      const gasPrice = await provider.getFeeData();
      const gasCost = gasEstimate * gasPrice.gasPrice;
      console.log("Costo stimato gas:", ethers.formatEther(gasCost), "ETH");

      // Verifica se c'è abbastanza ETH per la transazione + gas
      if (balance < amountWei + gasCost) {
        throw new Error(`Saldo insufficiente per coprire il gas. Necessari ${ethers.formatEther(amountWei + gasCost)} ETH totali`);
      }

      console.log("Invio transazione a:", recipientAddress);
      console.log("Importo:", amount);

      const tx = await signer.sendTransaction({
        to: recipientAddress,
        value: amountWei,
        chainId: network.chainId,
        gasLimit: gasEstimate,
        maxFeePerGas: gasPrice.maxFeePerGas,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
      });

      console.log("Transazione inviata:", tx.hash);
      await tx.wait();
      console.log("Transazione confermata");

      await gun.get(DAPP_NAME).get("transactions").set({
        from: userPub,
        to: recipientAddress,
        amount: amount,
        txHash: tx.hash,
        timestamp: Date.now(),
        network: state.currentChain.name,
        isStealthPayment: false,
      });

      return tx;
    } catch (error) {
      console.error("Errore invio transazione:", error);
      if (error.code === "CALL_EXCEPTION") {
        throw new Error("Errore durante la stima del gas. Verifica il saldo e riprova.");
      }
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
