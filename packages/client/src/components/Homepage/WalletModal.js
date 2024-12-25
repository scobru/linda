import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { ethers } from "ethers";
import { walletService } from "linda-protocol";
import { gun, user, DAPP_NAME } from "linda-protocol";

const WalletModal = ({ isOpen, onClose, onSend, selectedUser }) => {
  const [amount, setAmount] = useState("");
  const [customAddress, setCustomAddress] = useState("");
  const [sendType, setSendType] = useState("contact");
  const [isLoading, setIsLoading] = useState(false);
  const [myWalletInfo, setMyWalletInfo] = useState(null);
  const [recipientWalletInfo, setRecipientWalletInfo] = useState(null);
  const [balance, setBalance] = useState(null);
  const [selectedChain, setSelectedChain] = useState(null);
  const [availableChains, setAvailableChains] = useState({});
  const [isStealthMode, setIsStealthMode] = useState(false);
  const [recipientName, setRecipientName] = useState("");

  // Carica il nome del destinatario
  useEffect(() => {
    const loadRecipientName = async () => {
      if (!selectedUser?.pub) return;

      try {
        // Prima cerca nelle informazioni dell'utente
        const userInfo = await new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("userList")
            .get("users")
            .get(selectedUser.pub)
            .once((userData) => {
              resolve(userData);
            });
        });

        if (userInfo?.nickname) {
          setRecipientName(userInfo.nickname);
          return;
        }
        if (userInfo?.username) {
          setRecipientName(userInfo.username);
          return;
        }

        // Se non troviamo info nell'userList, cerca nell'account Gun
        const userData = await new Promise((resolve) => {
          gun.get(`~${selectedUser.pub}`).once((data) => {
            resolve(data);
          });
        });

        if (userData?.alias) {
          setRecipientName(userData.alias.split(".")[0]);
          return;
        }

        // Fallback alla chiave pubblica abbreviata
        setRecipientName(
          `${selectedUser.pub.slice(0, 6)}...${selectedUser.pub.slice(-4)}`
        );
      } catch (error) {
        console.warn("Errore nel recupero del nome destinatario:", error);
        setRecipientName(
          `${selectedUser.pub.slice(0, 6)}...${selectedUser.pub.slice(-4)}`
        );
      }
    };

    if (isOpen && selectedUser?.pub) {
      loadRecipientName();
    }
  }, [isOpen, selectedUser?.pub]);

  // Carica le informazioni delle chain disponibili
  useEffect(() => {
    const loadChainInfo = async () => {
      try {
        const chains = walletService.getSupportedChains();
        if (!chains || Object.keys(chains).length === 0) {
          throw new Error("Nessuna chain disponibile");
        }
        setAvailableChains(chains);
        const currentChain = walletService.getCurrentChain();
        if (!currentChain) {
          throw new Error("Impossibile ottenere la chain corrente");
        }
        setSelectedChain(currentChain);
      } catch (error) {
        console.error("Errore caricamento chain:", error);
        toast.error("Errore nel caricamento delle chain");
        onClose();
      }
    };

    if (isOpen) {
      loadChainInfo();
    }
  }, [isOpen, onClose]);

  // Carica le informazioni del wallet quando cambia la chain
  useEffect(() => {
    const loadWalletInfo = async () => {
      if (!selectedChain || !isOpen) return;

      try {
        // Carica il wallet per la chain corrente
        const wallet = await walletService.getCurrentWallet(user.is.pub);
        if (!wallet) {
          throw new Error("Impossibile ottenere il wallet");
        }
        setMyWalletInfo(wallet);

        if (wallet?.hasValidAddress && wallet.internalWalletAddress) {
          try {
            const provider = new ethers.JsonRpcProvider(selectedChain.rpcUrl);
            const balance = await provider.getBalance(
              wallet.internalWalletAddress
            );
            setBalance(ethers.formatEther(balance));
          } catch (error) {
            console.error("Errore caricamento balance:", error);
            setBalance("0.0");
          }
        } else {
          setBalance("0.0");
        }

        // Carica info destinatario se disponibile
        if (selectedUser?.pub) {
          try {
            const recipientAddress = await walletService.getUserWalletAddress(
              selectedUser.pub
            );
            if (recipientAddress) {
              setRecipientWalletInfo({
                address: recipientAddress,
                type: "derived",
              });
            } else {
              throw new Error("Indirizzo destinatario non trovato");
            }
          } catch (error) {
            console.error("Errore caricamento info destinatario:", error);
            toast.error(
              "Errore nel caricamento delle informazioni del destinatario"
            );
          }
        }
      } catch (error) {
        console.error("Errore caricamento wallet:", error);
        toast.error("Errore nel caricamento del wallet");
        onClose();
      }
    };

    loadWalletInfo();
  }, [isOpen, selectedChain, selectedUser?.pub, onClose]);

  const handleChainChange = async (chainKey) => {
    try {
      setIsLoading(true);
      await walletService.setChain(chainKey);
      const newChain = walletService.getCurrentChain();
      if (!newChain) {
        throw new Error("Impossibile cambiare chain");
      }
      setSelectedChain(newChain);
      // Aggiorna il selettore
      const select = document.querySelector("select");
      if (select) {
        select.value = chainKey;
      }
      toast.success(`Chain cambiata: ${newChain.name}`);
    } catch (error) {
      console.error("Errore cambio chain:", error);
      toast.error("Errore nel cambio della chain");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Inserisci un importo valido");
      return;
    }

    try {
      setIsLoading(true);

      if (!selectedChain) {
        throw new Error("Seleziona prima una chain");
      }

      if (sendType === "contact") {
        if (!selectedUser?.pub) {
          throw new Error("Destinatario non valido");
        }
        await onSend(selectedUser.pub, amount, isStealthMode);
      } else {
        if (!ethers.isAddress(customAddress)) {
          throw new Error("Indirizzo non valido");
        }
        await walletService.sendTransaction(customAddress, amount);
      }

      toast.success("Transazione inviata con successo!");
      onClose();
      setAmount("");
      setCustomAddress("");
      setIsStealthMode(false);
    } catch (error) {
      console.error("Errore invio transazione:", error);
      toast.error(error.message || "Errore durante la transazione");
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

        {/* Selezione Chain */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Seleziona Chain
          </label>
          <select
            value={selectedChain?.key || ""}
            onChange={(e) => handleChainChange(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          >
            <option value="">Seleziona una chain</option>
            {Object.keys(availableChains).map((chainKey) => (
              <option key={chainKey} value={chainKey}>
                {availableChains[chainKey].name}
              </option>
            ))}
          </select>
        </div>

        {/* Info Wallet */}
        {myWalletInfo ? (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Il tuo Wallet
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
                <span className="text-xs text-gray-500">Saldo:</span>
                <span className="text-xs font-medium">
                  {balance
                    ? `${Number(balance).toFixed(8)} ${
                        selectedChain?.nativeCurrency?.symbol || "MATIC"
                      }`
                    : "Caricamento..."}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg flex justify-center">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        )}

        {/* Sezione invio */}
        <div className="mt-6">
          <h4 className="text-lg font-medium mb-4">
            Invia {selectedChain?.symbol}
          </h4>

          <div className="space-y-4">
            {/* Tipo di invio */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invia a
              </label>
              <div className="flex space-x-2">
                <button
                  onClick={() => setSendType("contact")}
                  className={`flex-1 py-2 px-4 rounded-lg ${
                    sendType === "contact"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  Contatto
                </button>
                <button
                  onClick={() => setSendType("address")}
                  className={`flex-1 py-2 px-4 rounded-lg ${
                    sendType === "address"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  Indirizzo
                </button>
              </div>
            </div>

            {/* Info destinatario */}
            {sendType === "contact" ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Destinatario
                </label>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="font-medium">{recipientName}</div>
                  {recipientWalletInfo?.address && (
                    <div className="text-sm text-gray-500 truncate">
                      {recipientWalletInfo.address}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Indirizzo Destinatario
                </label>
                <input
                  type="text"
                  value={customAddress}
                  onChange={(e) => setCustomAddress(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Inserisci indirizzo wallet..."
                />
              </div>
            )}

            {/* Importo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Importo
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg pr-16"
                  placeholder="0.0"
                />
                <span className="absolute right-3 top-2 text-gray-500">
                  {selectedChain?.symbol}
                </span>
              </div>
            </div>

            {/* Modalità stealth */}
            {sendType === "contact" && (
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={isStealthMode}
                  onChange={(e) => setIsStealthMode(e.target.checked)}
                  className="mr-2"
                />
                <label className="text-sm text-gray-700">
                  Modalità stealth
                </label>
              </div>
            )}

            {/* Pulsante invio */}
            <button
              onClick={handleSend}
              disabled={
                isLoading ||
                !amount ||
                (sendType === "address" && !customAddress) ||
                (sendType === "contact" && !recipientWalletInfo?.address)
              }
              className={`w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 
                ${
                  isLoading ||
                  !amount ||
                  (sendType === "address" && !customAddress) ||
                  (sendType === "contact" && !recipientWalletInfo?.address)
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }`}
            >
              {isLoading ? "Invio in corso..." : "Invia"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalletModal;
