import { gun, user, DAPP_NAME } from './useGun.js';
import { ethers } from 'ethers';

// Estendi Gun con funzionalità GunEth
Object.assign(Gun.chain);

// Chain configurations
const SUPPORTED_CHAINS = {
  OPTIMISM_SEPOLIA: {
    name: 'Optimism Sepolia',
    chainId: 11155420,
    rpcUrl: "https://spring-serene-snow.optimism-sepolia.quiknode.pro/d02b30b94d9d8e89cee0b2a694d5e1a5c6d87d9f",
    blockExplorer: 'https://sepolia-optimism.etherscan.io/',
    nativeCurrency: {
      name: 'ETH',
      symbol: 'ETH',
      decimals: 18
    }
  },
  POLYGON_MAINNET: {
    name: 'Polygon',
    chainId: 137,
    rpcUrl: "https://polygon-mainnet.g.alchemy.com/v2/yjhjIoJ3o_at8ALT7nCJtFtjdqFpiBdx",
    blockExplorer: 'https://polygonscan.com/',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18
    }
  }
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
      provider: new ethers.JsonRpcProvider(SUPPORTED_CHAINS[state.chainKey].rpcUrl)
    };
  }
  
  // Se non esiste, crea un nuovo stato
  const initialState = {
    currentChain: SUPPORTED_CHAINS.OPTIMISM_SEPOLIA,
    provider: new ethers.JsonRpcProvider(SUPPORTED_CHAINS.OPTIMISM_SEPOLIA.rpcUrl)
  };
  
  // Salva lo stato iniziale
  localStorage.setItem(`chainState_${userPub}`, JSON.stringify({
    chainKey: 'OPTIMISM_SEPOLIA'
  }));
  
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
    localStorage.setItem(`chainState_${userPub}`, JSON.stringify({
      chainKey: chainKey
    }));
    
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
          chain: state.currentChain
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
          chain: state.currentChain
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
        gun.get(DAPP_NAME)
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

      const userProfile = await gun.user(userPub).get(DAPP_NAME).get('profile').then();
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
      console.log('Sending tip to:', recipientPub, 'amount:', amount, 'stealth mode:', isStealthMode);

      const state = getUserChainState();
      if (!state) throw new Error('User not authenticated');

      const senderWallet = await walletService.getCurrentWallet();
      const signer = new ethers.Wallet(senderWallet.privateKey).connect(state.provider);

      const recipientAddress = await walletService.getUserWalletAddress(recipientPub);

      if (isStealthMode) {
        // Registra sia il mittente che il destinatario nel sistema stealth
        try {
          console.log('Registrazione mittente:', senderWallet.address);
          await gun.registerStealthUser(senderWallet.address);
          
          console.log('Registrazione destinatario:', recipientAddress);
          await gun.registerStealthUser(recipientAddress);
        } catch (error) {
          console.log('Errore o utenti già registrati:', error);
        }

        // Aspetta un momento per assicurarsi che la registrazione sia completata
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Per il wallet interno, usa direttamente la chiave privata per la firma
        let signature;
        if (senderWallet.type === 'derived') {
          // Crea la firma usando la chiave privata del wallet
          const message = "Access GunDB with Ethereum";
          const messageBytes = ethers.toUtf8Bytes(message);
          signature = await signer.signMessage(messageBytes);
        } else {
          // Per altri tipi di wallet (es. MetaMask) chiedi la firma
          signature = await gun.createSignature("Access GunDB with Ethereum");
        }

        console.log('Firma generata:', signature);
        
        // Genera l'indirizzo stealth
        console.log('Generazione indirizzo stealth per:', recipientAddress, 'da:', senderWallet.address);
        const stealthInfo = await gun.generateStealthAddress(recipientAddress, senderWallet.address, signature);
        console.log('Stealth info generata:', stealthInfo);
        
        // Annuncia il pagamento stealth
        console.log('Annuncio pagamento stealth...');
        await gun.announceStealthPayment(
          stealthInfo.stealthAddress,
          stealthInfo.senderPublicKey,
          stealthInfo.spendingPublicKey,
          signature,
          { onChain: true }
        );

        console.log('Invio transazione stealth a:', stealthInfo.stealthAddress);
        const tx = await signer.sendTransaction({
          to: stealthInfo.stealthAddress,
          value: ethers.parseEther(amount),
          chainId: state.currentChain.chainId
        });

        await tx.wait();
        console.log('Transazione stealth completata:', tx.hash);

        // Salva il pagamento nel database
        gun.get(DAPP_NAME)
          .get('tips')
          .set({
            from: user.is.pub,
            to: recipientPub,
            amount: ethers.formatEther(tx.value),
            txHash: tx.hash,
            timestamp: Date.now(),
            network: state.currentChain.name,
            isStealthPayment: true,
            stealthAddress: stealthInfo.stealthAddress,
            senderPublicKey: stealthInfo.senderPublicKey,
            spendingPublicKey: stealthInfo.spendingPublicKey
          });

        return tx;
      } else {
        const tx = await signer.sendTransaction({
          to: recipientAddress,
          value: ethers.parseEther(amount),
          chainId: state.currentChain.chainId
        });

        await tx.wait();

        gun.get(DAPP_NAME)
          .get('tips')
          .set({
            from: user.is.pub,
            to: recipientPub,
            amount: ethers.formatEther(tx.value),
            txHash: tx.hash,
            timestamp: Date.now(),
            network: state.currentChain.name
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
        localStorage.setItem(`gunWallet_${user.is.pub}`, JSON.stringify(gunWallet));
      }

      const signature = await gun.createSignature("Access GunDB with Ethereum");

      const announcements = await gun.getStealthPayments(signature, { source: 'onChain' });

      const recoveredPayments = [];

      for (const announcement of announcements) {
        try {
          const recoveredWallet = await gun.recoverStealthFunds(
            announcement.stealthAddress,
            announcement.senderPublicKey,
            signature,
            announcement.spendingPublicKey
          );

          const balance = await state.provider.getBalance(announcement.stealthAddress);
          
          if (balance > 0) {
            recoveredPayments.push({
              stealthAddress: announcement.stealthAddress,
              recoveredAddress: recoveredWallet.address,
              balance: formatEther(balance),
              timestamp: announcement.timestamp,
              wallet: recoveredWallet,
              chain: state.currentChain
            });
          }
        } catch (error) {
          console.log(`Announcement not intended for current user: ${announcement.stealthAddress}`);
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
            params: [{ chainId: `0x${state.currentChain.chainId.toString(16)}` }],
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: `0x${state.currentChain.chainId.toString(16)}`,
                chainName: state.currentChain.name,
                nativeCurrency: state.currentChain.nativeCurrency,
                rpcUrls: [state.currentChain.rpcUrl],
                blockExplorerUrls: [state.currentChain.blockExplorer]
              }],
            });
          } else {
            throw switchError;
          }
        }
        
        const metamaskProvider = new ethers.JsonRpcProvider(window.ethereum);
        signer = await metamaskProvider.getSigner();
      } else {
        signer = new ethers.Wallet(senderWallet.privateKey).connect(state.provider);
      }

      const tx = await signer.sendTransaction({
        to: toAddress,
        value: ethers.parseEther(amount),
        chainId: state.currentChain.chainId
      });

      console.log('Transaction sent:', tx);

      await tx.wait();

      await gun.get(DAPP_NAME)
        .get('transactions')
        .set({
          from: user.is.pub,
          to: toAddress,
          amount: ethers.formatEther(tx.value),
          txHash: tx.hash,
          timestamp: Date.now(),
          network: state.currentChain.name,
          type: 'custom'
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
  }
};

// Utility function for switching to Optimism Sepolia
export async function switchToOptimismSepolia() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${SUPPORTED_CHAINS.OPTIMISM_SEPOLIA.chainId.toString(16)}` }],
    });
  } catch (switchError) {
    if (switchError.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: `0x${SUPPORTED_CHAINS.OPTIMISM_SEPOLIA.chainId.toString(16)}`,
          chainName: SUPPORTED_CHAINS.OPTIMISM_SEPOLIA.name,
          nativeCurrency: SUPPORTED_CHAINS.OPTIMISM_SEPOLIA.nativeCurrency,
          rpcUrls: [SUPPORTED_CHAINS.OPTIMISM_SEPOLIA.rpcUrl],
          blockExplorerUrls: [SUPPORTED_CHAINS.OPTIMISM_SEPOLIA.blockExplorer]
        }],
      });
    } else {
      throw switchError;
    }
  }
}