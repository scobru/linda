import React, { useState, useEffect } from "react";
import { gun, DAPP_NAME } from "linda-protocol";

export default function UserInfoModal({ isOpen, onClose, userPub }) {
  const [userInfo, setUserInfo] = useState({
    alias: "",
    username: "",
    nickname: "",
    pub: userPub,
    createdAt: null,
    lastSeen: null,
    internalAddress: null,
  });

  useEffect(() => {
    if (!isOpen || !userPub) return;

    const loadUserInfo = async () => {
      try {
        // Carica info dal nodo pubblico dell'utente
        const publicData = await new Promise((resolve) => {
          gun.get(`~${userPub}`).once((data) => {
            resolve(data);
          });
        });

        // Carica info dal nodo userList
        const userData = await new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("userList")
            .get("users")
            .get(userPub)
            .once((data) => {
              resolve(data);
            });
        });

        // Carica l'indirizzo interno del wallet
        const walletData = await new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("wallets")
            .get(userPub)
            .once((data) => {
              resolve(data);
            });
        });

        setUserInfo({
          alias: publicData?.alias?.split(".")[0] || "",
          username: userData?.username || "",
          nickname: userData?.nickname || "",
          pub: userPub,
          createdAt: publicData?.createdAt,
          lastSeen: userData?.lastSeen,
          internalAddress: walletData?.address || null,
        });
      } catch (error) {
        console.warn("Errore nel caricamento info utente:", error);
      }
    };

    loadUserInfo();
  }, [isOpen, userPub]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Informazioni Contatto</h2>
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

        <div className="space-y-4">
          <div className="flex justify-center mb-6">
            <img
              className="w-24 h-24 rounded-full"
              src={`https://api.dicebear.com/7.x/bottts/svg?seed=${
                userInfo.alias || userInfo.pub
              }&backgroundColor=b6e3f4`}
              alt=""
            />
          </div>

          {userInfo.alias && (
            <div>
              <label className="text-sm font-medium text-gray-500">
                Username
              </label>
              <p className="text-gray-900">@{userInfo.alias}</p>
            </div>
          )}

          {userInfo.nickname && (
            <div>
              <label className="text-sm font-medium text-gray-500">
                Nickname
              </label>
              <p className="text-gray-900">{userInfo.nickname}</p>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-gray-500">
              Chiave Pubblica
            </label>
            <p className="text-gray-900 break-all text-sm">{userInfo.pub}</p>
          </div>

          {userInfo.internalAddress && (
            <div>
              <label className="text-sm font-medium text-gray-500">
                Indirizzo Interno
              </label>
              <p className="text-gray-900 break-all text-sm font-mono">
                {userInfo.internalAddress}
              </p>
            </div>
          )}

          {userInfo.createdAt && (
            <div>
              <label className="text-sm font-medium text-gray-500">
                Account Creato
              </label>
              <p className="text-gray-900">
                {new Date(userInfo.createdAt).toLocaleDateString()}
              </p>
            </div>
          )}

          {userInfo.lastSeen && (
            <div>
              <label className="text-sm font-medium text-gray-500">
                Ultimo Accesso
              </label>
              <p className="text-gray-900">
                {new Date(userInfo.lastSeen).toLocaleString()}
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
