import { gun, user, DAPP_NAME, SEA } from './useGun.js';
import { ethers } from 'ethers';

// Estendi Gun con funzionalità GunEth
Object.assign(Gun.chain);

// Chain configurations
const SUPPORTED_CHAINS = {
  OPTIMISM_SEPOLIA: {
    name: 'Optimism Sepolia',
    chainId: 11155420,
    rpcUrl:
      'https://spring-serene-snow.optimism-sepolia.quiknode.pro/d02b30b94d9d8e89cee0b2a694d5e1a5c6d87d9f',
    blockExplorer: 'https://sepolia-optimism.etherscan.io/',
    nativeCurrency: {
      name: 'ETH',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  POLYGON_MAINNET: {
    name: 'Polygon',
    chainId: 137,
    rpcUrl:
      'https://polygon-mainnet.g.alchemy.com/v2/yjhjIoJ3o_at8ALT7nCJtFtjdqFpiBdx',
    blockExplorer: 'https://polygonscan.com/',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18,
    },
  },
};

// Creiamo una Map per mantenere lo stato per ogni utente
const userChainStates = new Map();

// Funzione per ottenere o creare lo stato per un utente
const getUserChainState = () => {
  const userPub = user?.is?.pub;
  if (!userPub) return null;

  // Prova a recuperare lo stato dal localStorage
  const savedState = localStorage.getItem(`chainState_${userPub}`);
  if (savedState) {
    const state = JSON.parse(savedState);
    return {
      currentChain: SUPPORTED_CHAINS[state.chainKey],
      provider: new ethers.JsonRpcProvider(
        SUPPORTED_CHAINS[state.chainKey].rpcUrl
      ),
    };
  }

  // Se non esiste, crea un nuovo stato
  const initialState = {
    currentChain: SUPPORTED_CHAINS.OPTIMISM_SEPOLIA,
    provider: new ethers.JsonRpcProvider(
      SUPPORTED_CHAINS.OPTIMISM_SEPOLIA.rpcUrl
    ),
  };

  // Salva lo stato iniziale
  localStorage.setItem(
    `chainState_${userPub}`,
    JSON.stringify({
      chainKey: 'OPTIMISM_SEPOLIA',
    })
  );

  return initialState;
};

const normalizeWalletData = (data) => {
  // Verifica se abbiamo almeno un indirizzo valido
  const address = data.internalWalletAddress || data.address;

  // Se non abbiamo un indirizzo, restituisci i dati senza indirizzo
  // ma con le altre informazioni necessarie
  return {
    internalWalletAddress: address, // Potrebbe essere undefined
    internalWalletPk: data.internalWalletPk,
    viewingPublicKey: data.viewingPublicKey,
    spendingPublicKey: data.spendingPublicKey,
    pair: data.pair,
    vPair: data.vPair,
    sPair: data.sPair,
    credentials: data.credentials,
    // Aggiungi un flag per indicare se l'indirizzo è valido
    hasValidAddress: address ? ethers.isAddress(address) : false,
  };
};

export const walletService = {
  setChain: async (chainKey) => {
    if (!SUPPORTED_CHAINS[chainKey]) {
      throw new Error(`Chain non supportata: ${chainKey}`);
    }

    const userPub = user?.is?.pub;
    if (!userPub) throw new Error('Utente non autenticato');

    // Salva la nuova chain nel localStorage
    localStorage.setItem(
      `chainState_${userPub}`,
      JSON.stringify({
        chainKey: chainKey,
      })
    );

    // Aggiorna lo stato corrente
    const state = getUserChainState();
    if (!state) throw new Error('Utente non autenticato');

    return state.currentChain;
  },

  getCurrentWallet: async (userPub) => {
    try {
      if (!userPub) {
        throw new Error('userPub è richiesto per getCurrentWallet');
      }

      // Prima controlla nel localStorage
      const localWallet = localStorage.getItem(`gunWallet_${userPub}`);
      if (localWallet) {
        try {
          const walletData = JSON.parse(localWallet);
          console.log('Wallet data from localStorage:', walletData);

          if (
            !walletData.internalWalletAddress ||
            !walletData.internalWalletPk
          ) {
            console.log(
              'Wallet data incompleto nel localStorage, provo su Gun'
            );
          } else {
            return normalizeWalletData(walletData);
          }
        } catch (error) {
          console.error('Error parsing localStorage wallet:', error);
        }
      }

      // Se non trovato nel localStorage o dati incompleti, cerca nei dati utente
      const userData = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('users')
          .get(userPub)
          .once((data) => {
            console.log('User data from Gun:', data);
            resolve(data);
          });
      });

      if (!userData) {
        throw new Error('Dati utente non trovati');
      }

      // Recupera le credenziali dal localStorage
      const storedWallet = localStorage.getItem(`gunWallet_${userPub}`);
      let credentials;
      if (storedWallet) {
        const storedData = JSON.parse(storedWallet);
        credentials = storedData.credentials;
      }

      if (!credentials?.password) {
        throw new Error('Credenziali non trovate');
      }

      // Verifica che i dati necessari siano presenti
      if (
        !userData.pair ||
        !userData.viewingKeyPair ||
        !userData.spendingKeyPair
      ) {
        console.error('Dati mancanti:', { userData });
        throw new Error('Dati di cifratura mancanti');
      }

      // Decifra le coppie di chiavi
      try {
        const [decryptedPair, decryptedVPair, decryptedSPair] =
          await Promise.all([
            gun.decryptWithPassword(userData.pair, credentials.password),
            gun.decryptWithPassword(
              userData.viewingKeyPair,
              credentials.password
            ),
            gun.decryptWithPassword(
              userData.spendingKeyPair,
              credentials.password
            ),
          ]);

        // Converti la chiave privata nel formato corretto per Ethereum
        const hexPrivateKey = await gun.convertToEthAddress(
          decryptedPair.epriv
        );

        const walletData = {
          internalWalletAddress: userData.address,
          internalWalletPk: hexPrivateKey,
          viewingPublicKey: userData.viewingPublicKey,
          spendingPublicKey: userData.spendingPublicKey,
          pair: decryptedPair,
          vPair: decryptedVPair,
          sPair: decryptedSPair,
          credentials,
        };

        // Salva nel localStorage per accessi futuri
        localStorage.setItem(
          `gunWallet_${userPub}`,
          JSON.stringify(walletData)
        );

        return normalizeWalletData(walletData);
      } catch (error) {
        console.error('Error decrypting keys:', error);
        throw new Error('Errore nella decifratura delle chiavi');
      }
    } catch (error) {
      console.error('Error getting current wallet:', error);
      throw error;
    }
  },

  getUserWalletAddress: async (userPub) => {
    try {
      // Prima cerca nei dati utente
      const userData = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('users')
          .map()
          .once((data) => {
            if (data && data.pub === userPub) {
              resolve(data);
            }
          });
        setTimeout(() => resolve(null), 2000);
      });

      console.log('Found user data:', userData);

      if (userData?.address) {
        return userData.address;
      }

      // Se non trovato, cerca nel profilo
      const userProfile = await gun
        .user()
        .get(DAPP_NAME)
        .get('profiles')
        .get(userPub)
        .once((data) => {
          console.log('Found user profile:', data);
          return data.address;
        });

      throw new Error('Indirizzo wallet non trovato per questo utente');
    } catch (error) {
      console.error('Error getting user wallet address:', error);
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
        throw new Error('Utente non autenticato');
      }

      // Ottieni il wallet del mittente
      const senderWallet = await walletService.getCurrentWallet(senderPub);
      console.log('Sender wallet:', senderWallet); // Debug

      if (!senderWallet?.hasValidAddress) {
        throw new Error('Wallet mittente non valido');
      }

      const state = getUserChainState();
      if (!state) throw new Error('Chain non inizializzata');

      const provider = new ethers.JsonRpcProvider(state.currentChain.rpcUrl);
      const signer = new ethers.Wallet(senderWallet.internalWalletPk).connect(
        provider
      );

      let tx;
      if (isStealthMode) {
        // Recupera i dati del destinatario
        const recipientData = await gun
          .get(DAPP_NAME)
          .get('users')
          .get(recipientPub)
          .once();

        console.log('Recipient data:', recipientData);

        if (
          !recipientData?.viewingPublicKey ||
          !recipientData?.spendingPublicKey
        ) {
          throw new Error('Chiavi pubbliche del destinatario non trovate');
        }

        // Usa s_Pair invece di sPair
        const gunWallet = localStorage.getItem(`gunWallet_${senderPub}`);
        const gunWalletData = JSON.parse(gunWallet);
        const s_Pair = gunWalletData.s_Pair;
        if (!s_Pair) {
          console.error('Wallet data:', senderWallet); // Debug
          throw new Error('Spending key pair (s_Pair) non trovata nel wallet');
        }

        console.log('Using spending key pair:', s_Pair);

        // Genera l'indirizzo stealth usando la nuova implementazione
        const { 
          stealthAddress, 
          senderEphemeralPublicKey, 
          sharedSecret 
        } = await gun.generateStealthAddress(
          recipientData.viewingPublicKey,
          recipientData.spendingPublicKey
        );

        console.log('Generated stealth data:', {
          stealthAddress,
          senderEphemeralPublicKey,
          sharedSecret: '***hidden***'
        });

        // Invia la transazione all'indirizzo stealth
        tx = await signer.sendTransaction({
          to: stealthAddress,
          value: ethers.parseEther(amount.toString()),
          chainId: state.currentChain.chainId,
        });

        await tx.wait();

        // Crea l'annuncio stealth completo usando i nomi dei campi corretti
        const fullAnnouncement = {
          stealthAddress,
          senderEphemeralKey: senderEphemeralPublicKey, // Nota: questo è il nome del campo atteso
          receiverViewingKey: recipientData.viewingPublicKey,
          receiverSpendingKey: recipientData.spendingPublicKey,
          sharedSecret,
          from: senderPub,
          to: recipientPub,
          amount: amount,
          txHash: tx.hash,
          timestamp: Date.now(),
          network: state.currentChain.name,
          isStealthPayment: true
        };

        console.log('Saving stealth announcement:', fullAnnouncement);

        // Salva l'annuncio sia nel percorso del mittente che in quello generale
        const announcementId = `stealth_${tx.hash}_${Date.now()}`;
        
        // 1. Salva nel percorso generale degli annunci
        await gun
          .get(DAPP_NAME)
          .get('stealth-announcements')
          .get(announcementId)
          .put(fullAnnouncement);

        // 2. Salva anche nel percorso del destinatario per un accesso più rapido
        await gun
          .get(DAPP_NAME)
          .get('users')
          .get(recipientPub)
          .get('stealth-received')
          .get(announcementId)
          .put(fullAnnouncement);

        return tx;
      }

      // ... resto del codice per pagamenti standard ...
    } catch (error) {
      console.error('Error sending tip:', error);
      throw error;
    }
  },

  retrieveStealthPayments: async () => {
    try {
      const userPub = user?.is?.pub;
      if (!userPub) throw new Error('Utente non autenticato');

      // Ottieni il wallet corrente
      const currentWallet = await walletService.getCurrentWallet(userPub);
      if (!currentWallet) throw new Error('Wallet non trovato');

      const state = getUserChainState();
      if (!state) throw new Error('Chain non inizializzata');

      // Crea il signer con la chiave privata corretta
      const signer = new ethers.Wallet(currentWallet.internalWalletPk).connect(
        state.provider
      );

      const recoveredPayments = [];

      // Recupera gli annunci da Gun
      const announcements = await new Promise((resolve) => {
        const results = [];
        gun
          .get(DAPP_NAME)
          .get('stealth-announcements')
          .map()
          .once((announcement) => {
            if (announcement && announcement.to === userPub) {
              results.push(announcement);
            }
          });

        // Aspetta un po' per raccogliere i risultati
        setTimeout(() => resolve(results), 1000);
      });

      if (!announcements.length) return recoveredPayments;

      for (const announcement of announcements) {
        try {
          // Verifica il saldo dell'indirizzo stealth
          const balance = await state.provider.getBalance(
            announcement.stealthAddress
          );

          if (balance > 0) {
            // Crea la transazione per recuperare i fondi
            const tx = {
              from: announcement.stealthAddress,
              to: currentWallet.internalWalletAddress,
              value: balance,
              stealthData: {
                viewingKeyPair: currentWallet.vPair,
                spendingKeyPair: currentWallet.sPair,
                senderPublicKey: announcement.senderPublicKey,
              },
              originalTx: announcement.txHash,
              timestamp: announcement.timestamp,
              network: announcement.network,
            };

            recoveredPayments.push({
              ...tx,
              balance: ethers.formatEther(balance),
              chain: state.currentChain,
            });
          }
        } catch (error) {
          console.error(`Errore nel recupero del pagamento stealth:`, error);
        }
      }

      return recoveredPayments;
    } catch (error) {
      console.error('Errore nel recupero dei pagamenti stealth:', error);
      throw error;
    }
  },

  // Aggiungi questa nuova funzione per riscattare effettivamente il pagamento
  claimStealthPayment: async (recoveredPayment) => {
    try {
      const userPub = user?.is?.pub;
      if (!userPub) throw new Error('Utente non autenticato');

      const currentWallet = await walletService.getCurrentWallet(userPub);
      const state = getUserChainState();

      const signer = new ethers.Wallet(currentWallet.internalWalletPk).connect(
        state.provider
      );

      // Calcola la chiave privata stealth usando le chiavi del destinatario e del mittente
      const stealthPrivateKey = await gun.deriveStealthPrivateKey(
        recoveredPayment.stealthData.viewingKeyPair,
        recoveredPayment.stealthData.spendingKeyPair,
        recoveredPayment.stealthData.senderPublicKey
      );

      // Crea un wallet con la chiave privata stealth
      const stealthWallet = new ethers.Wallet(stealthPrivateKey).connect(
        state.provider
      );

      // Calcola il gas necessario
      const gasPrice = await state.provider.getFeeData();
      const gasLimit = 21000; // transfer base cost
      const gasCost = gasPrice.gasPrice * BigInt(gasLimit);

      // Sottrai il costo del gas dal valore da trasferire
      const valueToSend = recoveredPayment.value - gasCost;

      // Invia la transazione
      const tx = await stealthWallet.sendTransaction({
        to: currentWallet.internalWalletAddress,
        value: valueToSend,
        gasLimit: gasLimit,
        gasPrice: gasPrice.gasPrice,
        chainId: state.currentChain.chainId,
      });

      await tx.wait();

      // Rimuovi l'annuncio da Gun dopo il claim
      gun
        .get(DAPP_NAME)
        .get('stealth-announcements')
        .get(recoveredPayment.originalTx)
        .put(null);

      return tx;
    } catch (error) {
      console.error('Errore nel riscatto del pagamento stealth:', error);
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

  sendTransaction: async (to, amount) => {
    try {
      const state = getUserChainState();
      if (!state) throw new Error('User not authenticated');

      // Get sender's wallet
      const senderWallet = await walletService.getCurrentWallet();
      const signer = new ethers.Wallet(senderWallet.privateKey).connect(
        state.provider
      );

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
        .get('transactions')
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
      console.error('Error sending transaction:', error);
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
        gun.get(DAPP_NAME)
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
        gun.get(DAPP_NAME)
           .get("users")
           .get(userPub)
           .get("stealth-received")
           .get(announcementId)
           .put(announcement, (ack) => {
             if (ack.err) {
               console.error("Errore nel salvare l'annuncio stealth per l'utente:", ack.err);
             }
             resolve();
           });
      });
    } catch (error) {
      console.error("Errore nel salvare l'annuncio stealth:", error);
    }
  },
};
