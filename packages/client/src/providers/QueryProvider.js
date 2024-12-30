import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Configurazione di base per il QueryClient
const defaultQueryConfig = {
  queries: {
    staleTime: 1000 * 60 * 5, // 5 minuti
    cacheTime: 1000 * 60 * 30, // 30 minuti
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  },
  mutations: {
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  },
};

// Creazione di una singola istanza del QueryClient
const queryClient = new QueryClient({
  defaultOptions: defaultQueryConfig,
  logger: {
    log: console.log,
    warn: console.warn,
    error: (error) => {
      console.error("React Query Error:", error);
    },
  },
});

export const QueryProvider = ({ children }) => {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};
