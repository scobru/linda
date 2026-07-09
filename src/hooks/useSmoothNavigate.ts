import { useNavigate } from "react-router-dom";
import { flushSync } from "react-dom";
import { useCallback } from "react";

export const useSmoothNavigate = () => {
  const navigate = useNavigate();

  return useCallback((to: string, stateUpdate?: () => void) => {
    // If View Transitions API is not supported (e.g. older browsers), fallback to normal navigation
    if (!document.startViewTransition) {
      if (stateUpdate) stateUpdate();
      navigate(to);
      return;
    }

    // Wrap the navigation and any synchronous state updates in startViewTransition for a native cross-fade
    const transition = document.startViewTransition(() => {
      flushSync(() => {
        if (stateUpdate) stateUpdate();
        navigate(to);
      });
    });

    // Prevent unhandled promise rejection if transition is skipped/aborted
    transition.ready.catch(() => {});
    transition.finished.catch(() => {});
    transition.updateCallbackDone.catch(() => {});
  }, [navigate]);
};
