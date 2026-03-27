import React, { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";

interface LayoutProps {
  sidebarProps: any; // Using any for brevity in this transitional phase, but should ideally be typed
}

export const Layout: React.FC<LayoutProps> = ({ sidebarProps }) => {
  const location = useLocation();
  const isRoot = location.pathname === "/";
  
  // Close drawer on location change (works for mobile)
  useEffect(() => {
    const drawerCheckbox = document.getElementById("my-drawer") as HTMLInputElement;
    if (drawerCheckbox) drawerCheckbox.checked = false;
  }, [location.pathname]);

  return (
    <div className="drawer lg:drawer-open h-full border-t border-white/5">
      <input id="my-drawer" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content flex flex-col bg-base-100 h-full overflow-hidden">
        {/* Mobile Header: Shown only on root path when no recipient is selected */}
        {/* Mobile Header: Hidden since Sidebar in main area has its own header */}
        {/* We only show a global Layout navbar if we are on a route that doesn't provide its own back button or header, but currently all pages (Chat, Profile, Settings) provide their own. */}
        
        <main className="flex-1 overflow-hidden relative flex flex-col">
          <div className="flex-1 lg:block hidden h-full">
            <Outlet />
          </div>
          <div className="flex-1 lg:hidden h-full overflow-hidden">
            {/* On mobile, if we are at root, show sidebar. Otherwise show Outlet (ChatView, Profile, Settings) */}
            {isRoot ? (
              <div className="h-full overflow-y-auto">
                <Sidebar {...sidebarProps} />
              </div>
            ) : (
              <Outlet />
            )}
          </div>
        </main>
      </div> 
      <div className="drawer-side z-30">
        <label htmlFor="my-drawer" aria-label="close sidebar" className="drawer-overlay"></label>
        <div className="h-full w-[85vw] max-w-[320px] lg:max-w-none lg:w-96 transition-all">
          <Sidebar {...sidebarProps} />
        </div>
      </div>
    </div>
  );
};
