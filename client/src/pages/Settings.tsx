import React from "react";
import { useNavigate } from "react-router-dom";
import { useShogun } from "shogun-button-react";

interface SettingsProps {
  showNotification: (msg: string, type?: "info" | "error") => void;
}

export const Settings: React.FC<SettingsProps> = ({ showNotification }) => {
  const navigate = useNavigate();
  const { logout } = useShogun();
  const [currentTheme, setCurrentTheme] = React.useState(localStorage.getItem("linda-theme") || "linda");

  const setTheme = (theme: string) => {
    localStorage.setItem("linda-theme", theme);
    document.documentElement.dataset.theme = theme;
    setCurrentTheme(theme);
    showNotification(`Theme set to ${theme === "linda" ? "Dark" : "Light"}`, "info");
  };

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
    <div className="p-6 sm:p-12 lg:p-16 max-w-5xl mx-auto space-y-10 animate-fadeIn h-full overflow-y-auto">
      <div className="flex items-center gap-6 relative z-10">
        <button 
          className="btn btn-ghost btn-circle bg-base-200 border border-base-content/5 active:scale-90 transition-all flex items-center justify-center p-0" 
          onClick={() => navigate("/")}
          aria-label="Go back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-5 h-5 opacity-60">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-3xl font-black tracking-tight">Settings</h1>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:gap-8">
        <div className="card bg-base-200 border border-base-content/5 overflow-hidden rounded-2xl">
          <div className="card-body p-6 sm:p-8 gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] opacity-40 mb-1.5 text-primary">Notifications</h3>
                <p className="text-sm opacity-70">Stay updated with new messages and group activity.</p>
              </div>
              <button className="btn btn-primary btn-outline btn-sm sm:btn-md rounded-xl px-6" onClick={handleEnableNotifications}>
                Enable Access
              </button>
            </div>
          </div>
        </div>

        <div className="card bg-base-200 border border-base-content/5 overflow-hidden rounded-2xl">
          <div className="card-body p-6 sm:p-8 gap-6">
            <div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] opacity-40 mb-1.5 text-primary">Data & Management</h3>
              <p className="text-sm opacity-70 mb-6">Manage how the application stores data locally.</p>
              
              <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-base-300 rounded-2xl border border-base-content/5 gap-4">
                  <div>
                    <div className="text-sm font-bold">Hard Reset</div>
                    <div className="text-[11px] opacity-50 mt-1">Clears all local storage, keys, and session data.</div>
                  </div>
                  <button className="btn btn-error btn-outline btn-sm px-6 rounded-xl" onClick={handleReset}>
                    Reset Session
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card bg-base-200 border border-base-content/5 overflow-hidden rounded-2xl">
          <div className="card-body p-6 sm:p-8 gap-6">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] opacity-40 mb-1.5 text-primary">Appearance</h3>
            <div className="grid grid-cols-2 gap-2 p-1 bg-base-300 rounded-2xl border border-base-content/5">
              <button 
                className={`btn btn-sm sm:btn-md rounded-xl transition-all ${currentTheme === "linda" ? "btn-primary shadow-lg" : "btn-ghost opacity-60"}`}
                onClick={() => setTheme("linda")}
              >
                Dark Mode
              </button>
              <button 
                className={`btn btn-sm sm:btn-md rounded-xl transition-all ${currentTheme === "linda-light" ? "btn-primary shadow-lg" : "btn-ghost opacity-60"}`}
                onClick={() => setTheme("linda-light")}
              >
                Light Mode
              </button>
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
