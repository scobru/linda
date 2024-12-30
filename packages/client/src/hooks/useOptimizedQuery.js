import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { measurePerformance } from "../utils/performance";

export const useOptimizedQuery = (queryKey, queryFn, options = {}) => {
  return useQuery({
    queryKey,
    queryFn: async (...args) => {
      return measurePerformance(`Query ${queryKey.join(".")}`, () =>
        queryFn(...args)
      );
    },
    ...options,
    select: (data) => {
      if (options.select) {
        return options.select(data);
      }
      return data;
    },
    onError: (error) => {
      console.error(`Query error for ${queryKey.join(".")}:`, error);
      if (options.onError) {
        options.onError(error);
      }
    },
  });
};

export const useOptimizedMutation = (mutationFn, options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (...args) => {
      return measurePerformance("Mutation", () => mutationFn(...args));
    },
    ...options,
    onSuccess: async (data, variables, context) => {
      // Invalidate relevant queries after successful mutation
      if (options.invalidateQueries) {
        await queryClient.invalidateQueries({
          queryKey: options.invalidateQueries,
        });
      }

      // Update cache optimistically if provided
      if (options.updateCache) {
        options.updateCache(data, queryClient);
      }

      if (options.onSuccess) {
        await options.onSuccess(data, variables, context);
      }
    },
  });
};

// Hook per il prefetching intelligente
export const usePrefetch = (queryKey, queryFn) => {
  const queryClient = useQueryClient();

  const prefetch = async () => {
    try {
      await queryClient.prefetchQuery({
        queryKey,
        queryFn,
        staleTime: 1000 * 60 * 5, // 5 minuti
      });
    } catch (error) {
      console.error(`Prefetch error for ${queryKey.join(".")}:`, error);
    }
  };

  return prefetch;
};
