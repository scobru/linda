import { useState, useEffect } from "react";

export const useMobileView = (initialIsMobile = false) => {
  const [isMobileView, setIsMobileView] = useState(initialIsMobile);
  const [showSidebar, setShowSidebar] = useState(true);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return {
    isMobileView,
    showSidebar,
    setShowSidebar,
  };
};
