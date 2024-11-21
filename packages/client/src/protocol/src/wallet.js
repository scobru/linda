import { gun, user, DAPP_NAME } from './useGun.js';
import { 
  Wallet, 
  JsonRpcProvider,
  parseEther,
  formatEther,
  HDNodeWallet,
  sha256
} from 'ethers';




// Estendi Gun con funzionalità GunEth
Object.assign(Gun.chain);

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
      // Priorità al wallet interno (GunWallet)
      if (localStorage.getItem('gunWallet')) {
        const gunWallet = JSON.parse(localStorage.getItem('gunWallet'));
        return {
          address: gunWallet.account.address,
          privateKey: gunWallet.privateKey,
          type: 'derived'
        };
      }

      // Se non c'è il wallet interno, genera uno nuovo dalle chiavi Gun
      if (user?.is) {
        const privateKey = user._.sea.priv;
        const derivedWallet = await gun.gunToEthAccount(privateKey);
        localStorage.setItem('gunWallet', JSON.stringify(derivedWallet));
        
        return { 
          address: derivedWallet.account.address,
          type: 'derived',
          privateKey: derivedWallet.privateKey
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
  sendTip: async (recipientPub, amount, isStealthMode = false) => {
    try {
      console.log('Sending tip to:', recipientPub, 'amount:', amount, 'stealth mode:', isStealthMode);

      if (!isStealthMode) {
        // Usa il metodo di invio tip esistente
        // ... codice esistente del sendTip ...
        return;
      }

      // Usa sempre il wallet interno per i tip
      const senderWallet = await walletService.getCurrentWallet();
      const signer = new Wallet(senderWallet.privateKey).connect(provider);

      // Ottieni l'indirizzo del destinatario
      const recipientAddress = await walletService.getUserWalletAddress(recipientPub);

      // Genera indirizzo stealth per il destinatario
      const stealthInfo = await gun.generateStealthAddress(recipientAddress, signer.address);
      
      // Annuncia il pagamento stealth
      await gun.announceStealthPayment(
        stealthInfo.stealthAddress,
        signer.address,
        signer.address,
        signer.address,
        { onChain: true }
      );

      // Invia la transazione all'indirizzo stealth
      const tx = await signer.sendTransaction({
        to: stealthInfo.stealthAddress,
        value: parseEther(amount),
        chainId: OPTIMISM_SEPOLIA_CHAIN_ID
      });

      await tx.wait();

      // Salva la transazione stealth nel database
      await gun.get(DAPP_NAME)
        .get('tips')
        .set({
          from: user.is.pub,
          to: recipientPub,
          amount: formatEther(tx.value),
          txHash: tx.hash,
          timestamp: Date.now(),
          network: 'optimism-sepolia',
          isStealthPayment: true,
          stealthAddress: stealthInfo.stealthAddress
        });

      return tx;
    } catch (error) {
      console.error('Error sending stealth tip:', error);
      throw error;
    }
  },

  /**
   * Recupera i pagamenti stealth ricevuti
   * @returns {Promise<Array>} Lista dei pagamenti stealth
   */
  retrieveStealthPayments: async () => {
    try {
      // Ottieni il wallet corrente
      const currentWallet = await walletService.getCurrentWallet();
      
      // Assicurati che esista un GunWallet
      let gunWallet = localStorage.getItem('gunWallet');
      if (!gunWallet) {
        const privateKey = user._.sea.priv;
        gunWallet = await gun.gunToEthAccount(privateKey);
        localStorage.setItem('gunWallet', JSON.stringify(gunWallet));
      }

      // Genera firma per l'autenticazione
      const signature = await gun.createSignature("Access GunDB with Ethereum");

      // Recupera tutti gli annunci stealth
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

          // Verifica il saldo dell'indirizzo stealth
          const balance = await provider.getBalance(announcement.stealthAddress);
          
          if (balance > 0) {
            recoveredPayments.push({
              stealthAddress: announcement.stealthAddress,
              recoveredAddress: recoveredWallet.address,
              balance: formatEther(balance),
              timestamp: announcement.timestamp,
              wallet: recoveredWallet
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

// Utility function per switch a Optimism Sepolia
async function switchToOptimismSepolia() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${OPTIMISM_SEPOLIA_CHAIN_ID.toString(16)}` }],
    });
  } catch (switchError) {
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
}