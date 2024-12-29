import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

// Definizione di BigInt se non è disponibile globalmente
if (typeof BigInt === "undefined") {
  window.BigInt = (value) => Number(value);
}

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTransactions = async () => {
      try {
        // Implementare la logica per caricare le transazioni
        setTransactions([]);
        setLoading(false);
      } catch (error) {
        console.error("Errore nel caricamento delle transazioni:", error);
        toast.error("Errore nel caricamento delle transazioni");
        setLoading(false);
      }
    };

    loadTransactions();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <p>Nessuna transazione trovata</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 p-4">
          {transactions.map((transaction, index) => (
            <div
              key={index}
              className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium text-gray-900">
                    {transaction.type === "send" ? "Inviato" : "Ricevuto"}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {formatDistanceToNow(new Date(transaction.timestamp), {
                      addSuffix: true,
                      locale: it,
                    })}
                  </p>
                </div>
                <span
                  className={`px-2 py-1 text-sm rounded-full ${
                    transaction.type === "send"
                      ? "bg-red-100 text-red-800"
                      : "bg-green-100 text-green-800"
                  }`}
                >
                  {transaction.amount} ETH
                </span>
              </div>
              <div className="mt-2">
                <p className="text-sm text-gray-600">
                  {transaction.type === "send" ? "A: " : "Da: "}
                  <span className="font-mono">{transaction.address}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
