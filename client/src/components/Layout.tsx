import React from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

interface LayoutProps {
  sidebarProps: any; // Using any for brevity in this transitional phase, but should ideally be typed
}

export const Layout: React.FC<LayoutProps> = ({ sidebarProps }) => {
  return (
    <div className="layout-wrapper" style={{ display: "flex", width: "100%", height: "100%", overflow: "hidden" }}>
      <Sidebar {...sidebarProps} />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};
