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

export const walletService = {
  // Add chain management methods
  setChain: async (chainKey) => {
    if (!SUPPORTED_CHAINS[chainKey]) {
      throw new Error(`Unsupported chain: ${chainKey}`);
    }

    const userPub = user?.is?.pub;
    if (!userPub) throw new Error('User not authenticated');

    // Salva la nuova chain nel localStorage
    localStorage.setItem(
      `chainState_${userPub}`,
      JSON.stringify({
        chainKey: chainKey,
      })
    );

    const state = getUserChainState();
    if (!state) throw new Error('User not authenticated');

    state.currentChain = SUPPORTED_CHAINS[chainKey];
    state.provider = new ethers.JsonRpcProvider(state.currentChain.rpcUrl);

    return state.currentChain;
  },

  getCurrentChain: () => {
    const state = getUserChainState();
    return state ? state.currentChain : SUPPORTED_CHAINS.OPTIMISM_SEPOLIA;
  },

  getSupportedChains: () => SUPPORTED_CHAINS,

  /**
   * Ottiene il wallet dell'utente corrente
   * @returns {Promise<{address: string, type: string}>}
   */
  getCurrentWallet: async () => {
    console.log('Getting current wallet...');
    try {
      const state = getUserChainState();
      if (!state) throw new Error('User not authenticated');

      const userPub = user?.is?.pub;
      if (!userPub) throw new Error('User not authenticated');

      // Usa una chiave specifica per utente per il wallet
      const walletKey = `gunWallet_${userPub}`;

      if (localStorage.getItem(walletKey)) {
        const gunWallet = JSON.parse(localStorage.getItem(walletKey));
        return {
          address: gunWallet.account.address,
          privateKey: gunWallet.privateKey,
          type: 'derived',
          chain: state.currentChain,
        };
      }

      if (user?.is) {
        const privateKey = user._.sea.priv;
        const derivedWallet = await gun.gunToEthAccount(privateKey);
        // Salva il wallet con la chiave specifica dell'utente
        localStorage.setItem(walletKey, JSON.stringify(derivedWallet));

        return {
          address: derivedWallet.account.address,
          type: 'derived',
          privateKey: derivedWallet.privateKey,
          chain: state.currentChain,
        };
      }

      throw new Error('Nessun wallet disponibile');
    } catch (error) {
      console.error('Error getting current wallet:', error);
      throw error;
    }
  },

  /**
   * Recupera l'indirizzo del wallet di un utente
   * @param {string} userPub - Chiave pubblica dell'utente
   * @returns {Promise<string>} Indirizzo del wallet
   */
  getUserWalletAddress: async (userPub) => {
    try {
      const userData = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('userList')
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

      const userProfile = await gun
        .user(userPub)
        .get(DAPP_NAME)
        .get('profile')
        .then();
      console.log('Found user profile:', userProfile);

      if (userProfile?.address) {
        return userProfile.address;
      }

      const userKeys = await gun.user(userPub).then();
      if (userKeys?.priv) {
        const derivedWallet = await gun.gunToEthAccount(userKeys.priv);
        return derivedWallet.account.address;
      }

      throw new Error('Indirizzo wallet non trovato per questo utente');
    } catch (error) {
      console.error('Error getting user wallet address:', error);
      throw error;
    }
  },

  /**
   * Invia un tip a un altro utente
   * @param {string} recipientPub - Chiave pubblica del destinatario
   * @param {string} amount - Importo in ETH
   */
  sendTip: async (recipientPub, amount, isStealthMode = false) => {
    try {
      console.log('Inizializzazione sendTip...');
      console.log(
        'Parametri:',
        { recipientPub, amount, isStealthMode }
      );

      const state = getUserChainState();
      if (!state) throw new Error('User not authenticated');
      console.log('Stato chain recuperato:', state.currentChain.name);

      const senderWallet = await walletService.getCurrentWallet();
      console.log('Wallet mittente recuperato:', { address: senderWallet.address });
      
      const signer = new ethers.Wallet(senderWallet.privateKey).connect(
        state.provider
      );
      console.log('Signer creato correttamente');

      const recipientAddress = await walletService.getUserWalletAddress(
        recipientPub
      );
      console.log('Indirizzo destinatario recuperato:', recipientAddress);

      if (isStealthMode) {
        console.log('Inizializzazione modalità stealth...');
        
        try {
          const senderInternalWallet = await gun.gunToEthAccount(user._.sea.priv);
          console.log('Wallet interno mittente creato');
          
          const walletInstance = new ethers.Wallet(
            senderInternalWallet.internalWalletPk
          );
          console.log('Wallet instance creata');
          
          const messageToSign = 'Access GunDB with Ethereum';
          const messageBytes = ethers.toUtf8Bytes(messageToSign);
          const signature = await walletInstance.signMessage(messageBytes);
          console.log('Firma creata:', signature);

          // Assicuriamoci che l'indirizzo sia in lowercase
          const normalizedAddress = recipientAddress.toLowerCase();
          console.log('Indirizzo normalizzato:', normalizedAddress);

          // Generiamo prima le chiavi stealth
          const stealthKeyPair = await SEA.pair();
          console.log('Chiavi stealth generate:', {
            pub: stealthKeyPair.pub,
            epub: stealthKeyPair.epub
          });

          const gunEthData = {
            profile: {
              address: normalizedAddress,
              pub: recipientPub,
            },
            publicKeys: {
              viewingPublicKey: stealthKeyPair.epub,
              spendingPublicKey: stealthKeyPair.pub,
            },
            stealthKeys: {
              viewingPublicKey: stealthKeyPair.epub,
              spendingPublicKey: stealthKeyPair.pub,
              timestamp: Date.now(),
            },
          };
          console.log('Dati Gun-ETH preparati:', gunEthData);

          // Salvataggio dati utente con chiavi stealth
          console.log('Salvataggio dati utente...');
          const userData = {
            address: normalizedAddress,
            pub: recipientPub,
            viewingPublicKey: stealthKeyPair.epub,
            spendingPublicKey: stealthKeyPair.pub,
            type: 'user',
            timestamp: Date.now()
          };
          
          await new Promise((resolve, reject) => {
            gun
              .get('gun-eth')
              .get('users')
              .get(normalizedAddress)
              .put(userData, ack => {
                if (ack.err) reject(new Error(ack.err));
                else resolve();
              });
          });
          
          // Salvataggio chiavi stealth
          console.log('Salvataggio chiavi stealth...');
          const stealthData = {
            address: normalizedAddress,
            viewingPublicKey: stealthKeyPair.epub,
            spendingPublicKey: stealthKeyPair.pub,
            type: 'stealth',
            timestamp: Date.now()
          };
          
          await new Promise((resolve, reject) => {
            gun
              .get('gun-eth')
              .get('stealth-keys')
              .get(normalizedAddress)
              .put(stealthData, ack => {
                if (ack.err) reject(new Error(ack.err));
                else resolve();
              });
          });

          // Breve pausa per permettere la sincronizzazione
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Verifichiamo che le chiavi siano state salvate
          const savedKeys = await new Promise((resolve) => {
            gun
              .get('gun-eth')
              .get('stealth-keys')
              .get(normalizedAddress)
              .once((data) => {
                console.log('Chiavi stealth salvate verificate:', data);
                resolve(data);
              });
            setTimeout(() => resolve(null), 3000);
          });

          if (!savedKeys) {
            throw new Error('Verifica del salvataggio chiavi stealth fallita');
          }

          console.log('Generazione indirizzo stealth...');
          const stealthInfo = await gun.generateStealthAddress(
            normalizedAddress,
            signature
          );

          if (!stealthInfo || !stealthInfo.stealthAddress) {
            throw new Error('Generazione indirizzo stealth fallita');
          }

          console.log('Info stealth generate:', stealthInfo);

          // Verifica e normalizza l'indirizzo stealth
          let stealthAddress;
          try {
            // Verifica se l'indirizzo è in formato checksum
            stealthAddress = ethers.getAddress(stealthInfo.stealthAddress);
          } catch (error) {
            console.error('Errore nella normalizzazione indirizzo stealth:', error);
            
            // Prova a derivare l'indirizzo stealth manualmente
            try {
              const stealthBytes = ethers.concat([
                ethers.toUtf8Bytes(stealthInfo.viewingPublicKey),
                ethers.toUtf8Bytes(stealthInfo.ephemeralPublicKey || normalizedAddress)
              ]);
              
              const hashedAddress = ethers.keccak256(stealthBytes);
              stealthAddress = ethers.getAddress(hashedAddress.slice(0, 42));
              
              console.log('Indirizzo stealth derivato manualmente:', stealthAddress);
            } catch (derivationError) {
              console.error('Errore nella derivazione manuale:', derivationError);
              throw new Error('Impossibile generare un indirizzo stealth valido');
            }
          }

          if (!stealthAddress || !ethers.isAddress(stealthAddress)) {
            throw new Error('Indirizzo stealth non valido dopo la normalizzazione');
          }

          console.log('Annuncio pagamento stealth...');
          await gun.announceStealthPayment(
            stealthAddress,
            senderInternalWallet.publicKeys.viewingPublicKey,
            stealthInfo.spendingPublicKey,
            signature
          );

          // Verifica che l'annuncio sia stato salvato
          console.log('Verifica salvataggio annuncio...');
          const savedAnnouncement = await new Promise((resolve) => {
            gun
              .get("gun-eth")
              .get("stealth-payments")
              .get(stealthAddress)
              .once((data) => {
                console.log('Annuncio salvato:', data);
                resolve(data);
              });
            setTimeout(() => resolve(null), 3000);
          });

          if (!savedAnnouncement) {
            console.warn('Annuncio non trovato dopo il salvataggio');
          }

          console.log('Invio transazione stealth...');
          const tx = await signer.sendTransaction({
            to: stealthAddress,
            value: ethers.parseEther(amount),
            chainId: state.currentChain.chainId,
          });

          console.log('Transazione inviata, in attesa di conferma...');
          await tx.wait();
          console.log('Transazione confermata');

          // Salvataggio transazione
          console.log('Salvataggio dati transazione...');
          const tipNode = gun.get(DAPP_NAME).get('tips');
          await new Promise((resolve, reject) => {
            tipNode.set({
              from: user.is.pub,
              to: recipientPub,
              amount: ethers.formatEther(tx.value),
              txHash: tx.hash,
              timestamp: Date.now(),
              network: state.currentChain.name,
              isStealthPayment: true,
              stealthAddress: stealthInfo.stealthAddress,
              ephemeralPublicKey: stealthInfo.ephemeralPublicKey,
              viewingPublicKey: stealthInfo.viewingPublicKey,
              spendingPublicKey: stealthInfo.spendingPublicKey,
            }, ack => {
              if(ack.err) reject(new Error(ack.err));
              else resolve();
            });
          });

          return tx;
        } catch (error) {
          console.error('Errore in modalità stealth:', error);
          console.error('Stack trace:', error.stack);
          throw error;
        }
      } else {
        const tx = await signer.sendTransaction({
          to: recipientAddress,
          value: ethers.parseEther(amount),
          chainId: state.currentChain.chainId,
        });

        await tx.wait();

        // Salvataggio transazione standard
        const tipNode = gun.get(DAPP_NAME).get('tips');
        await new Promise((resolve, reject) => {
          tipNode.set({
            from: user.is.pub,
            to: recipientPub,
            amount: ethers.formatEther(tx.value),
            txHash: tx.hash,
            timestamp: Date.now(),
            network: state.currentChain.name,
          }, ack => {
            if(ack.err) reject(new Error(ack.err));
            else resolve();
          });
        });

        return tx;
      }
    } catch (error) {
      console.error('Error sending tip:', error);
      throw error;
    }
  },

  /**
   * Recupera i pagamenti stealth ricevuti
   * @returns {Promise<Array>} Lista dei pagamenti stealth
   */
  retrieveStealthPayments: async () => {
    try {
      const state = getUserChainState();
      if (!state) throw new Error('User not authenticated');

      const currentWallet = await walletService.getCurrentWallet();

      let gunWallet = localStorage.getItem(`gunWallet_${user.is.pub}`);
      if (!gunWallet) {
        const privateKey = user._.sea.priv;
        gunWallet = await gun.gunToEthAccount(privateKey);
        localStorage.setItem(
          `gunWallet_${user.is.pub}`,
          JSON.stringify(gunWallet)
        );
      }

      const signature = await gun.createSignature('Access GunDB with Ethereum');

      const announcements = await gun.getStealthPayments(signature, {
        source: 'onChain',
      });

      const recoveredPayments = [];

      for (const announcement of announcements) {
        try {
          const recoveredWallet = await gun.recoverStealthFunds(
            announcement.stealthAddress,
            announcement.senderPublicKey,
            signature,
            announcement.spendingPublicKey
          );

          const balance = await state.provider.getBalance(
            announcement.stealthAddress
          );

          if (balance > 0) {
            recoveredPayments.push({
              stealthAddress: announcement.stealthAddress,
              recoveredAddress: recoveredWallet.address,
              balance: formatEther(balance),
              timestamp: announcement.timestamp,
              wallet: recoveredWallet,
              chain: state.currentChain,
            });
          }
        } catch (error) {
          console.log(
            `Announcement not intended for current user: ${announcement.stealthAddress}`
          );
        }
      }

      return recoveredPayments;
    } catch (error) {
      console.error('Error retrieving stealth payments:', error);
      throw error;
    }
  },

  /**
   * Invia una transazione a un indirizzo specifico
   * @param {string} toAddress - Indirizzo ETH del destinatario
   * @param {string} amount - Importo in ETH
   */
  sendTransaction: async (toAddress, amount) => {
    try {
      const state = getUserChainState();
      if (!state) throw new Error('User not authenticated');

      const senderWallet = await walletService.getCurrentWallet();
      console.log('Sender wallet:', senderWallet);

      let signer;

      if (senderWallet.type === 'metamask') {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [
              { chainId: `0x${state.currentChain.chainId.toString(16)}` },
            ],
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: `0x${state.currentChain.chainId.toString(16)}`,
                  chainName: state.currentChain.name,
                  nativeCurrency: state.currentChain.nativeCurrency,
                  rpcUrls: [state.currentChain.rpcUrl],
                  blockExplorerUrls: [state.currentChain.blockExplorer],
                },
              ],
            });
          } else {
            throw switchError;
          }
        }

        const metamaskProvider = new ethers.JsonRpcProvider(window.ethereum);
        signer = await metamaskProvider.getSigner();
      } else {
        signer = new ethers.Wallet(senderWallet.privateKey).connect(
          state.provider
        );
      }

      const tx = await signer.sendTransaction({
        to: toAddress,
        value: ethers.parseEther(amount),
        chainId: state.currentChain.chainId,
      });

      console.log('Transaction sent:', tx);

      await tx.wait();

      await gun
        .get(DAPP_NAME)
        .get('transactions')
        .set({
          from: user.is.pub,
          to: toAddress,
          amount: ethers.formatEther(tx.value),
          txHash: tx.hash,
          timestamp: Date.now(),
          network: state.currentChain.name,
          type: 'custom',
        });

      return tx;
    } catch (error) {
      console.error('Error sending transaction:', error);
      throw error;
    }
  },

  // Aggiungi questa nuova funzione per pulire il wallet quando l'utente si disconnette
  clearWallet: () => {
    const userPub = user?.is?.pub;
    if (userPub) {
      localStorage.removeItem(`gunWallet_${userPub}`);
      localStorage.removeItem(`chainState_${userPub}`);
    }
  },
};

// Utility function for switching to Optimism Sepolia
export async function switchToOptimismSepolia() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [
        {
          chainId: `0x${SUPPORTED_CHAINS.OPTIMISM_SEPOLIA.chainId.toString(
            16
          )}`,
        },
      ],
    });
  } catch (switchError) {
    if (switchError.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: `0x${SUPPORTED_CHAINS.OPTIMISM_SEPOLIA.chainId.toString(
              16
            )}`,
            chainName: SUPPORTED_CHAINS.OPTIMISM_SEPOLIA.name,
            nativeCurrency: SUPPORTED_CHAINS.OPTIMISM_SEPOLIA.nativeCurrency,
            rpcUrls: [SUPPORTED_CHAINS.OPTIMISM_SEPOLIA.rpcUrl],
            blockExplorerUrls: [
              SUPPORTED_CHAINS.OPTIMISM_SEPOLIA.blockExplorer,
            ],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}
