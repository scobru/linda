import React, { useEffect } from 'react';
import { authentication } from '../protocol';
import toast, { Toaster } from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { gun, user,DAPP_NAME } from '../protocol';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from '../config/wagmi';

export default function SignIn() {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [isRedirecting, setIsRedirecting] = React.useState(false);
  const navigate = useNavigate();
  const maxRetries = 3;
  const retryDelay = 1000; // 1 secondo tra i tentativi
  const { address, isConnected } = useAccount();
  const [loginMethod, setLoginMethod] = React.useState('traditional'); // 'traditional' o 'metamask'

  const handleLogin = async () => {
    if (isLoading || isRedirecting) return;
    if (!username.trim() || !password.trim()) {
      toast.error('Inserisci username e password');
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading('Accesso in corso...');

    let retryCount = 0;
    const tryLogin = async () => {
      try {
        // Assicurati che Gun sia connesso prima di procedere
        await new Promise((resolve) => {
          const checkConnection = () => {
            if (Object.keys(gun._.opt.peers).length > 0) {
              resolve();
            } else {
              if (retryCount < maxRetries) {
                setTimeout(checkConnection, retryDelay);
              } else {
                throw new Error('Impossibile connettersi al server');
              }
            }
          };
          checkConnection();
        });

        const result = await new Promise((resolve, reject) => {
          authentication.loginUser({ username, password }, (response) => {
            console.log('Login response:', response);
            if (response.success) resolve(response);
            else reject(new Error(response.errMessage));
          });
        });

        if (result.success) {
          // Attendi che l'utente sia completamente autenticato
          await new Promise((resolve) => {
            const checkAuth = () => {
              if (user.is && user.is.pub === result.pub) {
                resolve();
              } else {
                if (retryCount < maxRetries) {
                  retryCount++;
                  setTimeout(checkAuth, retryDelay);
                } else {
                  throw new Error('Errore di autenticazione: utente non inizializzato');
                }
              }
            };
            checkAuth();
          });

          toast.success('Accesso effettuato', { id: toastId });
          
          // Salva le informazioni dell'utente
          localStorage.setItem('userPub', user.is.pub);
          localStorage.setItem('userAlias', user.is.alias || username);
          
          setIsRedirecting(true);
          window.location.href = '/homepage';
        }
      } catch (error) {
        console.error('Login error:', error);
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`Tentativo ${retryCount} di ${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return tryLogin();
        }
        toast.error(error.message || "Errore durante l'accesso", { id: toastId });
        setIsLoading(false);
        setIsRedirecting(false);
      }
    };

    tryLogin();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isLoading && !isRedirecting) {
      handleLogin();
    }
  };

  // Effetto per gestire l'autenticazione con MetaMask
  useEffect(() => {
    if (isConnected && address) {
      handleMetaMaskLogin();
    }
  }, [isConnected, address]);

  const handleMetaMaskLogin = async () => {
    if (!address) {
      toast.error('Connetti prima il tuo wallet MetaMask');
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading('Accesso con MetaMask in corso...');

    try {
      const result = await authentication.loginWithMetaMask(address);
      
      if (result.success) {
        toast.success('Accesso effettuato con successo', { id: toastId });
        
        // Salva le informazioni dell'utente
        localStorage.setItem('userPub', result.pub);
        localStorage.setItem('userAlias', `eth:${address.slice(0, 6)}...${address.slice(-4)}`);
        localStorage.setItem('walletAddress', address);
        
        setIsRedirecting(true);
        navigate('/homepage', { replace: true });
      }
    } catch (error) {
      console.error('Errore login MetaMask:', error);
      if (error.message.includes('non registrato')) {
        navigate('/register', { 
          state: { isMetaMask: true, address } 
        });
      } else {
        toast.error(error.message || "Errore durante l'accesso con MetaMask", { id: toastId });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Se stiamo già reindirizzando, mostra un loader
  if (isRedirecting) {
    return (
      <div className="w-screen h-screen flex flex-col justify-center items-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        <p className="mt-4 text-gray-600">Reindirizzamento in corso...</p>
      </div>
    );
  }

  return (
    <>
      <div className="w-screen h-screen flex flex-col justify-center items-center bg-gray-50">
        <div className="text-center -mt-24">
          <p className="text-4xl mb-8">Accedi</p>
          
          {/* Bottoni per scegliere il metodo di login */}
          <div className="flex justify-center gap-2 mb-6">
            <button
              onClick={() => setLoginMethod('traditional')}
              className={`w-40 py-2 rounded-full transition-colors ${
                loginMethod === 'traditional'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Username
            </button>
            <button
              onClick={() => setLoginMethod('metamask')}
              className={`w-40 py-2 rounded-full transition-colors ${
                loginMethod === 'metamask'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              MetaMask
            </button>
          </div>

          {loginMethod === 'traditional' ? (
            // Form tradizionale
            <div className="flex flex-col place-items-center">
              <input
                className="w-80 h-14 rounded-full text-center border border-gray-300 mb-3"
                type="text"
                onChange={(e) => setUsername(e.target.value)}
                onKeyPress={handleKeyPress}
                value={username}
                placeholder="enter username"
                disabled={isLoading || isRedirecting}
              />
              <input
                className="w-80 h-14 rounded-full text-center border border-gray-300 mb-3"
                type="password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                value={password}
                placeholder="enter password"
                disabled={isLoading || isRedirecting}
              />
              <button
                onClick={handleLogin}
                disabled={isLoading || isRedirecting}
                className="w-80 h-14 bg-blue-500 hover:bg-blue-700 text-white font-bold rounded-full mb-3"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Accesso in corso...
                  </div>
                ) : (
                  'Login'
                )}
              </button>
            </div>
          ) : (
            // Sezione MetaMask
            <div className="flex flex-col items-center">
              <div className="w-80 mb-3">
                <ConnectButton.Custom>
                  {({
                    account,
                    chain,
                    openAccountModal,
                    openChainModal,
                    openConnectModal,
                    mounted,
                  }) => {
                    return (
                      <div
                        {...(!mounted && {
                          'aria-hidden': true,
                          'style': {
                            opacity: 0,
                            pointerEvents: 'none',
                            userSelect: 'none',
                          },
                        })}
                        className="w-full"
                      >
                        {(() => {
                          if (!mounted || !account || !chain) {
                            return (
                              <button 
                                onClick={openConnectModal}
                                type="button"
                                className="w-full h-14 bg-blue-500 hover:bg-blue-700 text-white font-bold rounded-full"
                              >
                                Connetti Wallet
                              </button>
                            );
                          }
                          return (
                            <div className="w-full text-center">
                              <button
                                onClick={openAccountModal}
                                type="button"
                                className="w-full h-14 bg-blue-500 hover:bg-blue-700 text-white font-bold rounded-full"
                              >
                                {account.displayName}
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  }}
                </ConnectButton.Custom>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 mt-6">
            <Link to="/landing">
              <button className="w-80 h-14 bg-gray-500 hover:bg-gray-600 text-white font-bold rounded-full">
                Torna indietro
              </button>
            </Link>
            
            <Link to="/register">
              <button className="w-80 h-14 bg-white hover:bg-gray-100 text-blue-500 font-bold rounded-full border-2 border-blue-500">
                Crea account
              </button>
            </Link>
          </div>

          <div className="mt-4 text-sm text-gray-600">
            Non hai un account? Registrati ora!
          </div>
        </div>
      </div>
      <Toaster />
    </>
  );
}
