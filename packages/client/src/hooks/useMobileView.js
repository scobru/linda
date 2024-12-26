import { useState, useEffect } from "react";

export const useMobileView = (isMobileView) => {
  const [currentIsMobileView, setCurrentIsMobileView] = useState(isMobileView);

  useEffect(() => {
    const handleResize = () => {
      setCurrentIsMobileView(window.innerWidth < 768);
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return { currentIsMobileView };
};
