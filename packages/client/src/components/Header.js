import { ConnectButton } from "@rainbow-me/rainbowkit";
import AppStatus from "./AppStatus";
import Profile from "./Homepage/Profile";

export default function Header({
  onProfileUpdate,
  onAddClick,
  onWalletClick,
  onTransactionClick,
  onProfileClick,
  activeView,
}) {
  return (
    <header className="flex items-center justify-between px-4 py-2 bg-[#373B5C] border-b border-[#4A4F76]">
      <div className="flex items-center space-x-4">
        <h1 className="text-xl font-semibold text-white">linda</h1>
        <div className="flex items-center space-x-1">
          <span className="w-2 h-2 bg-green-400 rounded-full"></span>
          <span className="text-sm text-gray-300">Online</span>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={onProfileClick}
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
          onClick={onWalletClick}
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
          onClick={onTransactionClick}
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
          onClick={onAddClick}
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
      </div>
    </header>
  );
}
