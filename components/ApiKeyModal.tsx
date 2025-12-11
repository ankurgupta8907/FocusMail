import React, { useState, useEffect } from 'react';
import { Credentials } from '../types';

interface ApiKeyModalProps {
  onSave: (creds: Credentials) => void;
  onClose?: () => void;
  onDemo?: () => void;
  initialCredentials?: Credentials | null;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onSave, onClose, onDemo, initialCredentials }) => {
  const [clientId, setClientId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [origin, setOrigin] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialCredentials) {
      setClientId(initialCredentials.googleClientId);
      setApiKey(initialCredentials.geminiApiKey);
    }
    
    // Remove trailing slash for the user to copy/paste easily
    const currentOrigin = window.location.origin.replace(/\/$/, "");
    setOrigin(currentOrigin);
  }, [initialCredentials]);

  const validateClientId = (id: string): string | null => {
    if (!id) return "Client ID is required.";
    // Simple check to prevent swapping ID and Secret
    if (id.startsWith("GOCSPX-")) return "It looks like you pasted the Client Secret. Please use the Client ID.";
    if (!id.endsWith(".apps.googleusercontent.com")) return "Invalid format. Client ID must end with '.apps.googleusercontent.com'";
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanClientId = clientId.trim();
    const cleanApiKey = apiKey.trim();

    const validationError = validateClientId(cleanClientId);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (cleanClientId && cleanApiKey) {
      // Credentials are passed up to App state and saved to localStorage
      onSave({ googleClientId: cleanClientId, geminiApiKey: cleanApiKey });
      if (onClose) onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md shadow-2xl my-8 relative">
        {onClose && (
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-zinc-400 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        <h2 className="text-xl font-bold text-white mb-2">Configuration</h2>
        <p className="text-zinc-400 text-sm mb-6">
          Enter your API credentials to run the app. These are saved locally to your browser so you don't have to re-enter them on refresh.
        </p>

        {/* Origin Helper for OAuth Error 400 */}
        <div className="bg-zinc-800/50 p-4 rounded-lg border border-yellow-700/30 mb-4">
           <div className="flex items-start gap-2 mb-2">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5">
               <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
             </svg>
             <h3 className="font-semibold text-yellow-500 text-sm">Deployment Setup (Error 400)</h3>
           </div>
           <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
             Add this URL to <strong>Authorized JavaScript origins</strong> in Google Cloud Console.
           </p>
           
           <div className="relative group mb-2">
             <code className="block bg-black/40 p-2.5 rounded text-blue-300 text-xs font-mono break-all border border-zinc-700/50 select-all">
               {origin}
             </code>
           </div>
        </div>

        {/* Test User Helper for OAuth Error 403 */}
        <div className="bg-zinc-800/50 p-4 rounded-lg border border-blue-900/30 mb-6">
           <div className="flex items-start gap-2 mb-2">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-blue-400 shrink-0 mt-0.5">
               <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
             </svg>
             <h3 className="font-semibold text-blue-400 text-sm">Access Denied (Error 403)</h3>
           </div>
           <p className="text-xs text-zinc-400 leading-relaxed">
             While in "Testing" mode, you must explicitly add your email to the <strong>Test Users</strong> list in the <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">OAuth Consent Screen</a>.
           </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Google Cloud Client ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setError(null);
              }}
              placeholder="...apps.googleusercontent.com"
              className={`w-full bg-zinc-800 border rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-zinc-600 ${error ? 'border-red-500 focus:border-red-500' : 'border-zinc-700'}`}
              required
            />
            {error && (
              <p className="text-red-400 text-xs mt-1">{error}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Gemini API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-zinc-600"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors mt-4"
          >
            Start App
          </button>
        </form>

        {onDemo && (
            <div className="mt-4 pt-4 border-t border-zinc-800 text-center">
                 <button 
                  onClick={onDemo}
                  className="text-zinc-400 hover:text-white text-sm font-medium transition-colors"
                 >
                   Skip & Try Demo Mode
                 </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default ApiKeyModal;