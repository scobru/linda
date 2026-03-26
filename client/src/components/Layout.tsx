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
        {/* Mobile Header: Hidden if a recipient is selected (ChatView handles back button) */}
        {/* Mobile Header: Hidden if a recipient is selected (ChatView handles back button) */}
        {!sidebarProps.recipient && (
          <div className="lg:hidden navbar bg-base-100 border-b border-white/5 h-16 shrink-0 px-4">
            <div className="flex-1">
              <span className="text-xl font-black text-primary tracking-tighter">Linda</span>
            </div>
            <div className="flex-none">
              <label htmlFor="my-drawer" className="btn btn-ghost btn-circle shadow-sm lg:hidden">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-5 h-5 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
              </label>
            </div>
          </div>
        )}
        
        <main className="flex-1 overflow-hidden relative flex flex-col">
          <div className="flex-1 lg:block hidden h-full">
            <Outlet />
          </div>
          <div className="flex-1 lg:hidden h-full overflow-y-auto">
            {sidebarProps.recipient ? <Outlet /> : <Sidebar {...sidebarProps} />}
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
