import { useState, useEffect, useCallback, useRef } from "react";
import { gun, DAPP_NAME } from "linda-protocol";
import { Observable } from "rxjs";

export const useSystemMetrics = (metricsToObserve = []) => {
  const [metrics, setMetrics] = useState({});
  const [loading, setLoading] = useState(true);
  const subscriptionsRef = useRef(new Map());

  const cleanupSubscriptions = useCallback(() => {
    subscriptionsRef.current.forEach((subscription) => {
      try {
        if (subscription) subscription.unsubscribe();
      } catch (error) {
        console.warn("Errore durante la pulizia delle sottoscrizioni:", error);
      }
    });
    subscriptionsRef.current.clear();
  }, []);

  useEffect(() => {
    if (!metricsToObserve.length) {
      setLoading(false);
      return;
    }

    setLoading(true);
    cleanupSubscriptions();

    // Crea una sottoscrizione per ogni metrica richiesta
    metricsToObserve.forEach((metricName) => {
      const subscription = new Observable((subscriber) => {
        const handler = gun
          .get(DAPP_NAME)
          .get("system")
          .get("metrics")
          .get(metricName)
          .on((value) => {
            if (value !== undefined && value !== null) {
              subscriber.next({ [metricName]: value });
            }
          });

        return () => {
          if (typeof handler === "function") handler();
        };
      }).subscribe({
        next: (value) => {
          setMetrics((prev) => ({ ...prev, ...value }));
          setLoading(false);
        },
        error: (error) => {
          console.error(
            `Errore nella sottoscrizione della metrica ${metricName}:`,
            error
          );
          setLoading(false);
        },
      });

      subscriptionsRef.current.set(metricName, subscription);
    });

    return () => {
      cleanupSubscriptions();
    };
  }, [metricsToObserve, cleanupSubscriptions]);

  return {
    metrics,
    loading,
    getMetric: useCallback((name) => metrics[name], [metrics]),
  };
};
