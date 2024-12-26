import { gun, DAPP_NAME } from "linda-protocol";

export const getUserUsername = async (userPub) => {
  try {
    // Prima cerca nelle informazioni dell'utente
    const userInfo = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get("userList")
        .get("users")
        .get(userPub)
        .once((userData) => {
          resolve(userData);
        });
    });

    if (userInfo?.nickname) return userInfo.nickname;
    if (userInfo?.username) return userInfo.username;

    // Se non troviamo info nell'userList, cerca nell'account Gun
    const userData = await new Promise((resolve) => {
      gun.get(`~${userPub}`).once((data) => {
        resolve(data);
      });
    });

    if (userData?.alias) {
      return userData.alias.split(".")[0];
    }

    // Se non troviamo nulla, cerca nell'elenco amici
    const friendData = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get("friendships")
        .map()
        .once((friendship) => {
          if (
            friendship &&
            (friendship.user1 === userPub || friendship.user2 === userPub)
          ) {
            resolve(friendship);
          }
        });
    });

    if (friendData?.alias) {
      return friendData.alias;
    }

    // Se non troviamo nulla, usa la chiave pubblica abbreviata
    return `${userPub.slice(0, 6)}...${userPub.slice(-4)}`;
  } catch (error) {
    console.warn("Errore nel recupero username:", error);
    return `${userPub.slice(0, 6)}...${userPub.slice(-4)}`;
  }
};

export const getUserAvatar = async (userPub) => {
  try {
    // Prima prova nel percorso userList/users
    const avatarData = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get("userList")
        .get("users")
        .get(userPub)
        .get("avatar")
        .once((data) => {
          resolve(data);
        });
    });

    if (avatarData) return avatarData;

    // Se non trova nulla, prova nel percorso users
    const avatarData2 = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get("users")
        .get(userPub)
        .get("avatar")
        .once((data) => {
          resolve(data);
        });
    });

    return avatarData2;
  } catch (error) {
    console.warn("Errore nel recupero avatar:", error);
    return null;
  }
};
