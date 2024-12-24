import React, {
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
} from "react";
import Context from "../../contexts/context";
import { toast, Toaster } from "react-hot-toast";
import { AiOutlineSend } from "react-icons/ai";
import { messaging, blocking } from "linda-protocol";
import { gun, user, notifications, DAPP_NAME } from "linda-protocol";
import { userUtils } from "linda-protocol";
import { createMessagesCertificate } from "linda-protocol";
import { walletService } from "linda-protocol";
import { formatEther } from "ethers";
import { ethers } from "ethers";

const { userBlocking } = blocking;
const { channels } = messaging;
const { chat } = messaging;

// Custom hook for the intersection observer
const useIntersectionObserver = (callback, deps = []) => {
  const observer = React.useRef(null);

  React.useEffect(() => {
    observer.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            callback(entry.target.dataset.messageId);
          }
        });
      },
      { threshold: 0.5 }
    );

    return () => {
      if (observer.current) {
        observer.current.disconnect();
      }
    };
  }, deps);

  return observer.current;
};

// Custom hook for message receipts
const useMessageReceipts = (messageId, roomId) => {
  const [status, setStatus] = React.useState({ delivered: false, read: false });

  React.useEffect(() => {
    if (!messageId || !roomId) return;

    // const unsub = gun.get(`chats/${roomId}/receipts`)
    //   .get(messageId)
    //   .on((receipt) => {
    //     if (receipt) {
    //       setStatus({
    //         delivered: receipt.type === 'delivery' || receipt.type === 'read',
    //         read: receipt.type === 'read'
    //       });
    //     }
    //   });

    console.log(notifications.messageNotifications);

    const unsub = notifications.messageNotifications
      .observeReadReceipts(messageId, roomId)
      .subscribe((receipt) => {
        setStatus({
          delivered: receipt.type === "delivery" || receipt.type === "read",
          read: receipt.type === "read",
        });
      });

    // Initial state check
    gun
      .get(`chats/${roomId}/receipts`)
      .get(messageId)
      .once((receipt) => {
        if (receipt) {
          setStatus({
            delivered: receipt.type === "delivery" || receipt.type === "read",
            read: receipt.type === "read",
          });
        }
      });

    return () => {
      if (typeof unsub === "function") {
        try {
          unsub();
        } catch (error) {
          console.warn("Error unsubscribing from receipts:", error);
        }
      }
    };
  }, [messageId, roomId]);

  return {
    status,
    setStatus,
    initMessageTracking: async () => {
      if (!user.is) return;
      await gun.get(`chats/${roomId}/receipts`).get(messageId).put({
        type: "sent",
        timestamp: Date.now(),
        by: user.is.pub,
      });
    },
  };
};

// Custom hook for sending receipts
const useSendReceipt = () => {
  const sendReceipt = React.useCallback(async (messageId, roomId, type) => {
    if (!user.is || !messageId || !roomId) return;

    try {
      await gun.get(`chats/${roomId}/receipts`).get(messageId).put({
        type,
        timestamp: Date.now(),
        by: user.is.pub,
      });
    } catch (error) {
      console.warn(`Error sending ${type} receipt:`, error);
    }
  }, []);

  return {
    sendDeliveryReceipt: (messageId, roomId) =>
      sendReceipt(messageId, roomId, "delivery"),
    sendReadReceipt: (messageId, roomId) =>
      sendReceipt(messageId, roomId, "read"),
  };
};

// Single MessageStatus component combining both functionalities
const MessageStatus = ({ message }) => {
  const { selected } = React.useContext(Context);
  const { status } = useMessageReceipts(message.id, selected?.roomId);
  const { sendDeliveryReceipt, sendReadReceipt } = useSendReceipt();

  React.useEffect(() => {
    if (message && message.sender !== user.is.pub && !status.read) {
      sendDeliveryReceipt(message.id, selected?.roomId);
      sendReadReceipt(message.id, selected?.roomId);
    }
  }, [
    message,
    status.read,
    selected?.roomId,
    sendDeliveryReceipt,
    sendReadReceipt,
  ]);

  return (
    <span className="text-xs ml-1 flex">
      {!status.delivered && <span className="text-gray-400">✓</span>}
      {status.delivered && !status.read && (
        <span className="text-gray-400">✓✓</span>
      )}
      {status.read && <span className="text-blue-500">✓✓</span>}
    </span>
  );
};

// Modifica createMessageTracking per includere tutti i metodi necessari
const createMessageTracking = () => ({
  initMessageTracking: async (messageId, roomId) => {
    if (!user.is) return;
    await gun.get("chats").get(roomId).get("receipts").get(messageId).put({
      type: "sent",
      timestamp: Date.now(),
      by: user.is.pub,
    });
  },

  updateMessageStatus: async (messageId, roomId, status) => {
    if (!user.is || !messageId || !roomId) return;
    try {
      await gun.get("chats").get(roomId).get("receipts").get(messageId).put({
        type: status,
        timestamp: Date.now(),
        by: user.is.pub,
      });
    } catch (error) {
      console.warn(`Error updating message status to ${status}:`, error);
    }
  },

  observeMessageStatus: (messageId, roomId) => {
    return new Observable((subscriber) => {
      if (!messageId || !roomId) {
        subscriber.complete();
        return;
      }

      const handler = gun
        .get("chats")
        .get(roomId)
        .get("receipts")
        .get(messageId)
        .on((receipt) => {
          if (receipt) {
            subscriber.next({
              delivered: receipt.type === "delivery" || receipt.type === "read",
              read: receipt.type === "read",
              timestamp: receipt.timestamp,
              by: receipt.by,
            });
          }
        });

      return () => {
        if (typeof handler === "function") {
          handler();
        }
      };
    });
  },

  observeReadReceipts: (messageId, roomId) => {
    return new Observable((subscriber) => {
      if (!messageId || !roomId) {
        subscriber.complete();
        return;
      }

      const handler = gun
        .get("chats")
        .get(roomId)
        .get("receipts")
        .get(messageId)
        .on((receipt) => {
          if (receipt && receipt.type === "read") {
            subscriber.next(receipt);
          }
        });

      return () => {
        if (typeof handler === "function") {
          handler();
        }
      };
    });
  },
});

