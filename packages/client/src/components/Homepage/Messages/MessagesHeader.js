import React from "react";
import { toast } from "react-hot-toast";

const MessagesHeader = ({
  selected,
  isMobileView,
  onBack,
  chatUserInfo,
  chatUserAvatar,
  authorizedMembers,
  appState,
  handleUpdateChannelAvatar,
  handleUpdateBoardAvatar,
  handleDeleteBoard,
  handleLeaveBoard,
  handleDeleteChannel,
  handleLeaveChannel,
  setIsWalletModalOpen,
  handleClearChat,
  handleUnblock,
  isBlocked,
}) => {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-[#373B5C] border-b border-[#4A4F76] sticky top-0 z-10">
      <div className="flex items-center">
        {isMobileView && (
          <button
            onClick={onBack}
            className="mr-2 p-1.5 hover:bg-[#4A4F76] rounded-full"
            aria-label="Torna indietro"
          >
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        )}
        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
          {selected.type === "board" ? (
            selected.avatar ? (
              <img
                src={selected.avatar}
                alt={selected.name}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="text-white text-lg font-semibold">
                {selected.name?.charAt(0).toUpperCase()}
              </span>
            )
          ) : selected.type === "channel" ? (
            selected.avatar ? (
              <img
                src={selected.avatar}
                alt={selected.name}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="text-white text-lg font-semibold">
                {selected.name?.charAt(0).toUpperCase()}
              </span>
            )
          ) : chatUserAvatar ? (
            <img
              className="w-full h-full rounded-full object-cover"
              src={chatUserAvatar}
              alt="Avatar"
            />
          ) : (
            <img
              className="w-full h-full rounded-full"
              src={`https://api.dicebear.com/7.x/bottts/svg?seed=${chatUserInfo.displayName}&backgroundColor=b6e3f4`}
              alt="Avatar predefinito"
            />
          )}
        </div>
        <div className="ml-3 flex items-center">
          <div>
            <p className="text-white font-medium">
              {selected.type === "board"
                ? selected.name || "Board"
                : selected.type === "channel"
                ? selected.name
                : chatUserInfo.displayName}
            </p>
            {selected.type === "board" && (
              <p className="text-gray-300 text-sm flex items-center gap-2">
                <span>
                  Creata da:{" "}
                  {selected.creator === appState.user.is.pub
                    ? "Te"
                    : selected.creatorAlias || "Sconosciuto"}
                </span>
                <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                <span title="Numero di membri">
                  {Object.keys(authorizedMembers).length}{" "}
                  {Object.keys(authorizedMembers).length === 1
                    ? "membro"
                    : "membri"}
                </span>
              </p>
            )}
            {selected.type !== "channel" &&
              selected.type !== "board" &&
              chatUserInfo.username && (
                <p className="text-gray-300 text-sm">
                  @{chatUserInfo.username}
                </p>
              )}
          </div>
          {(selected.type === "channel" || selected.type === "board") &&
            selected.creator === appState.user.is.pub && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (file) {
                      if (file.size > 2 * 1024 * 1024) {
                        toast.error("L'immagine non può superare i 2MB");
                        return;
                      }
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        if (selected.type === "channel") {
                          handleUpdateChannelAvatar(
                            selected.roomId,
                            reader.result
                          );
                        } else {
                          handleUpdateBoardAvatar(
                            selected.roomId,
                            reader.result
                          );
                        }
                      };
                      reader.readAsDataURL(file);
                    }
                  };
                  input.click();
                }}
                className="ml-2 p-2 rounded-full text-gray-400 hover:text-white hover:bg-[#4A4F76]"
                title="Cambia avatar"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </button>
            )}
        </div>
      </div>
      <div className="flex items-center space-x-2">
        {selected.type === "board" && (
          <>
            {selected.creator === appState.user.is.pub ? (
              <button
                onClick={handleDeleteBoard}
                className="p-2 rounded-full text-red-500 hover:bg-[#4A4F76]"
                title="Elimina board"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            ) : (
              <button
                onClick={() => handleLeaveBoard(selected.roomId)}
                className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-[#4A4F76] transition-colors"
                title="Esci dalla board"
              >
                <svg
                  className="w-5 h-5"
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
            )}
          </>
        )}
        {selected.type === "channel" && (
          <>
            {selected.creator === appState.user.is.pub ? (
              <button
                onClick={handleDeleteChannel}
                className="p-2 rounded-full text-red-500 hover:bg-[#4A4F76]"
                title="Elimina canale"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleLeaveChannel}
                className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-[#4A4F76] transition-colors"
                title="Esci dal canale"
              >
                <svg
                  className="w-5 h-5"
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
            )}
          </>
        )}
        {(!selected.type || selected.type === "global" || selected.pub) && (
          <button
            onClick={() => setIsWalletModalOpen(true)}
            className="p-2 rounded-full text-white hover:bg-[#4A4F76]"
            title="Invia mancia"
          >
            <svg
              className="w-5 h-5"
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
        )}
        <button
          onClick={handleClearChat}
          className="p-2 rounded-full text-white hover:bg-[#4A4F76]"
          title="Cancella messaggi"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
        {isBlocked && (
          <button
            onClick={handleUnblock}
            className="p-2 rounded-full text-white hover:bg-[#4A4F76]"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default MessagesHeader;
