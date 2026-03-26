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
    <div className="p-4 lg:p-12 max-w-5xl mx-auto space-y-12 animate-fadeIn overflow-y-auto h-full">
      <div className="flex items-center gap-6">
        <button className="btn btn-ghost btn-circle shadow-lg bg-base-200 border-white/5" onClick={() => navigate(-1)}>
          ←
        </button>
        <h1 className="text-4xl font-black text-primary tracking-tight">Settings</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-1 gap-8">
        <div className="card bg-base-200 shadow-xl border border-white/5 overflow-visible">
          <div className="card-body gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="card-title text-sm font-black uppercase tracking-widest opacity-50 mb-1 text-primary">Notifications</h3>
                <p className="text-xs opacity-60">Stay updated with new messages and group activity.</p>
              </div>
              <button className="btn btn-outline btn-sm px-6" onClick={handleEnableNotifications}>
                Request Permission
              </button>
            </div>
          </div>
        </div>

        <div className="card bg-base-200 shadow-xl border border-white/5 overflow-visible">
          <div className="card-body gap-6">
            <div>
              <h3 className="card-title text-sm font-black uppercase tracking-widest opacity-50 mb-1 text-primary">Performance & Cache</h3>
              <p className="text-xs opacity-60 mb-6">Manage how the application stores data locally.</p>
              
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between p-4 bg-base-300 rounded-2xl border border-white/5">
                  <div>
                    <div className="text-sm font-bold">Hard Reset</div>
                    <div className="text-[10px] opacity-40">Clears all local storage, keys, and session data.</div>
                  </div>
                  <button className="btn btn-error btn-sm btn-outline px-6" onClick={handleReset}>
                    Reset All
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card bg-base-200 shadow-xl border border-white/5 overflow-visible">
          <div className="card-body gap-6">
            <h3 className="card-title text-sm font-black uppercase tracking-widest opacity-50 mb-1 text-primary">Appearance</h3>
            <div className="join w-full shadow-lg">
              <button className="btn bg-primary/20 text-primary border-primary/20 grow pointer-events-none join-item">Dark Mode (Default)</button>
              <button className="btn btn-ghost grow join-item disabled">Light Mode (Coming Soon)</button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center p-8 opacity-20 hover:opacity-100 transition-opacity">
        <button className="btn btn-ghost btn-xs" onClick={() => logout()}>
          Sign out session
        </button>
      </div>
    </div>
  );
};
