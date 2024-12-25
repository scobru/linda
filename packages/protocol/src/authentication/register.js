import { gun, user, DAPP_NAME } from '../useGun.js';
import {
  createFriendRequestCertificate,
  createNotificationCertificate,
} from '../security/index.js';
import { updateGlobalMetrics } from '../system/systemService.js';

const LOGIN_TIMEOUT = 5000; // Ridotto da 10 a 5 secondi

export const registerWithMetaMask = async (address) => {
  let userDataCache = null;
  let decryptedKeys = null;

  try {
    if (!address || typeof address !== 'string') {
      throw new Error('Indirizzo non valido');
    }

    const normalizedAddress = address.toLowerCase();
    console.log('Avvio registrazione con indirizzo:', normalizedAddress);

    // 1. Verifica se l'utente esiste già con retry
    const existingUser = await new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 3;

      const checkUser = () => {
        gun
          .get(DAPP_NAME)
          .get('addresses')
          .get(normalizedAddress)
          .once((data) => {
            if (data) {
              resolve(data);
            } else if (attempts < maxAttempts) {
              attempts++;
              setTimeout(checkUser, 1000);
            } else {
              resolve(null);
            }
          });
      };

      checkUser();
    });

    if (existingUser && existingUser.pub) {
      throw new Error('Utente già registrato con questo indirizzo');
    }

    const userData = await gun.ethToGunAccount();

    // 7. Crea l'utente con retry
    const createUser = async (retries = 3) => {
      for (let i = 0; i < retries; i++) {
        const createAck = await new Promise((resolve) =>
          user.create(userData.pair, resolve)
        );
        if (!createAck.err || createAck.err.includes('already created')) {
          return true;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw new Error('Creazione utente fallita dopo multipli tentativi');
    };

    await createUser();

    // 8. Prepara i dati utente
    const userDataToSave = {
      pub: userData.pair.pub,
      epub: userData.pair.epub,
      viewingPublicKey: userData.v_pair.pub,
      spendingPublicKey: userData.s_pair.pub,
      env_pair: userData.env_pair,
      env_v_pair: userData.env_v_pair,
      env_s_pair: userData.env_s_pair,
      internalWalletAddress: userData.internalWalletAddress,
      externalWalletAddress: normalizedAddress,
      createdAt: Date.now(),
      authType: 'metamask',
      lastSeen: Date.now(),
    };

    // 9. Salva i dati con transazione atomica
    const saveData = async () => {
      const promises = [
        new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get('addresses')
            .get(normalizedAddress)
            .put(userDataToSave, (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve(ack);
            });
        }),
        new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get('users')
            .get(userData.pair.pub)
            .put(userDataToSave, (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve(ack);
            });
        }),

        new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get('users')
            .get(normalizedAddress)
            .put(userDataToSave, (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve(ack);
            });
        }),
      ];

      await Promise.all(promises);
    };

    await saveData();

    // 10. Salva nel localStorage con encryption
    const walletData = {
      pub: userData.pair.pub,
      epub: userData.pair.epub,
      viewingPublicKey: userData.v_pair.pub,
      spendingPublicKey: userData.s_pair.pub,
      env_pair: userData.env_pair,
      env_v_pair: userData.env_v_pair,
      env_s_pair: userData.env_s_pair,
      internalWalletAddress: userData.internalWalletAddress,
      internalWalletPk: userData.internalWalletPk,
      externalWalletAddress: normalizedAddress,
      createdAt: Date.now(),
      authType: 'metamask',
      lastSeen: Date.now(),
      credentials: {
        username: normalizedAddress,
        password: password,
      },
    };

    localStorage.setItem(`gunWallet_${pair.pub}`, JSON.stringify(walletData));

    // 11. Aggiorna metriche e crea certificati
    await Promise.all([
      updateGlobalMetrics('totalUsers', 1),
      createFriendRequestCertificate(),
      createNotificationCertificate(),
    ]);

    return {
      success: true,
      pub: userData.pair.pub,
      userData,
    };
  } catch (error) {
    console.error('Errore in registerWithMetaMask:', error);

    // Pulizia in caso di errore
    if (user.is) {
      user.leave();
    }

    // Rimuovi dati parziali se presenti
    if (userDataCache?.pub) {
      gun.get(DAPP_NAME).get('users').get(userDataCache.pub).put(null);
      gun.get(DAPP_NAME).get('addresses').get(address.toLowerCase()).put(null);
    }

    throw error;
  }
};

