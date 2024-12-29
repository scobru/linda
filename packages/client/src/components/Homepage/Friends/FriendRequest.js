import React, { useState } from "react";
import Avatar from "../../../components/Avatar";

const FriendRequest = ({ request, onProcess }) => {
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      await onProcess(request.id, "accept");
    } finally {
      setIsAccepting(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await onProcess(request.id, "reject");
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
      <div className="flex items-center space-x-3">
        <Avatar seed={request.avatarSeed || request.from} size={40} />
        <div>
          <div className="font-medium dark:text-white">
            {request.displayName ||
              request.alias ||
              request.username ||
              request.from.slice(0, 8) + "..."}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {request.username || "Utente Linda"}
          </div>
        </div>
      </div>
      <div className="flex space-x-2">
        <button
          onClick={handleAccept}
          disabled={isAccepting || isRejecting}
          className={`px-3 py-1 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            isAccepting
              ? "bg-blue-400 cursor-not-allowed"
              : "bg-blue-500 hover:bg-blue-600"
          }`}
        >
          {isAccepting ? (
            <span className="flex items-center">
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Accettando...
            </span>
          ) : (
            "Accetta"
          )}
        </button>
        <button
          onClick={handleReject}
          disabled={isAccepting || isRejecting}
          className={`px-3 py-1 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 ${
            isRejecting
              ? "bg-gray-400 text-gray-200 cursor-not-allowed"
              : "text-gray-700 bg-gray-200 hover:bg-gray-300 dark:text-gray-200 dark:bg-gray-600 dark:hover:bg-gray-500"
          }`}
        >
          {isRejecting ? (
            <span className="flex items-center">
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Rifiutando...
            </span>
          ) : (
            "Rifiuta"
          )}
        </button>
      </div>
    </div>
  );
};

export default FriendRequest;
