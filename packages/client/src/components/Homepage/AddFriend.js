import React from "react";
import { friends } from "linda-protocol";
import toast from "react-hot-toast";
import { gun, user } from "linda-protocol";

export default function AddFriend({ onClose }) {
  const [input, setInput] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [searchResult, setSearchResult] = React.useState(null);

  // Function to search for user
  const searchUser = async (value) => {
    // If the value looks like a public key, return it directly
    if (value.includes(".")) {
      const result = await gun.get("~" + value).get("alias");
      console.log("Result:", result);
      return {
        pub: value,
        alias: result,
      };
    }

    return new Promise((resolve) => {
      gun.get(`~@${value}`).once((data) => {
        if (data) {
          // Find the key that starts with ~
          const pubKey = Object.keys(data).find((key) => key.startsWith("~"));
          if (pubKey) {
            resolve({
              pub: pubKey.slice(1), // Remove initial ~
              alias: value,
            });
          } else {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    });
  };

  const handleSubmit = async () => {
    if (!input.trim()) {
      toast.error("Please enter a username");
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading("Searching user...");

    try {
      // First search for the user
      const userData = await searchUser(input.trim());
      console.log("User search result:", userData);

      if (!userData) {
        throw new Error("User not found");
      }

      setSearchResult(userData);

      // Send friend request
      await new Promise((resolve, reject) => {
        friends.addFriendRequest(userData.alias, (response) => {
          console.log("Friend request response:", response);
          if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.errMessage || "Error sending request"));
          }
        });
      });

      toast.success("Request sent successfully", { id: toastId });
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error) {
      console.error("Error:", error);
      toast.error(error.message || "Operation failed", { id: toastId });
      setSearchResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4">
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Enter username
        </label>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && !isLoading && input.trim() && handleSubmit()
          }
          placeholder="Enter username..."
          disabled={isLoading}
          className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            isLoading ? "bg-gray-100 cursor-not-allowed" : ""
          }`}
        />
      </div>

      {searchResult && (
        <div className="mb-4 p-2 bg-gray-50 rounded">
          <p className="text-sm">User found: {searchResult.alias}</p>
          <p className="text-xs text-gray-500 truncate">
            ID: {searchResult.pub}
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          disabled={isLoading}
          className={`px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors ${
            isLoading ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={isLoading || !input.trim()}
          className={`px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors ${
            isLoading || !input.trim() ? "opacity-50 cursor-not-allowed" : ""
          }`}
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
              {searchResult ? "Sending request..." : "Searching..."}
            </div>
          ) : searchResult ? (
            "Send request"
          ) : (
            "Search"
          )}
        </button>
      </div>
    </div>
  );
}
