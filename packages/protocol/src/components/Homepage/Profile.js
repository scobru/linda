React.useEffect(() => {
  const loadUserData = async () => {
    try {
      const currentPub = user.is?.pub;
      if (!currentPub) return;

      // Log per debug
      console.log('Current user pub:', currentPub);

      // Log dei dati dalla userList
      gun.get(DAPP_NAME)
        .get('users')
        .get(currentPub)
        .once((data) => {
          console.log('UserList data:', {
            raw: data,
            hasViewingKey: !!data?.viewingPublicKey,
            hasSpendingKey: !!data?.spendingPublicKey,
            hasKeys: !!(
              data?.pair && 
              data?.viewingKeyPair && 
              data?.spendingKeyPair
            )
          });
        });

      // Log dei dati dal profilo
      gun.user()
        .get(DAPP_NAME)
        .get('profiles')
        .get(currentPub)
        .once((data) => {
          console.log('Profile data:', {
            raw: data,
            hasViewingKey: !!data?.viewingPublicKey,
            hasSpendingKey: !!data?.spendingPublicKey,
            hasKeys: !!(
              data?.pair && 
              data?.viewingKeyPair && 
              data?.spendingKeyPair
            )
          });
        });

      // Verifica anche il percorso addresses
      gun.get(DAPP_NAME)
        .get('addresses')
        .get(currentPub)
        .once((data) => {
          console.log('Addresses data:', {
            raw: data,
            hasViewingKey: !!data?.viewingPublicKey,
            hasSpendingKey: !!data?.spendingPublicKey,
            hasKeys: !!(
              data?.pair && 
              data?.viewingKeyPair && 
              data?.spendingKeyPair
            )
          });
        });

    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  loadUserData();
}, [user.is?.pub]); 