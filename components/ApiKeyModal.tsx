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
  const [showHelp, setShowHelp] = useState(false);

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
        <p className="text-zinc-400 text-sm mb-4">
          Enter your API credentials to run the app. These are saved locally to your browser.
        </p>

        <button 
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          className="text-blue-400 hover:text-blue-300 text-sm font-medium mb-4 flex items-center gap-1 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
          </svg>
          {showHelp ? "Hide Instructions" : "How do I get these?"}
        </button>

        {showHelp && (
          <div className="bg-zinc-800/50 p-4 rounded-lg border border-zinc-700 mb-6 text-sm text-zinc-300 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <div>
              <h3 className="font-semibold text-white mb-1">1. Google Cloud Client ID</h3>
              <ol className="list-decimal pl-4 space-y-1 text-xs text-zinc-400">
                <li>Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Google Cloud Console</a>.</li>
                <li>Create a project and enable the <strong>Gmail API</strong>.</li>
                <li>Go to <strong>Credentials</strong> → <strong>Create Credentials</strong> → <strong>OAuth client ID</strong>.</li>
                <li>Select <strong>Web application</strong>.</li>
                <li>Add <code className="bg-black/30 px-1 rounded text-blue-200">{origin}</code> to <strong>Authorized JavaScript origins</strong>.</li>
                <li>Copy the Client ID ending in <code className="text-zinc-500">.apps.googleusercontent.com</code>.</li>
              </ol>
            </div>
            
            <div>
              <h3 className="font-semibold text-white mb-1">2. Important: Test Users</h3>
              <p className="text-xs text-zinc-400 mb-1">Since your app is not verified by Google, you must manually allow your email.</p>
              <ol className="list-decimal pl-4 space-y-1 text-xs text-zinc-400">
                <li>Go to <strong>OAuth consent screen</strong> in Google Cloud Console.</li>
                <li>Ensure Publishing Status is <strong>Testing</strong>.</li>
                <li>Under <strong>Test users</strong>, click <strong>Add Users</strong> and enter your Gmail address.</li>
                <li><em>Without this, you will get an "Access Denied" (403) error.</em></li>
              </ol>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-1">3. Gemini API Key</h3>
              <ol className="list-decimal pl-4 space-y-1 text-xs text-zinc-400">
                <li>Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Google AI Studio</a>.</li>
                <li>Click <strong>Get API key</strong> and copy it.</li>
              </ol>
            </div>
          </div>
        )}

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