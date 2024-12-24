import React from "react";
import { gun, user, DAPP_NAME } from "linda-protocol";
import { userUtils } from "linda-protocol";
import { acceptFriendRequest, rejectFriendRequest } from "linda-protocol";
import { toast } from "react-hot-toast";

const FriendRequest = ({ request, onRequestProcessed }) => {
  const [userInfo, setUserInfo] = React.useState({
    displayName: "Caricamento...",
    username: "",
    nickname: "",
  });
  const [isProcessing, setIsProcessing] = React.useState(false);

  React.useEffect(() => {
    const loadUserInfo = async () => {
      const info = await userUtils.getUserInfo(request.from);
      setUserInfo(info);
    };
    loadUserInfo();
  }, [request.from]);

  const handleAccept = async () => {
    try {
      setIsProcessing(true);
      console.log("Accettazione richiesta da:", request.from);

      // Verifica che l'utente sia autenticato
      if (!user.is?.pub) {
        throw new Error("Utente non autenticato");
      }

      // Verifica che la richiesta sia valida
      if (!request || !request.from) {
        throw new Error("Richiesta non valida");
      }

      // Recupera i dati del wallet dell'utente corrente
      const walletData = JSON.parse(
        localStorage.getItem(`gunWallet_${user.is.pub}`)
      );
      if (!walletData || !walletData.pair) {
        throw new Error("Dati wallet non trovati");
      }

      // Accetta la richiesta con i dati di cifratura
      const result = await acceptFriendRequest({
        ...request,
        pair: walletData.pair,
        v_Pair: walletData.v_Pair,
        s_Pair: walletData.s_Pair,
      });

      console.log("Risultato accettazione:", result);

      if (result.success) {
        // Crea l'amicizia in Gun con dati di cifratura
        await new Promise((resolve, reject) => {
          const friendshipId = [user.is.pub, request.from].sort().join("_");
          gun
            .get(DAPP_NAME)
            .get("friendships")
            .get(friendshipId)
            .put(
              {
                user1: user.is.pub,
                user2: request.from,
                created: Date.now(),
                status: "accepted",
                encryptionKey: result.encryptionKey || null,
                viewingKey: result.viewingKey || null,
              },
              (ack) => {
                if (ack.err) reject(new Error(ack.err));
                else resolve(ack);
              }
            );
        });

        // Aggiorna i dati dell'utente
        await new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get("users")
            .get(user.is.pub)
            .get("friends")
            .set({ pub: request.from, added: Date.now() }, (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve(ack);
            });
        });

        // Rimuovi la richiesta da all_friend_requests
        await new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("all_friend_requests")
            .map()
            .once((data, key) => {
              if (
                data &&
                data.from === request.from &&
                data.to === user.is.pub
              ) {
                gun
                  .get(DAPP_NAME)
                  .get("all_friend_requests")
                  .get(key)
                  .put(null);
              }
            });
          setTimeout(resolve, 500);
        });

        // Rimuovi la richiesta da friend_requests dell'utente
        await new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("friend_requests")
            .get(user.is.pub)
            .map()
            .once((data, key) => {
              if (data && data.from === request.from) {
                gun
                  .get(DAPP_NAME)
                  .get("friend_requests")
                  .get(user.is.pub)
                  .get(key)
                  .put(null);
              }
            });
          setTimeout(resolve, 500);
        });

        // Notifica l'UI
        onRequestProcessed(request.from);
        toast.success("Richiesta di amicizia accettata");
      } else {
        throw new Error(result.message || "Errore nell'accettare la richiesta");
      }
    } catch (error) {
      console.error("Errore accettazione richiesta:", error);
      toast.error(error.message || "Errore nell'accettare la richiesta");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    try {
      setIsProcessing(true);
      console.log("Rifiuto richiesta da:", request.from);

      // Verifica che l'utente sia autenticato
      if (!user.is?.pub) {
        throw new Error("Utente non autenticato");
      }

      await rejectFriendRequest(request);

      // Rimuovi la richiesta da all_friend_requests
      await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("all_friend_requests")
          .map()
          .once((data, key) => {
            if (data && data.from === request.from && data.to === user.is.pub) {
              gun.get(DAPP_NAME).get("all_friend_requests").get(key).put(null);
            }
          });
        setTimeout(resolve, 500);
      });

      // Rimuovi la richiesta da friend_requests dell'utente
      await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("friend_requests")
          .get(user.is.pub)
          .map()
          .once((data, key) => {
            if (data && data.from === request.from) {
              gun
                .get(DAPP_NAME)
                .get("friend_requests")
                .get(user.is.pub)
                .get(key)
                .put(null);
            }
          });
        setTimeout(resolve, 500);
      });

      // Notifica l'UI
      onRequestProcessed(request.from);
      toast.success("Richiesta di amicizia rifiutata");
    } catch (error) {
      console.error("Errore rifiuto richiesta:", error);
      toast.error(error.message || "Errore nel rifiutare la richiesta");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm mb-2">
      <div className="flex items-center">
        <img
          className="h-10 w-10 rounded-full"
          src={`https://api.dicebear.com/7.x/bottts/svg?seed=${userInfo.displayName}&backgroundColor=b6e3f4`}
          alt=""
        />
        <div className="ml-3">
          <p className="text-sm font-medium text-gray-900">
            {userInfo.displayName}
          </p>
          {userInfo.username && (
            <p className="text-xs text-gray-500">@{userInfo.username}</p>
          )}
        </div>
      </div>
      <div className="flex space-x-2">
        <button
          onClick={handleAccept}
          disabled={isProcessing}
          className={`px-3 py-1 text-sm font-medium text-white bg-blue-500 rounded hover:bg-blue-600 
            ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {isProcessing ? "In corso..." : "Accetta"}
        </button>
        <button
          onClick={handleReject}
          disabled={isProcessing}
          className={`px-3 py-1 text-sm font-medium text-white bg-red-500 rounded hover:bg-red-600
            ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          Rifiuta
        </button>
      </div>
    </div>
  );
};

export default FriendRequest;
