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
  const [deletedTxs, setDeletedTxs] = useState(new Set());

  useEffect(() => {
    if (user?.is?.pub) {
      loadTransactions();
      loadStealthPayments();
    }
  }, [user?.is?.pub]);

  const loadTransactions = () => {
    const userPub = user?.is?.pub;
    if (!userPub) return;

    // Reset dello stato prima di caricare
    setTransactions([]);

    // Mantieni un set di transazioni già processate
    const processedTxs = new Set();

    gun
      .get(DAPP_NAME)
      .get("transactions")
      .map()
      .once((tx) => {
        if (
          tx && 
          tx.to === userPub && 
          !tx.isStealthMode && 
          !tx.deleted && // Ignora le transazioni marcate come eliminate
          !processedTxs.has(tx.txHash)
        ) {
          processedTxs.add(tx.txHash);
          setTransactions((prev) => [...prev, tx]);
        }
      });
  };

  const loadStealthPayments = async () => {
    try {
      const userPub = user?.is?.pub;
      if (!userPub) return;

      console.log("Loading stealth payments for user:", userPub);
      
      const processedTxs = new Set();
      const validPayments = [];

      // Funzione per processare l'annuncio una sola volta
      const processUnique = async (announcement) => {
        if (!announcement?.txHash || 
            processedTxs.has(announcement.txHash) || 
            deletedTxs.has(announcement.txHash)) { // Controlla se è stata eliminata
          return;
        }
        
        console.log("Processing announcement:", announcement);
        processedTxs.add(announcement.txHash);

        // Verifica che l'annuncio sia valido e non eliminato
        if (!announcement.stealthAddress || 
            !announcement.to || 
            announcement.to !== userPub || 
            announcement.deleted) {
          console.log("Skipping invalid or deleted announcement:", announcement);
          return;
        }

        try {
          const provider = new ethers.JsonRpcProvider(
            walletService.getCurrentChain().rpcUrl,
            undefined,
            { staticNetwork: true }
          );

          const balance = await provider.getBalance(announcement.stealthAddress);
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

      // Carica gli annunci una sola volta
      await new Promise((resolve) => {
        gun.get(DAPP_NAME)
           .get("stealth-announcements")
           .map()
           .once(async (announcement) => {
             await processUnique(announcement);
             resolve();
           });
      });

      await new Promise((resolve) => {
        gun.get(DAPP_NAME)
           .get("users")
           .get(userPub)
           .get("stealth-received")
           .map()
           .once(async (announcement) => {
             await processUnique(announcement);
             resolve();
           });
      });

      console.log("Found valid payments:", validPayments);
      setStealthPayments(validPayments);

    } catch (error) {
      console.error("Error loading stealth payments:", error);
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

      if (isStealthPayment) {
        const currentWallet = await walletService.getCurrentWallet(userPub);
        
        if (!currentWallet?.viewingPublicKey || 
            tx.stealthData.receiverViewingKey !== currentWallet.viewingPublicKey) {
          console.log("Verifica permessi fallita:", {
            walletKey: currentWallet?.viewingPublicKey,
            txKey: tx.stealthData.receiverViewingKey
          });
          toast.error("Non hai i permessi per eliminare questa transazione");
          return;
        }

        // Aggiorna immediatamente lo stato locale e aggiungi alla lista delle tx eliminate
        setStealthPayments((prev) =>
          prev.filter((p) => p.originalTx !== tx.originalTx)
        );
        setDeletedTxs((prev) => new Set([...prev, tx.originalTx]));

        // Elimina da Gun e marca come eliminato
        await Promise.all([
          new Promise((resolve) => {
            gun.get(DAPP_NAME)
               .get("stealth-announcements")
               .get(tx.originalTx)
               .put({ ...tx, deleted: true, deletedAt: Date.now() }, resolve);
          }),
          new Promise((resolve) => {
            gun.get(DAPP_NAME)
               .get("users")
               .get(userPub)
               .get("stealth-received")
               .get(tx.originalTx)
               .put({ ...tx, deleted: true, deletedAt: Date.now() }, resolve);
          })
        ]);

        // Ora rimuovi effettivamente i dati
        await Promise.all([
          new Promise((resolve) => {
            gun.get(DAPP_NAME)
               .get("stealth-announcements")
               .get(tx.originalTx)
               .put(null, resolve);
          }),
          new Promise((resolve) => {
            gun.get(DAPP_NAME)
               .get("users")
               .get(userPub)
               .get("stealth-received")
               .get(tx.originalTx)
               .put(null, resolve);
          })
        ]);

        console.log("Transazione stealth eliminata definitivamente:", tx.originalTx);
        toast.success("Transazione eliminata con successo");

      } else {
        if (tx.to !== userPub) {
          toast.error("Non hai i permessi per eliminare questa transazione");
          return;
        }

        // Aggiorna immediatamente lo stato locale
        setTransactions((prev) => prev.filter((t) => t.txHash !== tx.txHash));

        // Elimina la transazione standard
        await new Promise((resolve, reject) => {
          gun.get(DAPP_NAME)
             .get("transactions")
             .get(tx.txHash)
             .put(null, (ack) => {
               if (ack.err) {
                 console.error("Errore eliminazione transazione:", ack.err);
                 reject(ack.err);
               } else {
                 console.log("Transazione eliminata dal nodo Gun");
                 resolve();
               }
             });
        });

        // Forza la disconnessione dal nodo per questo percorso
        gun.get(DAPP_NAME)
           .get("transactions")
           .get(tx.txHash)
           .off();

        console.log("Transazione standard eliminata completamente:", tx.txHash);
        toast.success("Transazione eliminata con successo");
      }
    } catch (error) {
      console.error("Errore nell'eliminazione della transazione:", error);
      toast.error(`Errore nell'eliminazione della transazione: ${error.message}`);
    }
  };

  return (
    <div className="transaction-history">
      <h3>Transazioni Ricevute</h3>

      {/* Pagamenti Stealth */}
      <div className="stealth-payments">
        <h4>Pagamenti Stealth</h4>
        {stealthPayments.map((payment) => (
          <div key={payment.originalTx} className="stealth-payment-item">
            <div className="transaction-details">
              <span className="transaction-amount">
                {payment.balance} {payment.chain.nativeCurrency.symbol}
              </span>
              <span className="transaction-network">
                Network: {payment.network}
              </span>
              <span className="transaction-date">
                {new Date(payment.timestamp).toLocaleString()}
              </span>
              {claimError && claimingPayment === payment.originalTx && (
                <span className="text-red-500 text-sm mt-1">{claimError}</span>
              )}
            </div>
            <div className="transaction-actions">
              <button
                onClick={() => handleClaimStealth(payment)}
                disabled={claimingPayment !== null}
                className="claim-button"
              >
                {claimingPayment === payment.originalTx
                  ? "Riscatto in corso..."
                  : "Riscatta Fondi"}
              </button>
              <button
                onClick={() => handleDeleteTransaction(payment, true)}
                className="delete-button"
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
                className="transaction-link"
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
        ))}
      </div>

      {/* Transazioni normali */}
      <div className="regular-transactions">
        <h4>Pagamenti Standard</h4>
        {transactions.map((tx) => (
          <div key={tx.txHash} className="transaction-item">
            <div className="transaction-details">
              <span className="transaction-amount">
                {tx.amount} {tx.network}
              </span>
              <span className="transaction-network">Da: {tx.from}</span>
              <span className="transaction-date">
                {new Date(tx.timestamp).toLocaleString()}
              </span>
            </div>
            <div className="transaction-actions">
              <button
                onClick={() => handleDeleteTransaction(tx)}
                className="delete-button"
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
                href={`${walletService.getCurrentChain().blockExplorer}/tx/${
                  tx.txHash
                }`}
                target="_blank"
                rel="noopener noreferrer"
                className="transaction-link"
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
        ))}
      </div>

      {transactions.length === 0 && stealthPayments.length === 0 && (
        <div className="flex items-center justify-center h-40">
          <p className="text-gray-500">Nessuna transazione ricevuta</p>
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;