// Add this function to get the username
const getUserUsername = async (userPub) => {
  return new Promise((resolve) => {
    gun
      .get(DAPP_NAME)
      .get("userList")
      .get("nicknames")
      .get(userPub)
      .once((nickname) => {
        resolve(nickname);
      });
    // Timeout after 2 seconds, use alias as fallback
    setTimeout(() => resolve(null), 2000);
  });
};

// Modify MessageItem component to better handle layout and truncated text
const MessageItem = ({
  message,
  isOwnMessage,
  showSender,
  user,
  messageObserver,
  handleDeleteMessage,
  selected,
}) => {
  const [senderName, setSenderName] = React.useState("");
  const { selected: selectedContext } = React.useContext(Context);
  const isCreator = selectedContext?.creator === user.is.pub;

  const shouldShowSender =
    selected?.type === "board" || selected?.type === "channel" || showSender;

  React.useEffect(() => {
    if (shouldShowSender && !isOwnMessage) {
      getUserUsername(message.sender).then((username) => {
        if (username) {
          setSenderName(username);
        }
      });
    }
  }, [message.sender, shouldShowSender, isOwnMessage]);

  return (
    <div
      ref={(el) => {
        if (el && messageObserver) {
          el.dataset.messageId = message.id;
          messageObserver.observe(el);
        }
      }}
      className={`flex flex-col ${
        isOwnMessage ? "items-end" : "items-start"
      } mb-4 max-w-[85%] ${isOwnMessage ? "ml-auto" : "mr-auto"}`}
    >
      {/* Message header with sender and timestamp */}
      {shouldShowSender && (
        <div className="flex items-center mb-1">
          <div className="w-8 h-8 rounded-full flex-shrink-0">
            <img
              className="w-full h-full rounded-full"
              src={`https://api.dicebear.com/7.x/bottts/svg?seed=${senderName}&backgroundColor=b6e3f4`}
              alt=""
            />
          </div>
          <div className="ml-2 flex flex-col">
            <span className="text-sm text-gray-600 font-medium break-words">
              {isOwnMessage ? "You" : senderName}
            </span>
            <span className="text-xs text-gray-400">
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
      )}

      {/* Message content */}
      <div className="flex items-end w-full">
        <div
          className={`rounded-lg px-4 py-2 break-words ${
            isOwnMessage
              ? "bg-blue-500 text-white rounded-br-none ml-auto"
              : "bg-gray-200 rounded-bl-none"
          } max-w-full`}
        >
          <span className="whitespace-pre-wrap">
            {typeof message.content === "string"
              ? message.content
              : "[Invalid message]"}
          </span>
        </div>
        {isOwnMessage && <MessageStatus message={message} />}
      </div>

      {/* Delete button */}
      {isCreator && selected?.type === "board" && (
        <button
          onClick={() => handleDeleteMessage(message.id)}
          className="text-red-500 text-xs hover:text-red-700 mt-1"
        >
          Delete
        </button>
      )}
    </div>
  );
};

// Add these message handling functions
const handleMessages = (data) => {
  if (!isSubscribed) return;

  if (data.initial) {
    const validMessages = (data.initial || []).filter(
      (msg) => msg && msg.content && msg.sender && msg.timestamp
    );

    const processedMessages =
      selected.type === "friend"
        ? validMessages.map((msg) =>
            messageList.decryptMessage(msg, msg.sender)
          )
        : validMessages;

    Promise.all(processedMessages).then((decryptedMessages) => {
      setMessages(decryptedMessages);
      setLoading(false);
    });
  }
};

const handleError = (error) => {
  if (!isSubscribed) return;
  console.error("Error loading messages:", error);
  setError("Error loading messages");
  setLoading(false);
};