const registerUser = async (credentials = {}, callback = () => {}) => {
  console.log('Inizio registerUser con credenziali:', {
    ...credentials,
    password: '***',
  });

  const REGISTRATION_TIMEOUT = 120000; // Aumentato a 120 secondi
  let timeoutId;
  let resolvePromise;
  let registrationStatus = 'idle';

  const updateStatus = (status, progress) => {
    registrationStatus = status;
    console.log(
      `Stato registrazione: ${status}${progress ? ` (${progress})` : ''}`
    );
  };

  const registerPromise = new Promise(async (resolve, reject) => {
    resolvePromise = resolve;

    try {
      updateStatus('validazione');
      // Validazione input
      console.log('Validazione input...');
      if (!credentials.username || !credentials.password) {
        console.log('Validazione fallita: username o password mancanti');
        throw new Error('Username e password sono richiesti');
      }

      // Pulisci lo stato precedente in modo aggressivo
      console.log('Pulizia stato precedente...');
      if (user.is) {
        console.log('Utente già loggato, effettuo logout');
        user.leave();
        await new Promise((r) => setTimeout(r, 2000));
      }

      // Forza una pulizia completa di Gun
      console.log('Pulizia completa Gun...');
      gun.user().leave();
      await new Promise((r) => setTimeout(r, 2000));

      updateStatus('verifica-esistenza');
      // Verifica se l'utente esiste già con retry
      const checkUserExists = async (retries = 3) => {
        for (let i = 0; i < retries; i++) {
          console.log(`Tentativo verifica esistenza ${i + 1}/${retries}`);
          try {
            const exists = await new Promise((resolve) => {
              const timeoutId = setTimeout(() => {
                resolve({ exists: false });
              }, 500);

              gun.get(`~@${credentials.username}`).once((data) => {
                clearTimeout(timeoutId);
                console.log('Risposta verifica esistenza:', data);

                // Se abbiamo una risposta non nulla, controlliamo se è un alias valido
                if (data) {
                  console.log('Username già esistente');
                  callback({
                    success: false,
                    status: 'username-esistente',
                    errMessage: 'Username già in uso',
                    redirect: true,
                    username: credentials.username,
                  });
                  resolve({ exists: true, redirect: true });
                  return;
                }

                // Se non abbiamo trovato un alias, verifichiamo nella collezione users
                gun
                  .get(DAPP_NAME)
                  .get('users')
                  .map()
                  .once((userData) => {
                    if (
                      userData &&
                      userData.username === credentials.username
                    ) {
                      console.log('Username già esistente (trovato in users)');
                      callback({
                        success: false,
                        status: 'username-esistente',
                        errMessage: 'Username già in uso',
                        redirect: true,
                        username: credentials.username,
                      });
                      resolve({ exists: true, redirect: true });
                      return;
                    }
                  });

                // Riduciamo il timeout per la verifica
                setTimeout(() => {
                  resolve({ exists: false });
                }, 500); // Ridotto ulteriormente a 500ms
              });
            });

            if (exists.exists) {
              updateStatus('username-esistente');
              throw new Error('Username già in uso');
            }

            console.log('Username disponibile');
            return false;
          } catch (error) {
            console.log(`Errore verifica esistenza:`, error);
            if (error.message === 'Username già in uso') {
              updateStatus('username-esistente');
              callback({
                success: false,
                status: 'username-esistente',
                errMessage: 'Username già in uso',
              });
              throw error;
            }
            if (i === retries - 1) throw error;
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      };

      try {
        await checkUserExists();
      } catch (error) {
        if (error.message === 'Username già in uso') {
          updateStatus('username-esistente');
          resolve({
            success: false,
            errMessage: 'Username già in uso',
            suggestLogin: true,
            status: 'username-esistente',
          });
          return;
        }
        throw error;
      }

      // Funzione di pulizia completa
      const cleanupGunState = async () => {
        console.log('Pulizia completa stato Gun...');

        // Forza la disconnessione dell'utente corrente
        if (user.is) {
          user.leave();
        }

        // Pulisci il localStorage
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith('gun/') || key.startsWith('gunWallet_')) {
            localStorage.removeItem(key);
          }
        });

        // Forza una pulizia completa di Gun
        gun.user().leave();

        // Attendi che la pulizia sia completata
        await new Promise((r) => setTimeout(r, 5000));

        console.log('Pulizia completata');
      };

      updateStatus('creazione-utente');
      // 1. Crea l'utente con retry e pulizia aggressiva
      console.log('Inizio creazione utente...');
      const createUserWithRetry = async (retries = 3) => {
        // Prima di iniziare, esegui una pulizia completa
        await cleanupGunState();

        for (let i = 0; i < retries; i++) {
          console.log(`Tentativo creazione ${i + 1}/${retries}`);
          try {
            // Verifica la connessione prima di procedere
            const isConnected = await new Promise((resolve) => {
              const timeoutId = setTimeout(() => resolve(false), 5000);
              gun.get('healthcheck').once(() => {
                clearTimeout(timeoutId);
                resolve(true);
              });
            });

            if (!isConnected) {
              console.log('Connessione persa, attendo riconnessione...');
              await new Promise((r) => setTimeout(r, 5000));
              continue;
            }

            // Attendi che eventuali operazioni precedenti siano completate
            await new Promise((r) => setTimeout(r, 5000));

            const createResult = await new Promise((resolve, reject) => {
              const createTimeoutId = setTimeout(() => {
                reject(new Error('Timeout creazione utente'));
              }, 15000); // Ridotto da 30000 a 15000ms

              // Verifica se l'utente esiste già
              gun.get(`~@${credentials.username}`).once((data) => {
                if (data) {
                  clearTimeout(createTimeoutId);
                  reject(new Error('Username già in uso'));
                  return;
                }

                // Procedi con la creazione
                user.create(
                  credentials.username,
                  credentials.password,
                  (ack) => {
                    clearTimeout(createTimeoutId);
                    console.log('Risposta creazione:', ack);

                    if (ack.err) {
                      if (ack.err.includes('already being created')) {
                        // Se l'utente è in fase di creazione, attendiamo
                        console.log('Utente in fase di creazione, attendo...');
                        setTimeout(() => resolve(ack), 5000);
                      } else if (!ack.err.includes('already created')) {
                        reject(new Error(ack.err));
                      } else {
                        resolve(ack);
                      }
                    } else {
                      resolve(ack);
                    }
                  }
                );
              });
            });

            // Se siamo qui, la creazione è andata a buon fine
            console.log('Utente creato con successo');

            // Verifica che l'utente sia stato effettivamente creato
            const userCreated = await new Promise((resolve) => {
              const timeoutId = setTimeout(() => resolve(false), 10000);
              const checkUser = () => {
                gun.get(`~@${credentials.username}`).once((data) => {
                  if (data) {
                    clearTimeout(timeoutId);
                    resolve(true);
                  } else {
                    setTimeout(checkUser, 1000);
                  }
                });
              };
              checkUser();
            });

            if (!userCreated) {
              throw new Error('Verifica creazione utente fallita');
            }

            // Attendi che l'utente sia effettivamente creato
            await new Promise((r) => setTimeout(r, 2000)); // Ridotto da 5000 a 2000ms

            return createResult;
          } catch (error) {
            console.log(`Tentativo creazione ${i + 1} fallito:`, error);

            if (error.message.includes('già in uso')) {
              throw error; // Non ritentare se l'username è già in uso
            }

            if (i === retries - 1) throw error;

            // Pulizia completa tra i tentativi
            await cleanupGunState();

            // Attendi più a lungo tra i tentativi
            await new Promise((r) => setTimeout(r, 10000));
          }
        }
      };

      await createUserWithRetry();

      console.log("Attesa prima dell'autenticazione...");
      await new Promise((r) => setTimeout(r, 2000));

      updateStatus('autenticazione');
      // 2. Autentica l'utente con retry
      console.log('Inizio autenticazione...');
      const authenticateWithRetry = async (retries = 3) => {
        for (let i = 0; i < retries; i++) {
          console.log(`Tentativo autenticazione ${i + 1}/${retries}`);
          try {
            // Attendi che eventuali operazioni precedenti siano completate
            await new Promise((r) => setTimeout(r, 5000));

            const result = await new Promise((resolve, reject) => {
              const authTimeoutId = setTimeout(() => {
                reject(new Error('Timeout autenticazione'));
              }, 20000);

              user.auth(credentials.username, credentials.password, (ack) => {
                clearTimeout(authTimeoutId);
                console.log('Risposta autenticazione:', ack);

                if (ack.err) {
                  if (ack.err.includes('already being created')) {
                    // Se l'utente è in fase di creazione, attendiamo
                    console.log('Utente in fase di creazione, attendo...');
                    setTimeout(() => resolve(ack), 5000);
                  } else {
                    reject(new Error(ack.err));
                  }
                } else {
                  resolve(ack);
                }
              });
            });

            // Verifica che l'utente sia autenticato
            console.log('Verifica autenticazione in corso...');
            let attempts = 0;
            while (attempts < 25 && !user.is?.pub) {
              // Ridotto da 50 a 25 tentativi
              await new Promise((r) => setTimeout(r, 100)); // Ridotto da 200 a 100ms
              attempts++;
            }

            if (!user.is?.pub) {
              throw new Error('Verifica autenticazione fallita');
            }

            console.log('Autenticazione completata con successo');
            return result;
          } catch (error) {
            console.log(`Tentativo autenticazione ${i + 1} fallito:`, error);

            if (i === retries - 1) throw error;

            // Pulizia completa tra i tentativi
            await cleanupGunState();
          }
        }
      };

      await authenticateWithRetry();

      updateStatus('generazione-account');
      // 3. Genera l'account Ethereum con retry
      console.log('Generazione account Ethereum...');
      const generateEthAccount = async (retries = 3) => {
        for (let i = 0; i < retries; i++) {
          console.log(`Tentativo generazione account ${i + 1}/${retries}`);
          try {
            const userData = await gun.gunToEthAccount(
              user._.sea,
              credentials.password
            );
            if (!userData) throw new Error('Generazione account fallita');
            console.log('Account Ethereum generato:', {
              ...userData,
              privateKeys: '***',
            });
            return userData;
          } catch (error) {
            console.log(
              `Tentativo generazione account ${i + 1} fallito:`,
              error
            );
            if (i === retries - 1) throw error;
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      };

      const userData = await generateEthAccount();

      updateStatus('preparazione-dati');
      // 4. Prepara i dati utente
      console.log('Preparazione dati utente...');
      const userDataToSave = {
        pub: user.is.pub,
        address: userData?.internalWalletAddress || user.is.pub,
        internalWalletAddress: userData?.internalWalletAddress || user.is.pub,
        externalWalletAddress: null,
        username: credentials.username,
        nickname: credentials.username,
        timestamp: Date.now(),
        authType: 'credentials',
        viewingPublicKey: userData?.viewingPublicKey || null,
        spendingPublicKey: userData?.spendingPublicKey || null,
        env_pair: userData?.env_pair || null,
        env_v_pair: userData?.env_v_pair || null,
        env_s_pair: userData?.env_s_pair || null,
      };
      console.log('Dati utente preparati:', {
        ...userDataToSave,
        privateKeys: '***',
      });

      updateStatus('salvataggio', '0%');
      // 5. Salva i dati con retry
      console.log('Salvataggio dati...');
      const saveDataWithRetry = async (retries = 3) => {
        for (let i = 0; i < retries; i++) {
          try {
            // Funzione per verificare la connessione
            const checkConnection = async () => {
              return new Promise((resolve) => {
                const timeoutId = setTimeout(() => resolve(false), 5000);
                gun.get('healthcheck').once(() => {
                  clearTimeout(timeoutId);
                  resolve(true);
                });
              });
            };

            // Funzione per attendere la riconnessione
            const waitForConnection = async (maxAttempts = 5) => {
              for (let i = 0; i < maxAttempts; i++) {
                console.log(`Tentativo connessione ${i + 1}/${maxAttempts}...`);
                const isConnected = await checkConnection();
                if (isConnected) {
                  console.log('Connessione ripristinata');
                  return true;
                }
                await new Promise((r) => setTimeout(r, 2000));
              }
              throw new Error('Impossibile stabilire la connessione');
            };

            // Funzione di salvataggio singolo con retry e progress
            const saveSingleData = async (
              path,
              data,
              description,
              maxRetries = 3
            ) => {
              for (let j = 0; j < maxRetries; j++) {
                try {
                  // Verifica la connessione prima del salvataggio
                  const isConnected = await checkConnection();
                  if (!isConnected) {
                    console.log(
                      'Connessione persa, tentativo di riconnessione...'
                    );
                    await waitForConnection();
                  }

                  updateStatus(
                    'salvataggio',
                    `${description} (tentativo ${j + 1}/${maxRetries})`
                  );
                  const result = await new Promise((resolve, reject) => {
                    const timeoutId = setTimeout(() => {
                      reject(new Error(`Timeout salvataggio ${description}`));
                    }, 15000); // Ridotto da 30000 a 15000ms

                    path.put(data, (ack) => {
                      clearTimeout(timeoutId);
                      if (ack.err) {
                        reject(new Error(ack.err));
                      } else {
                        resolve(ack);
                      }
                    });
                  });

                  // Verifica il salvataggio con retry
                  updateStatus('salvataggio', `Verifica ${description}`);
                  let verifyAttempts = 0;
                  let verifyResult = null;

                  while (verifyAttempts < 3 && !verifyResult) {
                    verifyResult = await new Promise((resolve) => {
                      const timeoutId = setTimeout(() => resolve(null), 5000);
                      path.once((data) => {
                        clearTimeout(timeoutId);
                        resolve(data);
                      });
                    });

                    if (!verifyResult) {
                      console.log(
                        `Tentativo verifica ${
                          verifyAttempts + 1
                        } fallito, riprovo...`
                      );
                      await new Promise((r) => setTimeout(r, 2000));
                      verifyAttempts++;
                    }
                  }

                  if (!verifyResult) {
                    throw new Error(
                      `Verifica ${description} fallita dopo ${verifyAttempts} tentativi`
                    );
                  }

                  console.log(
                    `Salvataggio ${description} completato e verificato`
                  );
                  return result;
                } catch (error) {
                  console.log(
                    `Errore salvataggio ${description} (tentativo ${
                      j + 1
                    }/${maxRetries}):`,
                    error
                  );

                  if (j === maxRetries - 1) throw error;

                  // Attendi più a lungo tra i tentativi
                  await new Promise((r) => setTimeout(r, 2000));

                  // Riprova autenticazione se necessario
                  if (!user.is?.pub) {
                    updateStatus('riautenticazione');
                    await authenticateWithRetry();
                  }
                }
              }
            };

            // Salvataggio sequenziale con attese più lunghe tra le operazioni
            updateStatus('salvataggio', 'Dati utente (33%)');
            await saveSingleData(
              gun.get(DAPP_NAME).get('users').get(user.is.pub),
              userDataToSave,
              'dati utente'
            );
            await new Promise((r) => setTimeout(r, 2000));

            await saveSingleData(
              gun.get(DAPP_NAME).get('addresses').get(userDataToSave.address),
              userDataToSave,
              'address utente'
            );

            updateStatus('salvataggio', 'Profilo (66%)');
            await saveSingleData(
              gun.user().get(DAPP_NAME).get('profiles').get(user.is.pub),
              userDataToSave,
              'profilo'
            );
            await new Promise((r) => setTimeout(r, 2000));

            updateStatus('salvataggio', 'Indirizzo (100%)');
            const addressToUse = (
              userData?.internalWalletAddress || user.is.pub
            ).toLowerCase();
            await saveSingleData(
              gun.get(DAPP_NAME).get('addresses').get(addressToUse),
              userDataToSave,
              'indirizzo'
            );

            updateStatus('salvataggio-completato');
            return true;
          } catch (error) {
            console.log(`Tentativo salvataggio ${i + 1} fallito:`, error);

            if (i < retries - 1) {
              updateStatus('salvataggio', `Retry ${i + 2}/${retries}`);
              await new Promise((r) => setTimeout(r, 10000)); // Attesa più lunga tra i retry globali

              // Verifica connessione prima di riprovare
              await waitForConnection();

              if (!user.is?.pub) {
                updateStatus('riautenticazione');
                await authenticateWithRetry();
              }

              continue;
            }
            throw error;
          }
        }
      };

      await saveDataWithRetry();

      // Salva nel localStorage
      console.log('Preparazione dati wallet...');
      const walletData = {
        userPub: user.is.pub,
        address: userData?.internalWalletAddress || user.is.pub,
        internalWalletAddress: userData?.internalWalletAddress,
        internalWalletPk: userData?.internalWalletPk,
        externalWalletAddress: null,
        pair: userData?.pair,
        v_Pair: userData?.v_pair,
        s_Pair: userData?.s_pair,
        viewingPublicKey: userData?.viewingPublicKey,
        spendingPublicKey: userData?.spendingPublicKey,
        credentials: {
          username: credentials.username,
          password: credentials.password,
        },
      };
      console.log('Dati wallet preparati:', {
        ...walletData,
        privateKeys: '***',
      });

      // Salva la sessione direttamente nel localStorage
      console.log('Salvataggio sessione...');
      try {
        const walletKey = `gunWallet_${user.is.pub}`;
        localStorage.setItem(walletKey, JSON.stringify(walletData));
        console.log('Sessione salvata con successo');
      } catch (error) {
        console.error('Errore salvataggio sessione:', error);
        // Non blocchiamo la registrazione se il salvataggio della sessione fallisce
      }

      // Crea i certificati e aggiorna metriche
      console.log('Creazione certificati e aggiornamento metriche...');
      await Promise.all([
        createFriendRequestCertificate(),
        createNotificationCertificate(),
        updateGlobalMetrics('totalRegistrations', 1),
      ]);
      console.log('Certificati creati e metriche aggiornate');

      clearTimeout(timeoutId);
      updateStatus('completato');
      resolve({ success: true, pub: user.is.pub });
    } catch (error) {
      console.error('Errore registrazione:', error);
      clearTimeout(timeoutId);
      updateStatus('errore');
      resolve({
        success: false,
        errMessage: error.message || 'Errore durante la registrazione',
        status: registrationStatus,
      });
    }
  });

  // Imposta il timeout globale
  timeoutId = setTimeout(() => {
    console.log('Timeout globale registrazione scaduto');
    if (resolvePromise) {
      resolvePromise({
        success: false,
        errMessage: `Timeout durante la registrazione (stato: ${registrationStatus})`,
        status: registrationStatus,
      });
    }
  }, REGISTRATION_TIMEOUT);

  return registerPromise;
};

export default registerUser;
