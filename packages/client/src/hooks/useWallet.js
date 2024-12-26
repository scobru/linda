import { useCallback, useEffect } from "react";
import { useAppState } from "../context/AppContext";
import { walletService } from "linda-protocol";
import { user } from "linda-protocol";
import { ethers } from "ethers";
import { toast } from "react-hot-toast";

export const useWallet = () => {
  const { appState, updateAppState } = useAppState();

  // Effetto per caricare le informazioni del wallet
  useEffect(() => {
    if (!user?.is?.pub) return;

    const loadWalletInfo = async () => {
      try {
        const currentChain = walletService.getCurrentChain();
        if (!currentChain) {
          throw new Error("Chain non disponibile");
        }

        const wallet = await walletService.getCurrentWallet(user.is.pub);
        if (!wallet) {
          throw new Error("Wallet non disponibile");
        }

        updateAppState({ walletInfo: wallet });

        if (wallet?.hasValidAddress && wallet.internalWalletAddress) {
          try {
            const provider = new ethers.JsonRpcProvider(currentChain.rpcUrl);
            const balance = await provider.getBalance(
              wallet.internalWalletAddress
            );
            updateAppState((prev) => ({
              walletInfo: {
                ...prev.walletInfo,
                balance: ethers.formatEther(balance),
              },
            }));
          } catch (error) {
            console.error("Errore caricamento balance:", error);
          }
        }
      } catch (error) {
        console.error("Errore caricamento wallet:", error);
        toast.error("Errore nel caricamento del wallet");
      }
    };

    loadWalletInfo();
  }, [updateAppState]);

  const sendTransaction = useCallback(
    async (to, amount, isStealthMode = false) => {
      try {
        if (!user?.is?.pub) {
          throw new Error("Utente non autenticato");
        }

        if (isStealthMode) {
          await walletService.sendStealthTransaction(to, amount);
        } else {
          await walletService.sendTransaction(to, amount);
        }

        toast.success("Transazione inviata con successo!");
      } catch (error) {
        console.error("Errore invio transazione:", error);
        toast.error(error.message || "Errore durante la transazione");
        throw error;
      }
    },
    []
  );

  const changeChain = useCallback(async (chainKey) => {
    try {
      await walletService.setChain(chainKey);
      const newChain = walletService.getCurrentChain();
      if (!newChain) {
        throw new Error("Impossibile cambiare chain");
      }
      toast.success(`Chain cambiata: ${newChain.name}`);
    } catch (error) {
      console.error("Errore cambio chain:", error);
      toast.error("Errore nel cambio della chain");
      throw error;
    }
  }, []);

  return {
    walletInfo: appState.walletInfo,
    sendTransaction,
    changeChain,
    currentChain: walletService.getCurrentChain(),
    supportedChains: walletService.getSupportedChains(),
  };
};
