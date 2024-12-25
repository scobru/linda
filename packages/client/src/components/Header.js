import { ConnectButton } from "@rainbow-me/rainbowkit";
import AppStatus from "./AppStatus";
import Profile from "./Homepage/Profile";

function Header({
  onProfileUpdate,
  onAddClick,
  onWalletClick,
  onTransactionClick,
  onProfileClick,
  activeView,
}) {
  return (
    <header className="w-full bg-[#2B6BED] text-white">
      <div className="w-full px-2 md:px-4">
        <div className="flex justify-between items-center h-12 md:h-14">
          {/* Logo e titolo */}
          <div className="flex items-center">
            <h1 className="text-lg md:text-xl font-semibold">linda</h1>
          </div>

          {/* Elementi centrali */}
          <div className="flex items-center space-x-2 md:space-x-4">
            <div className="hidden md:block">
              <AppStatus />
            </div>

            {/* Pulsanti di azione */}
            <div className="flex items-center space-x-1 md:space-x-2">
              <button
                onClick={onProfileClick}
                className="p-1.5 md:p-2 text-white hover:bg-[#245acc] rounded-full transition-colors"
                title="Modifica profilo"
              >
                <svg
                  className="w-4 h-4 md:w-5 md:h-5"
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
                className="p-1.5 md:p-2 text-white hover:bg-[#245acc] rounded-full transition-colors"
                title="Apri Wallet"
              >
                <svg
                  className="w-4 h-4 md:w-5 md:h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </button>

              <button
                onClick={onTransactionClick}
                className="p-1.5 md:p-2 text-white hover:bg-[#245acc] rounded-full transition-colors"
                title="Visualizza Transazioni"
              >
                <svg
                  className="w-4 h-4 md:w-5 md:h-5"
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
                className="p-1.5 md:p-2 text-white hover:bg-[#245acc] rounded-full transition-colors"
                title={
                  activeView === "chats" ? "Aggiungi amico" : "Crea gruppo"
                }
              >
                <svg
                  className="w-4 h-4 md:w-5 md:h-5"
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
          </div>

          {/* Elementi a destra */}
          <div className="flex items-center">
            <div className="w-[100px] md:w-[140px]">
              <ConnectButton
                accountStatus={"avatar"}
                showBalance={false}
                label="Connect"
              />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
