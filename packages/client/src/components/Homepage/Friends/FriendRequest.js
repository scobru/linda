import React from "react";
import Avatar from "../../../components/Avatar";

const FriendRequest = ({ request, onProcess }) => {
  const handleAccept = () => {
    onProcess(request.id, "accept");
  };

  const handleReject = () => {
    onProcess(request.id, "reject");
  };

  return (
    <div className="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
      <div className="flex items-center space-x-3">
        <Avatar seed={request.avatarSeed || request.from} size={40} />
        <div>
          <div className="font-medium dark:text-white">
            {request.displayName || request.username || request.from}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {request.username}
          </div>
        </div>
      </div>
      <div className="flex space-x-2">
        <button
          onClick={handleAccept}
          className="px-3 py-1 text-sm font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Accetta
        </button>
        <button
          onClick={handleReject}
          className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 dark:text-gray-200 dark:bg-gray-600 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          Rifiuta
        </button>
      </div>
    </div>
  );
};

export default FriendRequest;