// Modify the WalletModal component
const WalletModal = ({ isOpen, onClose, onSend, selectedUser }) => {
  const [amount, setAmount] = useState("");
  const [customAddress, setCustomAddress] = useState("");
  const [sendType, setSendType] = useState("contact");
  const [isLoading, setIsLoading] = useState(false);
  const [myWalletInfo, setMyWalletInfo] = useState(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [recipientWalletInfo, setRecipientWalletInfo] = useState(null);
  const [balance, setBalance] = useState(null);
  const [selectedChain, setSelectedChain] = useState(null);
  const [availableChains, setAvailableChains] = useState({});
  const [isStealthMode, setIsStealthMode] = useState(false);

  // Load available chains and wallet info
  React.useEffect(() => {
    const loadChainInfo = async () => {
      try {
        const chains = walletService.getSupportedChains();
        setAvailableChains(chains);
        const currentChain = walletService.getCurrentChain();
        setSelectedChain(currentChain);
      } catch (error) {
        console.error("Error loading chain info:", error);
        toast.error("Error loading chain information");
      }
    };

    if (isOpen) {
      loadChainInfo();
    }
  }, [isOpen]);

  // Load wallet info when chain changes
  React.useEffect(() => {
    const loadWalletInfo = async () => {
      try {
        if (!selectedChain) return;

        // Load the wallet for current chain
        const wallet = await walletService.getCurrentWallet(user.is.pub);
        setMyWalletInfo(wallet);

        // Verify that the address is valid before loading balance
        if (wallet?.hasValidAddress && wallet.internalWalletAddress) {
          try {
            const provider = new ethers.JsonRpcProvider(selectedChain.rpcUrl);
            const balance = await provider.getBalance(
              wallet.internalWalletAddress
            );
            setBalance(formatEther(balance));
          } catch (error) {
            console.error("Error loading balance:", error);
            setBalance("0.0");
          }
        } else {
          console.log("Wallet without valid address:", wallet);
          setBalance("0.0");
        }

        // Load recipient info if available
        if (selectedUser?.pub) {
          try {
            const recipientAddress = await walletService.getUserWalletAddress(
              selectedUser.pub
            );
            if (recipientAddress) {
              setRecipientWalletInfo({
                address: recipientAddress,
                type: "derived",
              });
            }
          } catch (error) {
            console.error("Error loading recipient info:", error);
          }
        }
      } catch (error) {
        console.error("Error loading wallet info:", error);
        toast.error("Error loading wallet information");
      }
    };

    if (isOpen && selectedChain && user.is?.pub) {
      loadWalletInfo();
    }
  }, [isOpen, selectedChain, selectedUser?.pub, user.is?.pub]);

  // Cleanup function in WalletModal
  React.useEffect(() => {
    return () => {
      // Clean only the component's local state
      setMyWalletInfo(null);
      setBalance(null);
      setSelectedChain(null);
    };
  }, []);

  // Modify handleChainChange to update only the current wallet
  const handleChainChange = async (chainKey) => {
    try {
      setIsLoading(true);
      await walletService.setChain(chainKey);
      const newChain = walletService.getCurrentChain();
      setSelectedChain(newChain);

      // Reload wallet info
      const wallet = await walletService.getCurrentWallet(user.is.pub);
      setMyWalletInfo(wallet);

      // Verify that the address is valid before updating balance
      if (wallet?.hasValidAddress && wallet.internalWalletAddress) {
        try {
          const provider = new ethers.JsonRpcProvider(newChain.rpcUrl);
          const balance = await provider.getBalance(
            wallet.internalWalletAddress
          );
          setBalance(formatEther(balance));
        } catch (error) {
          console.error("Error loading balance:", error);
          setBalance("0.0");
        }
      } else {
        console.log("Wallet without valid address:", wallet);
        setBalance("0.0");
      }

      toast.success(`Switched to ${newChain.name}`);
    } catch (error) {
      console.error("Error changing chain:", error);
      toast.error("Error switching chain");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyAddress = () => {
    if (myWalletInfo?.address) {
      navigator.clipboard.writeText(myWalletInfo.address);
      toast.success("Address copied to clipboard!");
    }
  };

  const handleCopyPrivateKey = () => {
    if (myWalletInfo?.privateKey) {
      navigator.clipboard.writeText(myWalletInfo.privateKey);
      toast.success("Private key copied to clipboard!");
    }
  };

  const handleSend = async () => {
    try {
      setIsLoading(true);

      if (!selectedChain) {
        throw new Error("Please select a chain first");
      }

      if (sendType === "contact") {
        await onSend(selectedUser.pub, amount, isStealthMode);
      } else {
        await walletService.sendTransaction(customAddress, amount);
      }

      toast.success("Transaction sent successfully!");
      onClose();
      setAmount("");
      setCustomAddress("");
      setIsStealthMode(false);
    } catch (error) {
      console.error("Error sending transaction:", error);
      toast.error(error.message || "Error during transaction");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 max-w-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Wallet</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Chain Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Select Chain
          </label>
          <select
            value={selectedChain?.name || ""}
            onChange={(e) => handleChainChange(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={isLoading}
          >
            {Object.keys(availableChains).map((chainKey) => (
              <option key={chainKey} value={chainKey}>
                {availableChains[chainKey].name}
              </option>
            ))}
          </select>
        </div>

        {/* My wallet */}
        {myWalletInfo ? (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Your Wallet
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Address:</span>
                <div className="flex items-center">
                  <span className="text-xs font-mono mr-2">
                    {myWalletInfo.internalWalletAddress
                      ? `${myWalletInfo.internalWalletAddress.slice(
                          0,
                          6
                        )}...${myWalletInfo.internalWalletAddress.slice(-4)}`
                      : "Loading..."}
                  </span>
                  <button
                    onClick={() => {
                      if (myWalletInfo.internalWalletAddress) {
                        navigator.clipboard.writeText(
                          myWalletInfo.internalWalletAddress
                        );
                        toast.success("Address copied!");
                      }
                    }}
                    className="p-1 hover:bg-gray-200 rounded"
                    disabled={!myWalletInfo.internalWalletAddress}
                  >
                    <svg
                      className="w-4 h-4 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Balance:</span>
                <span className="text-xs font-medium">
                  {balance
                    ? `${Number(balance).toFixed(8)} ${
                        selectedChain?.nativeCurrency?.symbol || "MATIC"
                      }`
                    : "Loading..."}
                </span>
              </div>

              {myWalletInfo.internalWalletPk && (
                <div className="mt-2">
                  <button
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                    className="text-xs text-blue-500 hover:text-blue-600"
                  >
                    {showPrivateKey ? "Hide" : "Show"} private key
                  </button>
                  {showPrivateKey && (
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs font-mono truncate max-w-[180px]">
                        {myWalletInfo.internalWalletPk}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            myWalletInfo.internalWalletPk
                          );
                          toast.success("Private key copied!");
                        }}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        <svg
                          className="w-4 h-4 text-gray-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                          />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg flex justify-center">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        )}

        {/* Send section */}
        <div className="mt-6">
          <h4 className="text-lg font-medium mb-4">
            Send {selectedChain?.symbol}
          </h4>

          <div className="space-y-4">
            {/* Send type selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Send to
              </label>
              <div className="flex space-x-2">
                <button
                  onClick={() => setSendType("contact")}
                  className={`flex-1 py-2 px-4 rounded-lg ${
                    sendType === "contact"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  Contact
                </button>
                <button
                  onClick={() => setSendType("address")}
                  className={`flex-1 py-2 px-4 rounded-lg ${
                    sendType === "address"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  Address
                </button>
              </div>
            </div>

            {/* Recipient info */}
            {sendType === "contact" ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recipient
                </label>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="font-medium">{selectedUser?.username}</div>
                  {recipientWalletInfo?.address && (
                    <div className="text-sm text-gray-500 truncate">
                      {recipientWalletInfo.address}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recipient Address
                </label>
                <input
                  type="text"
                  value={customAddress}
                  onChange={(e) => setCustomAddress(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Enter wallet address..."
                />
              </div>
            )}

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg pr-16"
                  placeholder="0.0"
                />
                <span className="absolute right-3 top-2 text-gray-500">
                  {selectedChain?.symbol}
                </span>
              </div>
            </div>

            {/* Stealth mode toggle */}
            {sendType === "contact" && (
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={isStealthMode}
                  onChange={(e) => setIsStealthMode(e.target.checked)}
                  className="mr-2"
                />
                <label className="text-sm text-gray-700">Stealth mode</label>
              </div>
            )}

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={
                isLoading ||
                !amount ||
                (sendType === "address" && !customAddress) ||
                (sendType === "contact" && !recipientWalletInfo?.address)
              }
              className={`w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 
                ${
                  isLoading ||
                  !amount ||
                  (sendType === "address" && !customAddress) ||
                  (sendType === "contact" && !recipientWalletInfo?.address)
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }`}
            >
              {isLoading ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function Messages({ chatData, isMobileView, onBack }) {
  const { selected, setCurrentChat, setSelected } = React.useContext(Context);
  const [messages, setMessages] = React.useState([]);
  const [newMessage, setNewMessage] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const messagesEndRef = React.useRef(null);
  const messageSubscriptionRef = React.useRef(null);
  const toastIdRef = React.useRef(null);
  const [isBlocked, setIsBlocked] = React.useState(false);
  const [canSendMessages, setCanSendMessages] = React.useState(true);
  const [showChatMenu, setShowChatMenu] = React.useState(false);
  const [blockStatus, setBlockStatus] = React.useState({
    blockedByMe: false,
    blockedByOther: false,
  });
  const blockCheckTimeoutRef = React.useRef(null);
  const lastBlockCheckRef = React.useRef(null);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [canWrite, setCanWrite] = React.useState(false);
  const [isInitializing, setIsInitializing] = React.useState(true);
  const [isSubscribing, setIsSubscribing] = React.useState(false);
  const previousRoomIdRef = React.useRef(null);
  const [isSubscribed, setIsSubscribed] = React.useState(true);
  const [shouldScrollToBottom, setShouldScrollToBottom] = React.useState(true);
  const lastMessageRef = React.useRef(null);
  const [displayName, setDisplayName] = React.useState("");
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [oldestMessageTimestamp, setOldestMessageTimestamp] = useState(
    Date.now()
  );
  const messagesContainerRef = useRef(null);
  const [chatUserInfo, setChatUserInfo] = React.useState({
    displayName: selected?.name || "Loading...",
    username: "",
    nickname: "",
  });

  // Usa useMemo per creare una singola istanza del messageTracking
  const messageTracking = useMemo(() => createMessageTracking(), []);

  // Effetto per verificare i permessi di scrittura
  useEffect(() => {
    const checkPermissions = async () => {
      if (!chatData || !user?.is) {
        setCanWrite(false);
        return;
      }

      try {
        // If it's a private chat
        if (!chatData.type || chatData.type === "friend") {
          const messageCert = await gun
            .get(DAPP_NAME)
            .get("certificates")
            .get(
              chatData.user1 === user.is.pub ? chatData.user2 : chatData.user1
            )
            .get("messages")
            .then();

          if (!messageCert) {
            const otherPub =
              chatData.user1 === user.is.pub ? chatData.user2 : chatData.user1;
            const cert = await createMessagesCertificate(otherPub);
            setCanWrite(!!cert);
          } else {
            setCanWrite(true);
          }
        }
        // If it's a channel or board
        else if (chatData.type === "channel" || chatData.type === "board") {
          // If creator, can always write
          if (chatData.creator === user?.is?.pub) {
            setCanWrite(true);
            return;
          }

          // If channel, only creator can write
          if (chatData.type === "channel") {
            setCanWrite(chatData.creator === user.is.pub);
            return;
          }

          // If board, all members can write
          if (chatData.type === "board") {
            setCanWrite(true);
          }
        }
      } catch (error) {
        console.error("Error checking permissions:", error);
        setCanWrite(false);
      }
    };

    checkPermissions();
  }, [chatData, user?.is]);

  // Use useCallback for functions that shouldn't be recreated
  const handleMessageVisible = useCallback(
    (messageId) => {
      if (!selected?.pub || !selected?.roomId) return;
      const message = messages.find((m) => m.id === messageId);
      if (message && message.sender !== user.is.pub && !message.read) {
        messageTracking.updateMessageStatus(messageId, selected.roomId, "read");
      }
    },
    [selected?.pub, selected?.roomId, messages]
  );

  // Create the observer for messages
  const messageObserver = useIntersectionObserver(handleMessageVisible, [
    selected?.pub,
    selected?.roomId,
  ]);

  // Modify the loadMoreMessages function
  const loadMoreMessages = async () => {
    if (isLoadingMore || !hasMoreMessages) return;

    try {
      setIsLoadingMore(true);

      let path;
      let id;

      if (selected.type === "friend") {
        path = "chats";
        id = selected.roomId;
      } else if (selected.type === "channel") {
        path = "channels";
        id = selected.id;
      } else if (selected.type === "board") {
        path = "boards";
        id = selected.id;
      }

      // Use configurable limit from messageList
      const olderMessages = await messaging.chat.messageList.loadMessages(
        path,
        id,
        null, // Use default limit configured in messageList
        oldestMessageTimestamp
      );

      if (olderMessages.length === 0) {
        setHasMoreMessages(false);
        return;
      }

      // Process messages as before
      let processedMessages = [];
      if (selected.type === "friend") {
        processedMessages = await Promise.all(
          olderMessages.map(async (msg) => {
            try {
              if (
                typeof msg.content !== "string" ||
                !msg.content.startsWith("SEA{")
              )
                return msg;
              return await messaging.chat.messageList.decryptMessage(
                msg,
                selected.pub
              );
            } catch (error) {
              console.warn("Error decrypting message:", error);
              return {
                ...msg,
                content: "[Decryption key not found]",
              };
            }
          })
        );
      } else {
        processedMessages = olderMessages;
      }

      // Update oldest message timestamp
      const newOldestTimestamp = Math.min(
        ...processedMessages.map((msg) => msg.timestamp)
      );
      setOldestMessageTimestamp(newOldestTimestamp);

      // Add new messages maintaining order
      setMessages((prevMessages) => {
        const allMessages = [...prevMessages, ...processedMessages];
        return allMessages.sort((a, b) => a.timestamp - b.timestamp);
      });
    } catch (error) {
      console.error("Error loading more messages:", error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Gestione dello scroll
  const handleScroll = useCallback(
    (e) => {
      const container = e.target;
      const { scrollTop, scrollHeight, clientHeight } = container;

      // Controlla se siamo vicini al top per caricare più messaggi
      if (scrollTop <= 100) {
        loadMoreMessages();
      }

      // Controlla se siamo vicini al bottom per l'auto-scroll
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShouldScrollToBottom(isNearBottom);
    },
    [loadMoreMessages]
  );

  // Modifica l'effetto setupChat
  useEffect(() => {
    if (!selected?.roomId && !selected?.id) return;

    setIsSubscribed(true);
    setLoading(true);
    setIsInitializing(true);
    setMessages([]); // Immediate reset of messages

    const setupChat = async () => {
      try {
        // Check block status
        if (selected.type === "friend") {
          const blockStatus = await userBlocking.getBlockStatus(selected.pub);
          if (blockStatus.blocked || blockStatus.blockedBy) {
            setCanWrite(false);
            if (blockStatus.blocked) {
              setError("You have blocked this user");
            } else {
              setError("This user has blocked you");
            }
            setLoading(false);
            setIsInitializing(false);
            return;
          }
        }

        // Clean previous subscriptions
        if (messageSubscriptionRef.current) {
          if (typeof messageSubscriptionRef.current === "function") {
            messageSubscriptionRef.current();
          } else if (messageSubscriptionRef.current.unsubscribe) {
            messageSubscriptionRef.current.unsubscribe();
          }
          messageSubscriptionRef.current = null;
        }

        // Determine path
        let path =
          selected.type === "friend"
            ? "chats"
            : selected.type === "channel"
            ? "channels"
            : "boards";
        let id = selected.type === "friend" ? selected.roomId : selected.id;

        // Load initial messages using configurable limit
        const existingMessages = await messaging.chat.messageList.loadMessages(
          path,
          id,
          null, // Use default limit configured in messageList
          Date.now()
        );

        if (!isSubscribed) return;

        // Process messages
        let processedMessages =
          selected.type === "friend"
            ? await Promise.all(
                existingMessages.map(async (msg) => {
                  try {
                    if (
                      typeof msg.content !== "string" ||
                      !msg.content.startsWith("SEA{")
                    )
                      return msg;
                    return await messaging.chat.messageList.decryptMessage(
                      msg,
                      selected.pub
                    );
                  } catch (error) {
                    console.warn("Error decrypting message:", error);
                    return {
                      ...msg,
                      content: "[Decryption key not found]",
                    };
                  }
                })
              )
            : existingMessages;

        // Update messages only if we're still subscribed
        if (isSubscribed) {
          if (processedMessages.length > 0) {
            setMessages(
              processedMessages.sort((a, b) => a.timestamp - b.timestamp)
            );
            setOldestMessageTimestamp(
              Math.min(...processedMessages.map((m) => m.timestamp))
            );
          }
          setLoading(false);
          setIsInitializing(false);
        }

        // Subscribe to new messages
        const messageHandler = messaging.chat.messageList.subscribeToMessages(
          path,
          id,
          async (msg) => {
            if (!isSubscribed) return;
            try {
              let processedMsg = msg;
              if (
                selected.type === "friend" &&
                msg.content.startsWith("SEA{")
              ) {
                processedMsg = await messaging.chat.messageList.decryptMessage(
                  msg,
                  selected.pub
                );
              }
              setMessages((prev) => {
                if (prev.some((m) => m.id === processedMsg.id)) return prev;
                return [...prev, processedMsg].sort(
                  (a, b) => a.timestamp - b.timestamp
                );
              });
            } catch (error) {
              console.warn("Error processing new message:", error);
            }
          }
        );

        messageSubscriptionRef.current = messageHandler;
      } catch (error) {
        console.error("Error setting up chat:", error);
        if (isSubscribed) {
          setError("Error loading chat");
          setLoading(false);
          setIsInitializing(false);
        }
      }
    };

    setupChat();

    return () => {
      setIsSubscribed(false);
      if (messageSubscriptionRef.current) {
        if (typeof messageSubscriptionRef.current === "function") {
          try {
            messageSubscriptionRef.current();
          } catch (error) {
            console.warn("Error during cleanup:", error);
          }
        }
        messageSubscriptionRef.current = null;
      }
    };
  }, [selected?.roomId, selected?.id, selected?.type, selected?.pub]);

  // Usa useEffect con controllo di montaggio per le sottoscrizioni al profilo
  useEffect(() => {
    if (!chatData) return;

    let mounted = true;
    const otherPub =
      chatData.user1 === user?.is?.pub ? chatData.user2 : chatData.user1;

    const unsub = gun
      .get(DAPP_NAME)
      .get("userList")
      .get("nicknames")
      .get(otherPub)
      .on((nickname) => {
        if (!mounted) return;
        if (nickname) {
          setDisplayName(nickname);
        } else {
          setDisplayName(`${otherPub.slice(0, 6)}...${otherPub.slice(-4)}`);
        }
      });

    return () => {
      mounted = false;
      if (typeof unsub === "function") unsub();
    };
  }, [chatData]);

  // Aggiungi un effetto separato per mantenere la chat corrente
  useEffect(() => {
    if (chatData) {
      console.log("Current chat updated:", chatData);
    }
  }, [chatData]);

  // Aggiungi un effetto per resettare la chat quando l'amico viene rimosso
  useEffect(() => {
    if (!selected?.pub) return;

    const unsubFriendRemoval = gun
      .get("friendships")
      .map()
      .on(() => {
        // Verifica se l'amicizia esiste ancora
        let friendshipExists = false;
        gun
          .get("friendships")
          .map()
          .once((data) => {
            if (
              data &&
              ((data.user1 === selected.pub && data.user2 === user.is.pub) ||
                (data.user2 === selected.pub && data.user1 === user.is.pub))
            ) {
              friendshipExists = true;
            }
          });

        // Se l'amicizia non esiste più, resetta la vista
        if (!friendshipExists) {
          setCurrentChat(null);
          setMessages([]);
          setError(null);
        }
      });

    return () => {
      if (typeof unsubFriendRemoval === "function") unsubFriendRemoval();
    };
  }, [selected?.pub, setCurrentChat]);

  // Modifica l'effetto che monitora le ricevute
  useEffect(() => {
    if (!selected?.roomId) return;
    const subscriptions = new Map(); // Usa una Map per tenere traccia delle sottoscrizioni

    // Funzione per sottoscriversi a un singolo messaggio
    const subscribeToMessage = (message) => {
      if (message.sender !== user.is.pub || subscriptions.has(message.id))
        return;

      const unsubscribe = chat.messageList.subscribeToReceipts(
        selected.roomId,
        message.id,
        (receipt) => {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === receipt.messageId) {
                return {
                  ...msg,
                  delivered: receipt.type === "delivery" || msg.delivered,
                  read: receipt.type === "read" || msg.read,
                };
              }
              return msg;
            })
          );
        }
      );

      if (typeof unsubscribe === "function") {
        subscriptions.set(message.id, unsubscribe);
      }
    };

    // Sottoscrivi ai messaggi esistenti
    messages.forEach(subscribeToMessage);

    return () => {
      // Pulisci tutte le sottoscrizioni
      subscriptions.forEach((unsubscribe) => {
        if (typeof unsubscribe === "function") {
          unsubscribe();
        }
      });
      subscriptions.clear();
    };
  }, [selected?.roomId]); // Rimuovi messages dalle dipendenze

  // Aggiungi un effetto separato per gestire i nuovi messaggi
  useEffect(() => {
    if (!selected?.roomId || !messages.length) return;

    // Trova l'ultimo messaggio
    const lastMessage = messages[messages.length - 1];

    // Se è un nostro messaggio, sottoscrivi alle sue ricevute
    if (lastMessage && lastMessage.sender === user.is.pub) {
      const unsubscribe = chat.messageList.subscribeToReceipts(
        selected.roomId,
        lastMessage.id,
        (receipt) => {
          if (!receipt) return;

          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === receipt.messageId) {
                return {
                  ...msg,
                  delivered: receipt.type === "delivery" || msg.delivered,
                  read: receipt.type === "read" || msg.read,
                };
              }
              return msg;
            })
          );
        }
      );

      return () => {
        if (typeof unsubscribe === "function") {
          unsubscribe();
        }
      };
    }
  }, [selected?.roomId, messages.length]); // Usa messages.length invece di messages

  // Modifica la funzione handleDeleteMessage
  const handleDeleteMessage = async (messageId) => {
    if (
      !selected?.roomId ||
      !selected?.creator ||
      selected.creator !== user.is.pub
    ) {
      return;
    }

    try {
      let path, id;
      if (selected.type === "friend") {
        path = "chats";
        id = selected.roomId;
      } else if (selected.type === "channel") {
        path = "channels";
        id = selected.id;
      } else if (selected.type === "board") {
        path = "boards";
        id = selected.id;
      }

      await chat.messageList.deleteMessage(path, id, messageId);
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      toast.success("Message deleted");
    } catch (error) {
      console.error("Error deleting message:", error);
      toast.error("Error deleting message");
    }
  };

  // Aggiungi questa funzione per gestire lo scroll
  const scrollToBottom = (behavior = "smooth") => {
    if (messagesEndRef.current && shouldScrollToBottom) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  };

  // Aggiungi questo effetto per gestire lo scroll automatico
  useEffect(() => {
    if (messages.length > 0) {
      // Salva l'ultimo messaggio come riferimento
      lastMessageRef.current = messages[messages.length - 1];

      // Scroll immediato al primo caricamento
      if (messages.length === 1) {
        scrollToBottom("auto");
      } else {
        scrollToBottom();
      }
    }
  }, [messages]);

  // Aggiungi questo effetto per resettare lo scroll quando cambia la chat
  useEffect(() => {
    setShouldScrollToBottom(true);
    if (messagesEndRef.current) {
      scrollToBottom("auto");
    }
  }, [selected?.roomId]);

  // Funzione per ottenere il nome visualizzato
  const getDisplayName = async (pubKey) => {
    // Se è l'utente corrente
    if (pubKey === user?.is?.pub) {
      // Se  un wallet
      const walletAuth = localStorage.getItem("walletAuth");
      if (walletAuth) {
        try {
          const { address } = JSON.parse(walletAuth);
          return `${address.slice(0, 6)}...${address.slice(-4)}`;
        } catch (error) {
          console.error("Errore nel parsing del wallet auth:", error);
        }
      }
      // Se è un account Gun
      if (user?.is?.alias) {
        return user.is.alias.split(".")[0];
      }
    }

    // Per altri utenti
    try {
      const userData = await new Promise((resolve) => {
        gun.get(`~${pubKey}`).once((data) => {
          resolve(data);
        });
      });

      if (userData?.alias) {
        return userData.alias.split(".")[0];
      }
    } catch (error) {
      console.error("Errore nel recupero username:", error);
    }

    // Fallback alla versione abbreviata della chiave pubblica
    return `${pubKey.slice(0, 6)}...${pubKey.slice(-4)}`;
  };

  React.useEffect(() => {
    if (chatData) {
      const otherPub =
        chatData.user1 === user?.is?.pub ? chatData.user2 : chatData.user1;

      // Sottoscrizione al nickname dell'altro utente
      const unsub = gun
        .get(DAPP_NAME)
        .get("userList")
        .get("nicknames")
        .get(otherPub)
        .on((nickname) => {
          if (nickname) {
            setDisplayName(nickname);
          } else {
            // Fallback all'indirizzo abbreviato
            setDisplayName(`${otherPub.slice(0, 6)}...${otherPub.slice(-4)}`);
          }
        });

      return () => {
        if (typeof unsub === "function") unsub();
      };
    }
  }, [chatData]);

  React.useEffect(() => {
    if (selected?.pub) {
      // Sottoscrizione agli aggiornamenti del profilo utente
      const unsubUserProfile = gun
        .get(DAPP_NAME)
        .get("userList")
        .get("users")
        .map()
        .on((userData) => {
          if (userData?.pub === selected.pub) {
            setDisplayName(
              userData.nickname || userData.username || selected.alias
            );
          }
        });

      return () => {
        if (typeof unsubUserProfile === "function") {
          unsubUserProfile();
        }
      };
    }
  }, [selected?.pub]);

  const handleSendTip = async (recipientPub, amount, isStealthMode = false) => {
    try {
      await walletService.sendTip(recipientPub, amount, isStealthMode);
      toast.success(
        `Transazione ${isStealthMode ? "stealth " : ""}completata con successo!`
      );
    } catch (error) {
      console.error("Error sending tip:", error);
      toast.error(error.message || "Errore nell'invio");
    }
  };

  // Aggiungi la funzione sendMessage
  const sendMessage = async () => {
    if (!canWrite || !selected?.roomId || !newMessage.trim()) return;

    const messageContent = newMessage.trim();
    setNewMessage("");

    try {
      if (selected.type === "friend") {
        // Prima cripta il messaggio
        const encryptedContent =
          await messaging.chat.messageList.encryptMessage(
            messageContent,
            selected.pub
          );

        if (!encryptedContent) {
          throw new Error("Errore durante la crittografia del messaggio");
        }

        const messageId = `msg_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        const messageData = {
          id: messageId,
          content: encryptedContent,
          sender: user.is.pub,
          timestamp: Date.now(),
        };

        // Salva il messaggio criptato
        await gun
          .get(DAPP_NAME)
          .get("chats")
          .get(selected.roomId)
          .get("messages")
          .get(messageId)
          .put(messageData);
      } else {
        // Per canali e bacheche il messaggio non viene criptato
        const messageId = `msg_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        const messageData = {
          id: messageId,
          content: messageContent,
          sender: user.is.pub,
          senderAlias: user.is.alias || "Unknown",
          timestamp: Date.now(),
        };

        let path = selected.type === "channel" ? "channels" : "boards";
        await gun
          .get(DAPP_NAME)
          .get(path)
          .get(selected.id)
          .get("messages")
          .get(messageId)
          .put(messageData);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error(error.message || "Errore nell'invio del messaggio");
      setNewMessage(messageContent);
    }
  };

  // Aggiungi questa funzione nel componente Messages
  const handleDeleteAllMessages = async () => {
    if (!selected?.roomId) return;

    try {
      const isConfirmed = window.confirm(
        "Sei sicuro di voler eliminare tutti i messaggi? Questa azione non può essere annullata."
      );

      if (!isConfirmed) return;

      setLoading(true);

      let path =
        selected.type === "friend"
          ? "chats"
          : selected.type === "channel"
          ? "channels"
          : "boards";
      let id = selected.type === "friend" ? selected.roomId : selected.id;

      await messaging.chat.messageList.deleteAllMessages(path, id);

      setMessages([]);
      toast.success("Tutti i messaggi sono stati eliminati");
    } catch (error) {
      console.error("Error deleting all messages:", error);
      toast.error("Errore durante l'eliminazione dei messaggi");
    } finally {
      setLoading(false);
    }
  };

  // Aggiungi questa funzione per gestire lo sblocco
  const handleUnblock = async () => {
    try {
      // Sblocca l'utente
      await userBlocking.unblockUser(selected.pub);

      // Sblocca anche la chat
      const chatId = [user.is.pub, selected.pub].sort().join("_");
      await chat.unblockChat(chatId);

      // Resetta gli stati
      setError(null);
      setCanWrite(true);

      // Ricarica la chat
      setupChat();

      toast.success(`${selected.alias} è stato sbloccato`);
    } catch (error) {
      console.error("Error unblocking user:", error);
      toast.error("Errore durante lo sblocco dell'utente");
    }
  };

  React.useEffect(() => {
    if (selected?.pub && selected?.type === "friend") {
      const loadUserInfo = async () => {
        const info = await userUtils.getUserInfo(selected.pub);
        setChatUserInfo(info);
      };
      loadUserInfo();

      // Sottoscrizione diretta al nodo dell'utente
      const unsub = gun
        .get(DAPP_NAME)
        .get("userList")
        .get("users")
        .get(selected.pub)
        .on((data) => {
          if (data) {
            setChatUserInfo({
              displayName: data.nickname || data.username || selected.alias,
              username: data.username || "",
              nickname: data.nickname || "",
            });
          }
        });

      return () => {
        if (typeof unsub === "function") unsub();
      };
    } else if (selected?.name) {
      setChatUserInfo({
        displayName: selected.name,
        type: selected.type,
      });
    }
  }, [selected?.pub, selected?.type, selected?.name, selected?.alias]);

  if (!selected?.pub) {
    return (
      <div className="hidden md:flex items-center justify-center h-full w-full bg-gray-50">
        <p className="text-gray-500">Seleziona un amico per chattare</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-white md:bg-gray-50">
      {/* Header della chat con pulsante indietro per mobile */}
      <div className="sticky top-0 flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 border-b bg-white">
        <div className="flex items-center">
          {isMobileView && (
            <button
              onClick={onBack}
              className="mr-2 p-1 hover:bg-gray-100 rounded-full"
              aria-label="Torna alla lista chat"
            >
              <svg
                className="w-6 h-6 text-gray-500"
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
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-100 flex items-center justify-center">
            {selected.type === "channel" ? (
              "📢"
            ) : selected.type === "board" ? (
              "📋"
            ) : (
              <img
                className="w-full h-full rounded-full"
                src={`https://api.dicebear.com/7.x/bottts/svg?seed=${
                  selected.avatarSeed || displayName
                }&backgroundColor=b6e3f4`}
                alt=""
              />
            )}
          </div>
          <div className="ml-2 sm:ml-3">
            <p className="text-xs sm:text-sm font-medium text-gray-900 truncate max-w-[150px] sm:max-w-[200px]">
              {chatUserInfo.displayName}
            </p>
            {chatUserInfo.username && (
              <p className="text-xs text-gray-500 truncate max-w-[150px] sm:max-w-[200px]">
                @{chatUserInfo.username}
              </p>
            )}
            <p className="text-xs text-gray-500">
              {selected.type === "channel"
                ? "Canale"
                : selected.type === "board"
                ? "Bacheca"
                : selected.pub.slice(0, 8) + "..."}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-1 sm:space-x-2">
          {selected.type === "friend" && (
            <button
              onClick={handleDeleteAllMessages}
              className="p-1 sm:p-2 hover:bg-red-100 rounded-full text-red-500"
              title="Elimina tutti i messaggi"
            >
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5"
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
          )}
          <button
            onClick={() => setIsWalletModalOpen(true)}
            className="p-1 sm:p-2 hover:bg-gray-100 rounded-full"
            title="Apri wallet"
          >
            <svg
              className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500"
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
        </div>
      </div>

      {/* Area messaggi - responsive */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-2 sm:space-y-4 bg-gray-50"
        onScroll={handleScroll}
      >
        {/* Stato di caricamento iniziale */}
        {(isInitializing || loading) && (
          <div className="flex flex-col items-center justify-center h-full space-y-2">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            <p className="text-gray-500">Caricamento chat...</p>
          </div>
        )}

        {/* Stato di errore */}
        {!isInitializing && !loading && error && (
          <div className="flex items-center justify-center h-full">
            <p className="text-red-500">{error}</p>
          </div>
        )}

        {/* Stato nessun messaggio */}
        {!isInitializing && !loading && !error && messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Nessun messaggio</p>
          </div>
        )}

        {/* Loader per caricamento messaggi aggiuntivi */}
        {isLoadingMore && (
          <div className="text-center py-2">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
          </div>
        )}

        {/* Lista messaggi - mostra solo se non siamo in stato di caricamento iniziale */}
        {!isInitializing && !loading && !error && messages.length > 0 && (
          <>
            {messages
              .filter((message) => message && message.content)
              .map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  isOwnMessage={message.sender === user.is.pub}
                  showSender={true}
                  user={user}
                  messageObserver={messageObserver}
                  handleDeleteMessage={handleDeleteMessage}
                  selected={selected}
                />
              ))}
          </>
        )}

        <div ref={messagesEndRef} style={{ height: 1 }} />
      </div>

      {/* Input area - responsive */}
      <div className="sticky bottom-0 w-full bg-white border-t">
        {canWrite ? (
          <div className="p-2 sm:p-4">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) =>
                  e.key === "Enter" && !e.shiftKey && sendMessage()
                }
                placeholder="Scrivi un messaggio..."
                className="flex-1 rounded-full px-3 sm:px-4 py-1.5 sm:py-2 bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
              />
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim()}
                className={`p-1.5 sm:p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors flex-shrink-0 ${
                  !newMessage.trim() ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                <AiOutlineSend className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="p-2 sm:p-4 text-center text-xs sm:text-sm text-gray-500">
            Non hai i permessi per scrivere qui
          </div>
        )}
      </div>

      <Toaster />
      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
        onSend={handleSendTip}
        selectedUser={selected}
      />
    </div>
  );
}
