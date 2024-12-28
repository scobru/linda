import React from "react";
import { acceptFriendRequest, rejectFriendRequest } from "linda-protocol";
import { toast } from "react-hot-toast";

const FriendRequest = ({ request, onRequestProcessed }) => {
  const [isLoading, setIsLoading] = React.useState(false);
  const [isCompleted, setIsCompleted] = React.useState(false);
  const [userInfo, setUserInfo] = React.useState({
    displayName:
      request.alias || request.senderInfo?.alias || "Utente sconosciuto",
    username: "",
    nickname: "",
  });

  const handleAccept = async () => {
    try {
      setIsLoading(true);
      console.log("Accettazione richiesta:", request);
      await acceptFriendRequest(request);
      toast.success("Richiesta accettata con successo");
      onRequestProcessed(request.id, "accept");
      setIsCompleted(true);
    } catch (error) {
      console.error("Errore accettazione richiesta:", error);
      toast.error(error.message || "Errore nell'accettare la richiesta");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    try {
      setIsLoading(true);
      console.log("Rifiuto richiesta:", request);
      await rejectFriendRequest(request);
      toast.success("Richiesta rifiutata");
      onRequestProcessed(request.id, "reject");
      setIsCompleted(true);
    } catch (error) {
      console.error("Errore rifiuto richiesta:", error);
      toast.error(error.message || "Errore nel rifiutare la richiesta");
    } finally {
      setIsLoading(false);
    }
  };

  if (isCompleted) {
    return null;
  }

  return (
    <div className="flex items-center justify-between p-3 bg-[#2D325A] rounded-lg shadow-md mb-2 border border-[#4A4F76]">
      <div className="flex items-center space-x-3">
        <div className="flex-shrink-0">
          <img
            className="h-10 w-10 rounded-full"
            src={`https://api.dicebear.com/7.x/bottts/svg?seed=${userInfo.displayName}&backgroundColor=b6e3f4`}
            alt=""
          />
        </div>
        <div>
          <p className="text-sm font-medium text-white">
            {userInfo.displayName}
          </p>
          <p className="text-xs text-gray-400">Vuole aggiungerti come amico</p>
        </div>
      </div>
      <div className="flex space-x-2">
        <button
          onClick={handleAccept}
          disabled={isLoading}
          className="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
        >
          {isLoading ? (
            <div className="flex items-center">
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
              Accettazione...
            </div>
          ) : (
            "Accetta"
          )}
        </button>
        <button
          onClick={handleReject}
          disabled={isLoading}
          className="px-3 py-1 text-sm font-medium text-gray-300 bg-[#4A4F76] rounded-md hover:bg-[#5A5F86] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 transition-colors"
        >
          {isLoading ? (
            <div className="flex items-center">
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
              Rifiuto...
            </div>
          ) : (
            "Rifiuta"
          )}
        </button>
      </div>
    </div>
  );
};

export default FriendRequest;
