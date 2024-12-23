import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { walletService } from "linda-protocol";
import { gun, user } from "linda-protocol";
import { ethers } from "ethers";
import { formatEther } from "ethers";

const GlobalWalletModal = ({ isOpen, onClose }) => {
  const [myWalletInfo, setMyWalletInfo] = useState(null);
  const [balance, setBalance] = useState(null);
  const [selectedChain, setSelectedChain] = useState(null);
  const [availableChains, setAvailableChains] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [amount, setAmount] = useState("");
  const [customAddress, setCustomAddress] = useState("");

  // Carica le informazioni delle chain disponibili
  useEffect(() => {
    const loadChainInfo = async () => {
      try {
        const chains = walletService.getSupportedChains();
        setAvailableChains(chains);
        const currentChain = walletService.getCurrentChain();
        setSelectedChain(currentChain);
      } catch (error) {
        console.error("Error loading chain info:", error);
        toast.error("Errore nel caricamento delle informazioni della chain");
      }
    };

    if (isOpen) {
      loadChainInfo();
    }
  }, [isOpen]);

  // Carica le informazioni del wallet quando cambia la chain
  useEffect(() => {
    const loadWalletInfo = async () => {
      try {
        if (!selectedChain) return;

        const wallet = await walletService.getCurrentWallet(user.is.pub);
        setMyWalletInfo(wallet);

        if (wallet?.hasValidAddress && wallet.internalWalletAddress) {
          try {
            const provider = new ethers.JsonRpcProvider(selectedChain.rpcUrl);
            const balance = await provider.getBalance(
              wallet.internalWalletAddress
            );
            setBalance(formatEther(balance));
          } catch (error) {
            console.error("Error loading balance:", error);
            setBalance("0.0");
          }
        } else {
          console.log("Wallet senza indirizzo valido:", wallet);
          setBalance("0.0");
        }
      } catch (error) {
        console.error("Error loading wallet info:", error);
        toast.error("Errore nel caricamento delle informazioni del wallet");
      }
    };

    if (isOpen && selectedChain && user.is?.pub) {
      loadWalletInfo();
    }
  }, [isOpen, selectedChain, user.is?.pub]);

  // Gestisce il cambio della chain
  const handleChainChange = async (chainKey) => {
    try {
      setIsLoading(true);
      await walletService.setChain(chainKey);
      const newChain = walletService.getCurrentChain();
      setSelectedChain(newChain);

      const wallet = await walletService.getCurrentWallet(user.is.pub);
      setMyWalletInfo(wallet);

      if (wallet?.hasValidAddress && wallet.internalWalletAddress) {
        try {
          const provider = new ethers.JsonRpcProvider(newChain.rpcUrl);
          const balance = await provider.getBalance(
            wallet.internalWalletAddress
          );
          setBalance(formatEther(balance));
        } catch (error) {
          console.error("Error loading balance:", error);
          setBalance("0.0");
        }
      } else {
        console.log("Wallet senza indirizzo valido:", wallet);
        setBalance("0.0");
      }

      toast.success(`Chain cambiata a ${newChain.name}`);
    } catch (error) {
      console.error("Error changing chain:", error);
      toast.error("Errore nel cambio della chain");
    } finally {
      setIsLoading(false);
    }
  };

  // Gestisce l'invio di una transazione
  const handleSend = async () => {
    try {
      setIsLoading(true);

      if (!selectedChain) {
        throw new Error("Seleziona prima una chain");
      }

      if (!customAddress || !amount) {
        throw new Error("Inserisci un indirizzo e un importo validi");
      }

      await walletService.sendTransaction(customAddress, amount);

      toast.success("Transazione inviata con successo!");
      setAmount("");
      setCustomAddress("");
    } catch (error) {
      console.error("Error sending transaction:", error);
      toast.error(error.message || "Errore durante l'invio");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 max-w-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Wallet</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Chain Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Seleziona Chain
          </label>
          <select
            value={selectedChain?.name || ""}
            onChange={(e) => handleChainChange(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={isLoading}
          >
            {Object.keys(availableChains).map((chainKey) => (
              <option key={chainKey} value={chainKey}>
                {availableChains[chainKey].name}
              </option>
            ))}
          </select>
        </div>

        {/* Wallet Info */}
        {myWalletInfo ? (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Il mio wallet
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Indirizzo:</span>
                <div className="flex items-center">
                  <span className="text-xs font-mono mr-2">
                    {myWalletInfo.internalWalletAddress
                      ? `${myWalletInfo.internalWalletAddress.slice(
                          0,
                          6
                        )}...${myWalletInfo.internalWalletAddress.slice(-4)}`
                      : "Caricamento..."}
                  </span>
                  <button
                    onClick={() => {
                      if (myWalletInfo.internalWalletAddress) {
                        navigator.clipboard.writeText(
                          myWalletInfo.internalWalletAddress
                        );
                        toast.success("Indirizzo copiato!");
                      }
                    }}
                    className="p-1 hover:bg-gray-200 rounded"
                    disabled={!myWalletInfo.internalWalletAddress}
                  >
                    <svg
                      className="w-4 h-4 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Balance:</span>
                <span className="text-xs font-medium">
                  {balance
                    ? `${Number(balance).toFixed(8)} ${
                        selectedChain?.nativeCurrency?.symbol || "MATIC"
                      }`
                    : "Caricamento..."}
                </span>
              </div>

              {myWalletInfo.internalWalletPk && (
                <div className="mt-2">
                  <button
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                    className="text-xs text-blue-500 hover:text-blue-600"
                  >
                    {showPrivateKey ? "Nascondi" : "Mostra"} chiave privata
                  </button>
                  {showPrivateKey && (
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs font-mono truncate max-w-[180px]">
                        {myWalletInfo.internalWalletPk}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            myWalletInfo.internalWalletPk
                          );
                          toast.success("Chiave privata copiata!");
                        }}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        <svg
                          className="w-4 h-4 text-gray-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                          />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg flex justify-center">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        )}

        {/* Invio fondi */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Indirizzo POL
          </label>
          <input
            type="text"
            value={customAddress}
            onChange={(e) => setCustomAddress(e.target.value)}
            placeholder="0x..."
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4"
          />

          <label className="block text-sm font-medium text-gray-700 mb-1">
            Importo (POL)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            step="0.0001"
            min="0"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Pulsante invio */}
        <button
          onClick={handleSend}
          disabled={isLoading || !amount || !customAddress}
          className={`w-full py-2 rounded-lg bg-blue-500 text-white transition-colors mt-4 ${
            isLoading || !amount || !customAddress
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-blue-600"
          }`}
        >
          {isLoading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2" />
              Invio in corso...
            </div>
          ) : (
            "Invia"
          )}
        </button>
      </div>
    </div>
  );
};

export default GlobalWalletModal;
