import React, { useState } from 'react';
import { DataBase } from '../zen/db';
import { type AuthResult } from '../zen/types';

interface AuthPageProps {
  db: DataBase;
  onAuth: (username: string) => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ db, onAuth }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [keyPair, setKeyPair] = useState('');
  const [useKeyPair, setUseKeyPair] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let result: AuthResult;
      
      if (isLogin) {
        if (useKeyPair) {
          try {
            const pair = JSON.parse(keyPair);
            result = await db.loginWithPair(username, pair);
          } catch (e) {
            setError('Invalid Key Pair JSON');
            setLoading(false);
            return;
          }
        } else {
          result = await db.login(username, password);
        }
      } else {
        result = await db.signUp(username, password);
      }

      if (result.success && result.username) {
        onAuth(result.username);
      } else {
        setError(result.error || 'Authentication failed');
      }
    } catch (e: any) {
      setError(e.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Enhanced Background Blobs */}
      <div className="absolute top-0 -left-4 w-96 h-96 bg-primary rounded-full mix-blend-screen filter blur-[80px] opacity-10 animate-blob"></div>
      <div className="absolute -bottom-8 -right-4 w-96 h-96 bg-secondary rounded-full mix-blend-screen filter blur-[80px] opacity-10 animate-blob animation-delay-2000"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent/5 rounded-full filter blur-[120px] pointer-events-none"></div>

      <div className="max-w-md w-full glass-panel p-8 rounded-[2.5rem] shadow-2xl z-10 border border-white/10">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-white mb-2 tracking-tighter">LINDA</h1>
          <p className="text-white/60 text-sm">Decentralized. Private. Forever.</p>
        </div>

        <div className="flex bg-black/20 p-1 rounded-xl mb-6">
          <button 
            onClick={() => setIsLogin(true)}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${isLogin ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}
          >
            Login
          </button>
          <button 
            onClick={() => setIsLogin(false)}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${!isLogin ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text text-white/70 font-bold uppercase text-[10px] tracking-widest">Username</span>
            </label>
            <input 
              type="text" 
              placeholder="shogun_user" 
              className="input input-bordered bg-white/5 border-white/10 text-white focus:border-primary transition-all rounded-xl"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          {isLogin && (
            <div className="flex items-center space-x-2 mb-2">
              <input 
                type="checkbox" 
                className="checkbox checkbox-xs checkbox-primary" 
                checked={useKeyPair}
                onChange={(e) => setUseKeyPair(e.target.checked)}
              />
              <span className="text-xs text-white/50">Login with Key Pair</span>
            </div>
          )}

          {!useKeyPair ? (
            <div className="form-control">
              <label className="label">
                <span className="label-text text-white/70 font-bold uppercase text-[10px] tracking-widest">Password</span>
              </label>
              <input 
                type="password" 
                placeholder="••••••••" 
                className="input input-bordered bg-white/5 border-white/10 text-white focus:border-primary transition-all rounded-xl"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={!useKeyPair}
              />
            </div>
          ) : (
            <div className="form-control">
              <label className="label">
                <span className="label-text text-white/70 font-bold uppercase text-[10px] tracking-widest">Key Pair (JSON)</span>
              </label>
              <textarea 
                placeholder='{"pub": "...", "priv": "...", ...}' 
                className="textarea textarea-bordered bg-white/5 border-white/10 text-white focus:border-primary transition-all rounded-xl h-24 font-mono text-xs"
                value={keyPair}
                onChange={(e) => setKeyPair(e.target.value)}
                required={useKeyPair}
              />
            </div>
          )}

          {error && (
            <div className="alert alert-error py-2 rounded-xl text-xs font-bold border-none bg-red-500/20 text-red-200">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="btn btn-primary w-full rounded-xl font-black uppercase tracking-widest shadow-lg shadow-primary/20 mt-4"
          >
            {loading ? <span className="loading loading-spinner"></span> : (isLogin ? 'Enter The Grid' : 'Create Identity')}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/5 text-center">
          <p className="text-[10px] text-white/30 uppercase tracking-widest font-bold">
            Powered by Zen Decentralized Graph
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
