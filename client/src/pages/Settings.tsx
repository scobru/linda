import React from "react";
import { useNavigate } from "react-router-dom";
import { useShogun } from "shogun-button-react";

interface SettingsProps {
  showNotification: (msg: string, type?: "info" | "error") => void;
}

export const Settings: React.FC<SettingsProps> = ({ showNotification }) => {
  const navigate = useNavigate();
  const { logout } = useShogun();

  const handleReset = () => {
    if (
      window.confirm(
        "Are you sure you want to clear all cache, localStorage, and sessionStorage? This will log you out."
      )
    ) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }
  };

  const handleEnableNotifications = () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      Notification.requestPermission().then((permission) => {
        showNotification(
          `Notifications are now ${permission}`,
          permission === "granted" ? "info" : "error"
        );
      });
    }
  };

  return (
    <div className="page-container glass-effect">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <span className="icon">←</span>
        </button>
        <h1>Settings</h1>
      </div>

      <div className="page-content">
        <div className="settings-section">
          <h3>Notifications</h3>
          <div className="action-row">
            <span>Push Notifications</span>
            <button className="secondary-btn" onClick={handleEnableNotifications}>
              Enable
            </button>
          </div>
        </div>

        <div className="settings-section">
          <h3>Theme & Appearance</h3>
          <div className="theme-toggle">
            <span className="active">Dark Mode</span>
            <span className="inactive">Light Mode (Coming Soon)</span>
          </div>
        </div>

        <div className="settings-section danger-zone">
          <h3>Account & Data</h3>
          <div className="action-row">
            <span>Clear Cache & Reset</span>
            <button className="danger-btn" onClick={handleReset}>
              Reset Everything
            </button>
          </div>
          <div className="action-row">
            <span>Log out</span>
            <button className="danger-btn" onClick={() => logout()}>
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
