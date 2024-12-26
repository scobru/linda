import React from "react";

export const useIntersectionObserver = (callback, deps = []) => {
  const observer = React.useRef(null);

  React.useEffect(() => {
    observer.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            callback(entry.target.dataset.messageId);
          }
        });
      },
      { threshold: 0.5 }
    );

    return () => {
      if (observer.current) {
        observer.current.disconnect();
      }
    };
  }, deps);

  return observer.current;
};
