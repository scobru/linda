import React, { useState, useEffect } from "react";
import { walletService } from "linda-protocol";
import { user, gun, DAPP_NAME } from "linda-protocol";
import { ethers } from "ethers";
import { toast } from "react-hot-toast";

const TransactionHistory = () => {
  const [transactions, setTransactions] = useState([]);
  const [stealthPayments, setStealthPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimingPayment, setClaimingPayment] = useState(null);
  const [claimError, setClaimError] = useState(null);
  const [currentChain, setCurrentChain] = useState(
    walletService.getCurrentChain()
  );
  const [deletedTransactions] = useState(() => {
    const saved = localStorage.getItem(`deletedTx_${user?.is?.pub}`);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  // Effetto per monitorare i cambiamenti della chain
  useEffect(() => {
    const handleChainChange = () => {
      const newChain = walletService.getCurrentChain();
      setCurrentChain(newChain);
      // Ricarica le transazioni quando cambia la chain
      loadTransactions();
      loadStealthPayments();
    };

    // Aggiungi listener per il cambio chain di MetaMask
    if (window.ethereum) {
      window.ethereum.on("chainChanged", handleChainChange);
    }

    return () => {
      // Rimuovi listener quando il componente viene smontato
      if (window.ethereum) {
        window.ethereum.removeListener("chainChanged", handleChainChange);
      }
    };
  }, []);

  // Effetto per caricare le transazioni iniziali
  useEffect(() => {
    if (user?.is?.pub) {
      loadTransactions();
      loadStealthPayments();
    }
  }, [user?.is?.pub, currentChain]); // Aggiungi currentChain come dipendenza

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const userPub = user?.is?.pub;
      if (!userPub) return;

      setTransactions([]); // Reset dello stato
      const processedTxs = new Set();
      const validTxs = [];

      return new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("transactions")
          .map()
          .once((tx) => {
            if (
              tx &&
              tx.to === userPub &&
              !tx.isStealthMode &&
              !deletedTransactions.has(tx.txHash) &&
              !processedTxs.has(tx.txHash)
            ) {
              processedTxs.add(tx.txHash);
              validTxs.push(tx);
            }
          });

        // Aggiorna lo stato dopo aver raccolto tutte le transazioni
        setTimeout(() => {
          // Assicurati di filtrare le transazioni per la chain corrente
          const filteredTxs = validTxs.filter(
            (tx) =>
              tx.network === currentChain.name ||
              tx.network === currentChain.nativeCurrency.symbol
          );

          setTransactions(filteredTxs);
          resolve();
        }, 1000);
      });
    } catch (error) {
      console.error("Errore nel caricamento delle transazioni:", error);
      toast.error("Errore nel caricamento delle transazioni");
    } finally {
      setLoading(false);
    }
  };

  const loadStealthPayments = async () => {
    try {
      setLoading(true);
      const userPub = user?.is?.pub;
      if (!userPub) return;

      console.log("Loading stealth payments for user:", userPub);

      const processedTxs = new Set();
      const validPayments = [];

      // Definisci processUnique
      const processUnique = async (announcement) => {
        if (
          !announcement?.txHash ||
          processedTxs.has(announcement.txHash) ||
          deletedTransactions.has(announcement.txHash)
        ) {
          return;
        }

        processedTxs.add(announcement.txHash);

        // Verifica che l'annuncio sia valido e non eliminato
        if (
          !announcement.stealthAddress ||
          !announcement.to ||
          announcement.to !== userPub ||
          announcement.deleted
        ) {
          return;
        }

        try {
          const provider = new ethers.JsonRpcProvider(
            walletService.getCurrentChain().rpcUrl,
            undefined,
            { staticNetwork: true }
          );

          const balance = await provider.getBalance(
            announcement.stealthAddress
          );
          if (balance > 0) {
            const payment = {
              originalTx: announcement.txHash,
              stealthAddress: announcement.stealthAddress,
              balance: ethers.formatEther(balance),
              timestamp: announcement.timestamp,
              network: announcement.network,
              stealthData: {
                sharedSecret: announcement.sharedSecret,
                receiverSpendingKey: announcement.receiverSpendingKey,
                senderEphemeralKey: announcement.senderEphemeralKey,
                receiverViewingKey: announcement.receiverViewingKey,
              },
              chain: walletService.getCurrentChain(),
              from: announcement.from,
            };
            validPayments.push(payment);
          }
        } catch (error) {
          console.error("Error processing payment:", error);
        }
      };

      // Funzione per processare gli annunci
      const processAnnouncements = (path) => {
        return new Promise((resolve) => {
          const announcements = [];

          path.map().once((data, key) => {
            if (data) {
              announcements.push(data);
            }
          });

          // Risolvi dopo un breve timeout per assicurarti di aver ricevuto tutti i dati
          setTimeout(async () => {
            for (const announcement of announcements) {
              await processUnique(announcement);
            }
            resolve();
          }, 1000);
        });
      };

      // Carica gli annunci da entrambi i percorsi
      await Promise.all([
        processAnnouncements(gun.get(DAPP_NAME).get("stealth-announcements")),
        processAnnouncements(
          gun.get(DAPP_NAME).get("users").get(userPub).get("stealth-received")
        ),
      ]);

      console.log("Found valid payments:", validPayments);
      // Filtra i pagamenti stealth per la chain corrente
      const filteredPayments = validPayments.filter(
        (payment) =>
          payment.network === currentChain.name ||
          payment.chain.chainId === currentChain.chainId
      );

      setStealthPayments(filteredPayments);
    } catch (error) {
      console.error("Errore nel caricamento dei pagamenti stealth:", error);
      toast.error("Errore nel caricamento dei pagamenti stealth");
    } finally {
      setLoading(false);
    }
  };

  // Modifica il processAnnouncement per gestire meglio le richieste RPC
  const processAnnouncement = async (announcement) => {
    if (!announcement) return;

    const userPub = user?.is?.pub;

    // Log dettagliato dell'annuncio per debug
    console.log("Processing announcement:", announcement);

    // Verifica che sia un annuncio stealth valido con controlli più specifici
    const requiredFields = {
      stealthAddress: announcement.stealthAddress,
      senderEphemeralKey: announcement.senderEphemeralKey,
      receiverViewingKey: announcement.receiverViewingKey,
      receiverSpendingKey: announcement.receiverSpendingKey,
      sharedSecret: announcement.sharedSecret,
      txHash: announcement.txHash,
      to: announcement.to,
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingFields.length > 0) {
      console.log("Invalid stealth announcement, missing fields:", {
        announcement,
        missingFields,
      });

      // Se l'annuncio è invalido, proviamo a rimuoverlo
      try {
        if (announcement.txHash) {
          await cleanInvalidAnnouncement(announcement.txHash);
        }
      } catch (error) {
        console.error("Error cleaning invalid announcement:", error);
      }
      return;
    }

    if (announcement.to !== userPub) {
      console.log(
        "Announcement not for current user:",
        announcement.to,
        "vs",
        userPub
      );
      return;
    }

    try {
      // Usa un provider statico con rate limiting
      const provider = new ethers.JsonRpcProvider(
        walletService.getCurrentChain().rpcUrl,
        undefined,
        {
          staticNetwork: true,
          batchMaxCount: 1, // Limita le richieste batch
          pollingInterval: 5000, // Aumenta l'intervallo di polling
          retryCount: 3,
          timeout: 10000,
        }
      );

      // Aggiungi un delay tra le richieste
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const balance = await provider.getBalance(announcement.stealthAddress);
      console.log(
        "Checking balance for stealth address:",
        announcement.stealthAddress,
        "Balance:",
        balance.toString()
      );

      if (balance > 0) {
        const payment = {
          originalTx: announcement.txHash,
          stealthAddress: announcement.stealthAddress,
          balance: ethers.formatEther(balance),
          timestamp: announcement.timestamp,
          network: announcement.network,
          stealthData: {
            sharedSecret: announcement.sharedSecret,
            receiverSpendingKey: announcement.receiverSpendingKey,
            senderEphemeralKey: announcement.senderEphemeralKey,
            receiverViewingKey: announcement.receiverViewingKey,
          },
          chain: walletService.getCurrentChain(),
          from: announcement.from,
        };

        setStealthPayments((prev) => {
          // Verifica duplicati usando txHash
          if (prev.some((p) => p.originalTx === payment.originalTx)) {
            console.log("Payment already in state:", payment.originalTx);
            return prev;
          }
          console.log("Adding new payment:", payment.originalTx);
          return [...prev, payment];
        });
      }
    } catch (error) {
      if (error.code === 429) {
        console.warn("Rate limit exceeded, retrying in 5s:", error);
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return processAnnouncement(announcement); // Riprova dopo il delay
      } else {
        console.error("Error processing stealth payment:", error);
      }
    }
  };

  // Aggiungi questa nuova funzione per pulire gli annunci invalidi
  const cleanInvalidAnnouncement = async (txHash) => {
    const userPub = user?.is?.pub;
    if (!userPub || !txHash) return;

    console.log("Cleaning invalid announcement:", txHash);

    try {
      // Rimuovi da stealth-announcements
      await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("stealth-announcements")
          .get(txHash)
          .put(null, (ack) => {
            if (ack.err) {
              console.error(
                "Error cleaning from stealth-announcements:",
                ack.err
              );
            } else {
              console.log("Cleaned from stealth-announcements");
            }
            resolve();
          });
      });

      // Rimuovi da stealth-received
      await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("users")
          .get(userPub)
          .get("stealth-received")
          .get(txHash)
          .put(null, (ack) => {
            if (ack.err) {
              console.error("Error cleaning from stealth-received:", ack.err);
            } else {
              console.log("Cleaned from stealth-received");
            }
            resolve();
          });
      });

      console.log("Invalid announcement cleaned:", txHash);
    } catch (error) {
      console.error("Error in cleanInvalidAnnouncement:", error);
    }
  };

  // Aggiungi questi effetti per il debug
  useEffect(() => {
    console.log("Stealth payments state updated:", stealthPayments);
  }, [stealthPayments]);

  const handleClaimStealth = async (payment) => {
    setClaimingPayment(payment.originalTx);
    setClaimError(null);
    try {
      const userPub = user?.is?.pub;
      const currentWallet = await walletService.getCurrentWallet(userPub);
      console.log("Current wallet for claiming:", currentWallet);

      if (!currentWallet) {
        throw new Error("Wallet non trovato");
      }

      // Recupera il wallet Gun dal localStorage
      const gunWallet = localStorage.getItem(`gunWallet_${userPub}`);
      const gunWalletData = JSON.parse(gunWallet);

      if (!gunWalletData?.v_Pair?.epub || !gunWalletData?.s_Pair?.epub) {
        console.error("Wallet data:", gunWalletData);
        throw new Error("Chiavi stealth non trovate nel wallet");
      }

      console.log("Using keys for derivation:", {
        sharedSecret: payment.stealthData.sharedSecret,
        spendingKey: gunWalletData.s_Pair.epub,
        senderEphemeralKey: payment.stealthData.senderEphemeralKey,
        viewingKey: gunWalletData.v_Pair.epub,
      });

      // Usa le chiavi pubbliche (epub) dal gunWallet per derivare l'indirizzo stealth
      const { stealthPrivateKey } = await gun.deriveStealthAddress(
        payment.stealthData.sharedSecret,
        gunWalletData.s_Pair.epub, // usa la chiave pubblica di spesa
        payment.stealthData.senderEphemeralKey,
        gunWalletData.v_Pair.epub // usa la chiave pubblica di visualizzazione
      );

      console.log("Derived stealth private key:", {
        stealthPrivateKey: "***hidden***",
        stealthAddress: payment.stealthAddress,
      });

      // Crea il wallet stealth
      const provider = new ethers.JsonRpcProvider(
        walletService.getCurrentChain().rpcUrl
      );
      const stealthWallet = new ethers.Wallet(stealthPrivateKey, provider);

      // Verifica che l'indirizzo derivato corrisponda
      if (
        stealthWallet.address.toLowerCase() !==
        payment.stealthAddress.toLowerCase()
      ) {
        console.error("Address mismatch:", {
          derived: stealthWallet.address,
          expected: payment.stealthAddress,
          keys: {
            sharedSecret: payment.stealthData.sharedSecret,
            spendingKey: gunWalletData.s_Pair.epub,
            senderEphemeralKey: payment.stealthData.senderEphemeralKey,
            viewingKey: gunWalletData.v_Pair.epub,
          },
        });
        throw new Error(
          `Indirizzo stealth non corrispondente. Atteso: ${payment.stealthAddress}, Ottenuto: ${stealthWallet.address}`
        );
      }

      // Calcola il gas necessario
      const gasPrice = await provider.getFeeData();
      const gasLimit = 21000; // costo base di un transfer
      const gasCost = gasPrice.gasPrice * BigInt(gasLimit);

      // Sottrai il costo del gas dal valore da trasferire
      const balance = await provider.getBalance(stealthWallet.address);
      console.log("Balance:", balance.toString());

      console.log("Gas cost:", gasCost.toString());

      let valueToSend = balance - gasCost;

      console.log("Value to send:", valueToSend.toString());

      if (valueToSend <= 0) {
        throw new Error("Saldo insufficiente per coprire i costi del gas");
      }

      console.log("Sending transaction with params:", {
        to: currentWallet.internalWalletAddress,
        value: valueToSend.toString(),
        gasLimit: gasLimit,
        gasPrice: gasPrice.gasPrice.toString(),
      });

      // Invia la transazione al tuo wallet principale
      const tx = await stealthWallet.sendTransaction({
        to: currentWallet.internalWalletAddress,
        value: valueToSend,
        gasLimit: gasLimit,
        gasPrice: gasPrice.gasPrice,
      });

      await tx.wait();

      // Rimuovi il pagamento dalla lista dopo il riscatto
      setStealthPayments((prev) =>
        prev.filter((p) => p.originalTx !== payment.originalTx)
      );

      // Rimuovi l'annuncio da Gun
      gun
        .get(DAPP_NAME)
        .get("stealth-announcements")
        .get(payment.originalTx)
        .put(null);

      // Rimuovi anche dal percorso dell'utente
      gun
        .get(DAPP_NAME)
        .get("users")
        .get(userPub)
        .get("stealth-received")
        .get(payment.originalTx)
        .put(null);

      toast.success("Fondi riscattati con successo!");
    } catch (error) {
      console.error("Errore nel riscatto:", error);
      setClaimError(error.message);
      toast.error(`Errore nel riscatto: ${error.message}`);
    } finally {
      setClaimingPayment(null);
    }
  };

  useEffect(() => {
    console.log("Current transactions:", transactions);
  }, [transactions]);

  // Aggiungi questa funzione per gestire l'eliminazione delle transazioni
  const handleDeleteTransaction = async (tx, isStealthPayment = false) => {
    try {
      const userPub = user?.is?.pub;
      if (!userPub) {
        toast.error("Utente non autenticato");
        return;
      }

      const txId = isStealthPayment ? tx.originalTx : tx.txHash;

      // Aggiungi alla lista delle transazioni eliminate
      deletedTransactions.add(txId);
      localStorage.setItem(
        `deletedTx_${userPub}`,
        JSON.stringify([...deletedTransactions])
      );

      if (isStealthPayment) {
        setStealthPayments((prev) =>
          prev.filter((p) => p.originalTx !== tx.originalTx)
        );

        // Usa il walletService per la pulizia
        await walletService.cleanTransaction(tx.originalTx, userPub, true);
      } else {
        setTransactions((prev) => prev.filter((t) => t.txHash !== tx.txHash));

        // Usa il walletService per la pulizia
        await walletService.cleanTransaction(tx.txHash, userPub, false);
      }

      toast.success("Transazione eliminata con successo");
    } catch (error) {
      console.error("Errore nell'eliminazione della transazione:", error);
      toast.error(`Errore nell'eliminazione: ${error.message}`);
    }
  };

  return (
    <div className="p-6 bg-white rounded-2xl shadow-md">
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <>
          <h3 className="text-2xl font-semibold text-gray-900 mb-6 pb-3 border-b-2 border-gray-100">
            Transazioni Ricevute su {currentChain.name}
          </h3>

          {/* Pagamenti Stealth */}
          <div className="mb-8">
            <h4 className="flex items-center gap-2 text-xl font-medium text-gray-700 mb-4">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              Pagamenti Stealth
            </h4>
            {stealthPayments.length > 0 ? (
              stealthPayments.map((payment) => (
                <div
                  key={payment.originalTx}
                  className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-200 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <div className="flex flex-col gap-2">
                    <span className="text-lg font-semibold text-emerald-600">
                      {payment.balance} {payment.chain.nativeCurrency.symbol}
                    </span>
                    <span className="text-sm text-gray-600">
                      Network: {payment.network}
                    </span>
                    <span className="text-sm text-gray-400">
                      {new Date(payment.timestamp).toLocaleString()}
                    </span>
                    {claimError && claimingPayment === payment.originalTx && (
                      <span className="text-red-500 text-sm mt-1">
                        {claimError}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <button
                      onClick={() => handleClaimStealth(payment)}
                      disabled={claimingPayment !== null}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors
                        ${
                          claimingPayment === payment.originalTx
                            ? "bg-gray-400 cursor-not-allowed"
                            : "bg-blue-500 hover:bg-blue-600"
                        } text-white`}
                    >
                      {claimingPayment === payment.originalTx
                        ? "Riscatto in corso..."
                        : "Riscatta Fondi"}
                    </button>
                    <button
                      onClick={() => handleDeleteTransaction(payment, true)}
                      className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                      title="Elimina transazione"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                    <a
                      href={`${payment.chain.blockExplorer}/tx/${payment.originalTx}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors text-sm"
                    >
                      Vedi su Explorer
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </a>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-48 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                <svg
                  className="w-12 h-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V7a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p className="mt-2 text-sm text-gray-500">
                  Nessun pagamento stealth ricevuto
                </p>
              </div>
            )}
          </div>

          {/* Transazioni normali */}
          <div>
            <h4 className="flex items-center gap-2 text-xl font-medium text-gray-700 mb-4">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Pagamenti Standard
            </h4>
            {transactions.length > 0 ? (
              transactions.map((tx) => (
                <div
                  key={tx.txHash}
                  className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-200 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <div className="flex flex-col gap-2">
                    <span className="text-lg font-semibold text-emerald-600">
                      {tx.amount} {tx.network}
                    </span>
                    <span className="text-sm text-gray-600">Da: {tx.from}</span>
                    <span className="text-sm text-gray-400">
                      {new Date(tx.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <button
                      onClick={() => handleDeleteTransaction(tx)}
                      className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                      title="Elimina transazione"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                    <a
                      href={`${
                        walletService.getCurrentChain().blockExplorer
                      }/tx/${tx.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors text-sm"
                    >
                      Vedi su Explorer
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </a>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-48 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                <svg
                  className="w-12 h-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                <p className="mt-2 text-sm text-gray-500">
                  Nessuna transazione standard ricevuta
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TransactionHistory;
