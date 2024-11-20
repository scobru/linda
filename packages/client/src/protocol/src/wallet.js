import { gun, user, DAPP_NAME } from './useGun.js';
import { 
  Wallet, 
  JsonRpcProvider,
  parseEther,
  formatEther,
  HDNodeWallet,
  sha256
} from 'ethers';

// Configurazione Optimism Sepolia
const OPTIMISM_SEPOLIA_RPC = "https://spring-serene-snow.optimism-sepolia.quiknode.pro/d02b30b94d9d8e89cee0b2a694d5e1a5c6d87d9f";
const OPTIMISM_SEPOLIA_CHAIN_ID = 11155420;

// Crea una singola istanza del provider
const provider = new JsonRpcProvider(OPTIMISM_SEPOLIA_RPC);

export const walletService = {
  /**
   * Ottiene il wallet dell'utente corrente
   * @returns {Promise<{address: string, type: string}>}
   */
  getCurrentWallet: async () => {
    console.log('Getting current wallet...');
    try {
      // Se l'utente è autenticato con MetaMask
      const walletAuth = localStorage.getItem('walletAuth');
      if (walletAuth) {
        const { address } = JSON.parse(walletAuth);
        return { address, type: 'metamask' };
      }

      // Se l'utente è autenticato con GUN
      if (user?.is) {
        const privateKey = user._.sea.priv;
        const derivedWallet = await gun.gunToEthAccount(privateKey);
        console.log('Derived wallet:', derivedWallet);
        return { 
          address: derivedWallet.account.address,
          type: 'derived',
          privateKey: derivedWallet.privateKey
        };
      } else if (localStorage.getItem('gunWallet')) {
        const gunWallet = JSON.parse(localStorage.getItem('gunWallet'));

        return {
          address: gunWallet.account.address,
          privateKey: gunWallet.privateKey,
          type: 'derived'
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
      // Prima cerca nei dati utente
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
        // Timeout dopo 2 secondi
        setTimeout(() => resolve(null), 2000);
      });

      console.log('Found user data:', userData);

      if (userData?.address) {
        return userData.address;
      }

      // Se non trovato, prova a recuperare dal profilo utente
      const userProfile = await gun.user(userPub).get(DAPP_NAME).get('profile').then();
      console.log('Found user profile:', userProfile);

      if (userProfile?.address) {
        return userProfile.address;
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
  sendTip: async (recipientPub, amount) => {
    try {
      console.log('Sending tip to:', recipientPub, 'amount:', amount);

      // Ottieni l'indirizzo del destinatario
      const recipientAddress = await walletService.getUserWalletAddress(recipientPub);
      console.log('Recipient address:', recipientAddress);

      if (!recipientAddress) {
        throw new Error('Indirizzo destinatario non trovato');
      }

      // Ottieni il wallet del mittente
      const senderWallet = await walletService.getCurrentWallet();
      console.log('Sender wallet:', senderWallet);

      let signer;

      if (senderWallet.type === 'metamask') {
        // Per MetaMask, richiedi lo switch della rete
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${OPTIMISM_SEPOLIA_CHAIN_ID.toString(16)}` }],
          });
        } catch (switchError) {
          // Se la rete non è configurata, aggiungila
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: `0x${OPTIMISM_SEPOLIA_CHAIN_ID.toString(16)}`,
                chainName: 'Optimism Sepolia',
                nativeCurrency: {
                  name: 'ETH',
                  symbol: 'ETH',
                  decimals: 18
                },
                rpcUrls: [OPTIMISM_SEPOLIA_RPC],
                blockExplorerUrls: ['https://sepolia-optimism.etherscan.io/']
              }],
            });
          } else {
            throw switchError;
          }
        }
        
        // Per MetaMask, usa window.ethereum direttamente
        //const metamaskProvider = new JsonRpcProvider("https://sepolia.optimism.io");
        signer = await gun.getSigner
      } else {
        // Per wallet derivati usa la chiave privata
        signer = new Wallet(senderWallet.privateKey).connect(provider);
      }

      console.log('Preparing transaction...');

      // Invia la transazione
      const tx = await signer.sendTransaction({
        to: recipientAddress,
        value: parseEther(amount),
        chainId: OPTIMISM_SEPOLIA_CHAIN_ID
      });

      console.log('Transaction sent:', tx);

      // Attendi la conferma della transazione
      await tx.wait();

      // Salva la transazione nel database
      await gun.get(DAPP_NAME)
        .get('tips')
        .set({
          from: user.is.pub,
          to: recipientPub,
          amount: formatEther(tx.value),
          txHash: tx.hash,
          timestamp: Date.now(),
          network: 'optimism-sepolia'
        });

      return tx;
    } catch (error) {
      console.error('Error sending tip:', error);
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
      // Ottieni il wallet del mittente
      const senderWallet = await walletService.getCurrentWallet();
      console.log('Sender wallet:', senderWallet);

      let signer;

      if (senderWallet.type === 'metamask') {
        // Per MetaMask, richiedi lo switch della rete
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${OPTIMISM_SEPOLIA_CHAIN_ID.toString(16)}` }],
          });
        } catch (switchError) {
          // Gestione errore switch rete...
        }
        
        // Per MetaMask, usa window.ethereum direttamente
        const metamaskProvider = new JsonRpcProvider(window.ethereum);
        signer = await metamaskProvider.getSigner();
      } else {
        // Per wallet derivati usa la chiave privata
        signer = new Wallet(senderWallet.privateKey).connect(provider);
      }

      // Invia la transazione
      const tx = await signer.sendTransaction({
        to: toAddress,
        value: parseEther(amount),
        chainId: OPTIMISM_SEPOLIA_CHAIN_ID
      });

      console.log('Transaction sent:', tx);

      // Attendi la conferma
      await tx.wait();

      // Salva la transazione nel database
      await gun.get(DAPP_NAME)
        .get('transactions')
        .set({
          from: user.is.pub,
          to: toAddress,
          amount: formatEther(tx.value),
          txHash: tx.hash,
          timestamp: Date.now(),
          network: 'optimism-sepolia',
          type: 'custom'
        });

      return tx;
    } catch (error) {
      console.error('Error sending transaction:', error);
      throw error;
    }
  }
};