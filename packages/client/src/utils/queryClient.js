// Funzioni di utilità per la gestione della cache
export const clearQueryCache = (queryClient) => {
  return queryClient.clear();
};

export const invalidateQueries = (queryClient, queryKey) => {
  return queryClient.invalidateQueries({ queryKey });
};

export const prefetchQuery = async (queryClient, queryKey, queryFn) => {
  await queryClient.prefetchQuery({
    queryKey,
    queryFn,
    staleTime: 1000 * 60 * 5,
  });
};

export const setQueryData = (queryClient, queryKey, data) => {
  queryClient.setQueryData(queryKey, data);
};

// Funzione per gestire il caching offline
export const setupOfflineCache = (queryClient, defaultQueryConfig) => {
  window.addEventListener("online", () => {
    queryClient.resumePausedMutations();
    queryClient.invalidateQueries();
  });

  window.addEventListener("offline", () => {
    queryClient.setDefaultOptions({
      queries: {
        ...defaultQueryConfig.queries,
        cacheTime: Infinity,
        retry: false,
      },
    });
  });
};
