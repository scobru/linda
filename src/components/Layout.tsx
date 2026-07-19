import React, { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";

interface LayoutProps {
  sidebarProps: any; // Using any for brevity in this transitional phase, but should ideally be typed
}

export const Layout: React.FC<LayoutProps> = ({ sidebarProps }) => {
  const location = useLocation();
  const isRoot = location.pathname === "/";
  // Bottom tab bar only makes sense on top-level mobile screens, not inside a chat/detail view.
  const showBottomNav = isRoot || location.pathname === "/profile";

  // Close drawer on location change (works for mobile)
  useEffect(() => {
    const drawerCheckbox = document.getElementById("my-drawer") as HTMLInputElement;
    if (drawerCheckbox) drawerCheckbox.checked = false;
  }, [location.pathname]);

  return (
    <div className="drawer lg:drawer-open h-full">
      <input id="my-drawer" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content flex flex-col bg-transparent h-full overflow-hidden">
        {/* Mobile Header: Shown only on root path when no recipient is selected */}
        {/* Mobile Header: Hidden since Sidebar in main area has its own header */}
        {/* We only show a global Layout navbar if we are on a route that doesn't provide its own back button or header, but currently all pages (Chat, Profile, Settings) provide their own. */}

        <main className="flex-1 overflow-hidden relative flex flex-col">
          {isRoot ? (
            <div className="h-full">
              <div className="lg:hidden h-full">
                <Sidebar {...sidebarProps} />
              </div>
              <div className="hidden lg:flex h-full">
                <Outlet />
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
        {showBottomNav && <BottomNav />}
      </div>
      <div className="drawer-side z-30">
        <label htmlFor="my-drawer" aria-label="close sidebar" className="drawer-overlay"></label>
        <div className="h-full w-[88vw] max-w-[360px] lg:max-w-none lg:w-[410px] transition-all">
          <Sidebar {...sidebarProps} />
        </div>
      </div>
    </div>
  );
};
