import React from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

interface LayoutProps {
  sidebarProps: any; // Using any for brevity in this transitional phase, but should ideally be typed
}

export const Layout: React.FC<LayoutProps> = ({ sidebarProps }) => {
  return (
    <div className="drawer lg:drawer-open h-full border-t border-white/5">
      <input id="my-drawer" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content flex flex-col bg-base-100 h-full overflow-hidden">
        {/* Mobile Header (only visible when chat is not wide open) */}
        {!sidebarProps.recipient && (
          <div className="lg:hidden navbar bg-base-200 border-b border-white/5 h-16 shrink-0">
            <div className="flex-none">
              <label htmlFor="my-drawer" className="btn btn-square btn-ghost">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-5 h-5 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
              </label>
            </div>
            <div className="flex-1">
              <span className="text-xl font-bold px-4">Linda</span>
            </div>
          </div>
        )}
        
        <main className="flex-1 overflow-hidden relative">
          <Outlet />
        </main>
      </div> 
      <div className="drawer-side z-30">
        <label htmlFor="my-drawer" aria-label="close sidebar" className="drawer-overlay"></label>
        <Sidebar {...sidebarProps} />
      </div>
    </div>
  );
};
