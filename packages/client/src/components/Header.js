import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { sessionManager, user } from "linda-protocol";
import { useAppState } from "../context/AppContext";
import Profile from "./Homepage/Profile";
import AddFriend from "./Homepage/AddFriend";
import GlobalWalletModal from "./Homepage/GlobalWalletModal";
import TransactionModal from "./Homepage/TransactionModal";

const Header = () => {
  const navigate = useNavigate();
  const { appState, updateAppState } = useAppState();
  const [showProfile, setShowProfile] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);

  const handleLogout = async () => {
    try {
      // Pulisci localStorage
      localStorage.removeItem("isAuthenticated");
      localStorage.removeItem("userPub");
      localStorage.removeItem("username");
      localStorage.removeItem("userAlias");
      localStorage.removeItem("userAddress");
      localStorage.removeItem("selectedUser");
      localStorage.removeItem("walletAuth");

      // Pulisci la sessione
      await sessionManager.clearSession();
      if (user.is) {
        user.leave();
      }

      // Aggiorna AppState
      updateAppState({
        user: null,
        isAuthenticated: false,
        username: null,
      });

      navigate("/login");
    } catch (error) {
      console.error("Errore durante il logout:", error);
    }
  };

  return (
    <div className="bg-[#2D325A] border-b border-[#4A4F76] py-2 px-4">
      <div className="flex justify-between items-center">
        {/* Logo e nome utente */}
        <div className="flex items-center space-x-4">
          <h1 className="text-white font-bold text-xl">linda</h1>
          <span className="text-green-400 text-sm">• Online</span>
        </div>

        {/* Pulsanti azioni */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowProfile(true)}
            className="p-2 text-gray-300 hover:text-white hover:bg-[#4A4F76] rounded-full transition-colors"
            title="Profilo"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </button>

          <button
            onClick={() => setShowWalletModal(true)}
            className="p-2 text-gray-300 hover:text-white hover:bg-[#4A4F76] rounded-full transition-colors"
            title="Wallet"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
          </button>

          <button
            onClick={() => setShowTransactionModal(true)}
            className="p-2 text-gray-300 hover:text-white hover:bg-[#4A4F76] rounded-full transition-colors"
            title="Transazioni"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </button>

          <button
            onClick={() => setShowAddFriend(true)}
            className="p-2 text-gray-300 hover:text-white hover:bg-[#4A4F76] rounded-full transition-colors"
            title="Aggiungi amico"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>

          <button
            onClick={handleLogout}
            className="p-2 text-gray-300 hover:text-white hover:bg-[#4A4F76] rounded-full transition-colors"
            title="Logout"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Modali */}
      {showProfile && (
        <Profile isOpen={showProfile} onClose={() => setShowProfile(false)} />
      )}

      {showAddFriend && (
        <AddFriend
          isOpen={showAddFriend}
          onClose={() => setShowAddFriend(false)}
        />
      )}

      {showWalletModal && (
        <GlobalWalletModal
          isOpen={showWalletModal}
          onClose={() => setShowWalletModal(false)}
        />
      )}

      {showTransactionModal && (
        <TransactionModal
          isOpen={showTransactionModal}
          onClose={() => setShowTransactionModal(false)}
        />
      )}
    </div>
  );
};

export default Header;
