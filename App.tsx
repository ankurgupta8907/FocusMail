import React, { useState, useEffect, useCallback } from 'react';
import { Credentials, EmailData, ClassificationCategory, TokenResponse, TokenClient, TrainingExample } from './types';
import ApiKeyModal from './components/ApiKeyModal';
import EmailCard from './components/EmailCard';
import ReplyModal from './components/ReplyModal';
import { fetchUnreadEmails, sendReply, getMockEmails, markEmailsAsRead, getUserProfile } from './services/gmailService';
import { classifyEmail, saveTrainingExample, getStoredTrainingData, deleteTrainingExample } from './services/geminiService';

const CREDENTIALS_KEY = 'focusmail_credentials';
const TOKEN_KEY = 'focusmail_token';

export const App: React.FC = () => {
  // Load credentials from storage if available
  const [credentials, setCredentials] = useState<Credentials | null>(() => {
    try {
      const stored = localStorage.getItem(CREDENTIALS_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [showSettings, setShowSettings] = useState(() => !localStorage.getItem(CREDENTIALS_KEY));
  
  const [tokenClient, setTokenClient] = useState<TokenClient | null>(null);
  
  // Load access token from storage if available and not expired
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(TOKEN_KEY);
      if (stored) {
        const { token, expiry } = JSON.parse(stored);
        if (Date.now() < expiry) {
          return token;
        } else {
          localStorage.removeItem(TOKEN_KEY); // Cleanup expired
        }
      }
      return null;
    } catch {
      return null;
    }
  });

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'inbox' | 'reclassifications'>('inbox');
  
  const [emails, setEmails] = useState<EmailData[]>([]);
  const [trainingData, setTrainingData] = useState<TrainingExample[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Reply Modal State
  const [replyingTo, setReplyingTo] = useState<EmailData | null>(null);

  // Get current active User ID for storage (Email for logged in, 'demo' for demo)
  const currentUserId = isDemoMode ? 'demo' : (userEmail || 'unknown');

  // Initialize Google Token Client
  useEffect(() => {
    if (credentials && window.google) {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: credentials.googleClientId,
        // Added userinfo.email scope to fetch user identity for data isolation
        scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.email',
        callback: (tokenResponse: TokenResponse) => {
          if (tokenResponse.error) {
            console.error("Token Error", tokenResponse);
            setError(`Google Auth Error: ${tokenResponse.error}. Check your Authorized Origins.`);
            return;
          }
          // Calculate expiry (expires_in is in seconds) - default to 1 hour if missing
          const expiresIn = tokenResponse.expires_in || 3599;
          const expiryTime = Date.now() + (expiresIn * 1000);
          
          const tokenData = { token: tokenResponse.access_token, expiry: expiryTime };
          localStorage.setItem(TOKEN_KEY, JSON.stringify(tokenData));
          
          setAccessToken(tokenResponse.access_token);
        },
      });
      setTokenClient(client);
    }
  }, [credentials]);

  // Fetch User Profile when token is available
  useEffect(() => {
    const fetchProfile = async () => {
      if (accessToken && !isDemoMode) {
        try {
          const profile = await getUserProfile(accessToken);
          setUserEmail(profile.email);
        } catch (e) {
          console.error("Could not fetch user profile", e);
          // If we fail to get profile, we might be using an old token without the new scope.
          // We can optionally force logout here, or just fall back. 
          // For now, let's keep it robust and not crash.
        }
      } else if (isDemoMode) {
        setUserEmail('demo@example.com');
      }
    };
    fetchProfile();
  }, [accessToken, isDemoMode]);

  // Load training data when tab switches to memory or initial load, DEPENDENT on currentUserId
  useEffect(() => {
    if (currentUserId !== 'unknown') {
      setTrainingData(getStoredTrainingData(currentUserId));
    }
  }, [activeTab, currentUserId]);

  // Fetch and Classify Emails
  const loadEmails = useCallback(async () => {
    if (isDemoMode) {
        setIsLoading(true);
        setError(null);
        // Simulate loading time
        setTimeout(() => {
          setEmails(getMockEmails()); // Mock emails now have originalClassification set
          setIsLoading(false);
        }, 800);
        return;
    }

    if (!accessToken || !credentials) return;
    if (!userEmail) return; // Wait for user profile to load for RAG context

    setIsLoading(true);
    setError(null);

    try {
      const fetchedEmails = await fetchUnreadEmails(accessToken);
      
      if (fetchedEmails.length === 0) {
        setEmails([]);
        setIsLoading(false);
        return;
      }

      // Set initial unclassified state to show UI immediately
      setEmails(fetchedEmails);

      // Classify in parallel, passing the userEmail for isolated RAG
      const classifiedEmails = await Promise.all(
        fetchedEmails.map(async (email) => {
          const result = await classifyEmail(email, credentials.geminiApiKey, userEmail);
          return {
            ...email,
            classification: result.category,
            originalClassification: result.category, // Capture baseline
            reasoning: result.reasoning,
            contextExample: result.usedContext // Capture RAG Context
          };
        })
      );

      setEmails(classifiedEmails);
    } catch (err: any) {
      if (err.message && err.message.includes('401')) {
         // Token might be invalid, force logout logic visually
         setError("Session expired. Please reconnect.");
         setAccessToken(null);
         localStorage.removeItem(TOKEN_KEY);
      } else {
         setError(err.message || "Failed to load emails");
      }
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, credentials, isDemoMode, userEmail]);

  // Trigger load when access token is available or demo mode starts
  useEffect(() => {
    if ((accessToken && userEmail) || isDemoMode) {
      loadEmails();
    }
  }, [accessToken, userEmail, loadEmails, isDemoMode]);

  const handleLogin = () => {
    if (tokenClient) {
      // Use prompt: 'select_account' to force the account picker, allowing user to switch accounts
      tokenClient.requestAccessToken({ prompt: 'select_account' });
    }
  };

  const handleLogout = () => {
    setAccessToken(null);
    setUserEmail(null);
    localStorage.removeItem(TOKEN_KEY);
    setEmails([]);
    setIsDemoMode(false);
    // We keep the credentials (API Key) so they don't have to re-enter them,
    // but we clear the Google Session.
  };

  const handleStartDemo = () => {
    setShowSettings(false);
    setIsDemoMode(true);
  };

  const handleMoveEmail = (email: EmailData, newCategory: ClassificationCategory) => {
    // 1. Optimistic UI Update
    setEmails(prev => prev.map(e => {
      if (e.id !== email.id) return e;
      
      return {
        ...e,
        classification: newCategory,
        reclassifiedAt: Date.now(),
        reasoning: "Manually reclassified by you."
      };
    }));

    // 2. "Learn" from this action, saved to isolated storage
    saveTrainingExample(email, newCategory, currentUserId);
    
    // Refresh training data immediately
    setTrainingData(getStoredTrainingData(currentUserId));
  };

  const handleReplySend = async (email: EmailData, body: string) => {
    if (isDemoMode) {
        alert("In Demo Mode, reply is simulated. Success!");
        return;
    }
    if (!accessToken) return;
    const success = await sendReply(accessToken, email, body);
    if (success) {
      alert("Reply sent successfully!");
    } else {
      alert("Failed to send reply.");
    }
  };

  const handleMarkAllRead = async (category: ClassificationCategory) => {
    const emailsToMark = emails.filter(e => {
        if (category === ClassificationCategory.PERSONAL) {
            return e.classification === ClassificationCategory.PERSONAL;
        } else {
             return e.classification === ClassificationCategory.NOT_PERSONAL || e.classification === ClassificationCategory.UNCLASSIFIED;
        }
    });

    if (emailsToMark.length === 0) return;
    
    // In real mode, call API
    if (!isDemoMode && accessToken) {
        if (!confirm(`Are you sure you want to mark ${emailsToMark.length} emails as read?`)) return;
        
        const ids = emailsToMark.map(e => e.id);
        const success = await markEmailsAsRead(accessToken, ids);
        if (!success) {
            alert("Failed to mark as read");
            return;
        }
    } else if (isDemoMode) {
       // Demo mode just visually clears them
       if (!confirm(`Demo Mode: Mark ${emailsToMark.length} emails as read?`)) return;
    }
    
    // Remove from UI
    const idsToRemove = new Set(emailsToMark.map(e => e.id));
    setEmails(prev => prev.filter(e => !idsToRemove.has(e.id)));
  };

  const handleDeleteTrainingExample = (timestamp: number) => {
    deleteTrainingExample(timestamp, currentUserId);
    setTrainingData(prev => prev.filter(item => item.timestamp !== timestamp));
  };

  const handleSaveCredentials = (creds: Credentials) => {
    setCredentials(creds);
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(creds));
    setShowSettings(false);
  };

  const personalEmails = emails.filter(e => e.classification === ClassificationCategory.PERSONAL);
  const notPersonalEmails = emails.filter(e => e.classification === ClassificationCategory.NOT_PERSONAL || e.classification === ClassificationCategory.UNCLASSIFIED);
  
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 font-sans flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800 p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDemoMode ? 'bg-orange-600' : 'bg-blue-600'}`}>
              {/* FocusMail Logo: 'Focal Point' - Abstract envelope with central focus dot */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-white">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <path d="M22 6l-10 7L2 6" />
                <circle cx="12" cy="13" r="2" className="fill-white stroke-none" />
              </svg>
            </div>
            <h1 className="text-xl font-bold tracking-tight">FocusMail {isDemoMode && <span className="text-orange-500 text-xs font-normal uppercase tracking-wider ml-1 border border-orange-500/50 px-1.5 py-0.5 rounded">Demo</span>}</h1>
          </div>

          {(accessToken || isDemoMode) && (
            <div className="flex bg-zinc-800/50 p-1 rounded-lg">
                <button 
                  onClick={() => setActiveTab('inbox')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${activeTab === 'inbox' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  Inbox
                </button>
                <button 
                  onClick={() => setActiveTab('reclassifications')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${activeTab === 'reclassifications' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  Reclassifications
                  {trainingData.length > 0 && (
                    <span className="bg-blue-900/60 text-blue-200 text-[10px] px-1.5 rounded-full min-w-[1.25rem] text-center">
                      {trainingData.length}
                    </span>
                  )}
                </button>
            </div>
          )}

          <div className="flex items-center gap-4">
            {/* Show current user email if logged in */}
            {!isDemoMode && userEmail && (
              <span className="hidden md:block text-xs text-zinc-500">
                {userEmail}
              </span>
            )}

            {/* Settings Button */}
            <button 
              onClick={() => setShowSettings(true)}
              className="text-zinc-400 hover:text-white transition-colors"
              title="API Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 0a20.87 20.87 0 0 1 1.439-4.295c.266-.58.975-.781 1.526-.461l.657.38c.524.301.71.96.463 1.511a19.118 19.118 0 0 1-.985 2.783m2.406 6.061c.431 2.068.531 4.254.3 6.42a18.03 18.03 0 0 1-1.24 6.8c-.286.788-1.163.98-1.745.382l-.679-.696a1.125 1.125 0 0 1 0-1.562l2.364-2.428m1.001-8.918a20.85 20.85 0 0 1 .3-6.42 20.85 20.85 0 0 0-1.24-6.8c-.286-.788-1.163-.98-1.745-.382l-.679.696a1.125 1.125 0 0 0 0 1.562l2.364 2.428" />
              </svg>
            </button>
            
            {(accessToken || isDemoMode) ? (
              <>
                 <button 
                  onClick={loadEmails}
                  className="p-2 rounded-full hover:bg-zinc-800 transition-colors"
                  title="Refresh"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                </button>
                
                <button 
                  onClick={handleLogout}
                  className="bg-zinc-800 hover:bg-red-900/30 text-zinc-300 hover:text-red-300 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-zinc-700 hover:border-red-900/50"
                >
                  Logout
                </button>
              </>
            ) : (
              <button 
                onClick={handleLogin}
                className="bg-zinc-100 hover:bg-white text-zinc-900 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                Connect Gmail
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-4 md:p-6 flex-1 w-full">
        {error && (
          <div className="bg-red-900/20 border border-red-900/50 text-red-300 p-4 rounded-lg mb-6 text-sm flex justify-between items-center">
            <span>{error}</span>
            <button 
              onClick={() => setShowSettings(true)}
              className="text-white underline text-xs ml-4"
            >
              Check Settings
            </button>
          </div>
        )}

        {!accessToken && !isDemoMode ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 max-w-lg w-full">
              <h2 className="text-2xl font-bold mb-4">Connect to get started</h2>
              <p className="text-zinc-400 mb-8">FocusMail uses AI to sort your inbox locally. Sign in with Google to fetch your unread messages.</p>
              
              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleLogin}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
                >
                   <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Sign in with Google
                </button>
                
                <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-zinc-800"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-zinc-900 px-2 text-zinc-500">Or</span>
                    </div>
                </div>

                <button 
                  onClick={handleStartDemo}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-8 py-3 rounded-xl font-medium transition-all"
                >
                  Try Demo Mode (No Login)
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'inbox' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Personal Column */}
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4 sticky top-20 bg-zinc-950 z-10 py-2 border-b border-zinc-900">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white">Personal</h2>
                      <span className="bg-blue-900/30 text-blue-400 text-xs font-medium px-2 py-0.5 rounded-full">
                        {personalEmails.length}
                      </span>
                    </div>
                     {personalEmails.length > 0 && (
                        <button 
                            onClick={() => handleMarkAllRead(ClassificationCategory.PERSONAL)}
                            className="text-xs text-zinc-500 hover:text-white flex items-center gap-1 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                            Mark all read
                        </button>
                    )}
                  </div>
                  
                  <div className="space-y-1 min-h-[200px] pb-10">
                    {personalEmails.length === 0 && !isLoading ? (
                      <div className="text-center py-10 border border-dashed border-zinc-800 rounded-lg">
                        <p className="text-zinc-500 text-sm">No personal emails found.</p>
                      </div>
                    ) : (
                      personalEmails.map(email => (
                        <EmailCard 
                          key={email.id} 
                          email={email} 
                          onMove={handleMoveEmail} 
                          onReply={setReplyingTo}
                        />
                      ))
                    )}
                  </div>
                </div>

                {/* Not Personal Column */}
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4 sticky top-20 bg-zinc-950 z-10 py-2 border-b border-zinc-900">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-zinc-400">Not Personal</h2>
                      <span className="bg-zinc-800 text-zinc-400 text-xs font-medium px-2 py-0.5 rounded-full">
                        {notPersonalEmails.length}
                      </span>
                    </div>
                    {notPersonalEmails.length > 0 && (
                        <button 
                            onClick={() => handleMarkAllRead(ClassificationCategory.NOT_PERSONAL)}
                            className="text-xs text-zinc-500 hover:text-white flex items-center gap-1 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                            Mark all read
                        </button>
                    )}
                  </div>

                  <div className="space-y-1 min-h-[200px] pb-10">
                    {notPersonalEmails.length === 0 && !isLoading ? (
                       <div className="text-center py-10 border border-dashed border-zinc-800 rounded-lg">
                        <p className="text-zinc-500 text-sm">All caught up!</p>
                      </div>
                    ) : (
                      notPersonalEmails.map(email => (
                        <EmailCard 
                          key={email.id} 
                          email={email} 
                          onMove={handleMoveEmail}
                          onReply={setReplyingTo}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'reclassifications' && (
              <div className="max-w-4xl mx-auto">
                 <div className="flex justify-between items-end mb-6">
                    <div>
                        <h2 className="text-xl font-bold">Reclassifications</h2>
                        <p className="text-zinc-400 text-sm mt-1">
                          {isDemoMode ? "Demo Mode" : `Rules for ${userEmail || 'current user'}`}: The AI uses these to learn your preferences.
                        </p>
                    </div>
                    <div className="text-xs text-zinc-500">
                        {trainingData.length} rules stored
                    </div>
                 </div>
                 
                 {trainingData.length === 0 ? (
                   <div className="text-center py-12 border border-zinc-800 rounded-xl bg-zinc-900/50">
                      <p className="text-zinc-400">No reclassification history yet.</p>
                      <p className="text-zinc-600 text-sm mt-1">Move emails between Personal and Not Personal to teach the AI.</p>
                   </div>
                 ) : (
                   <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-zinc-800/50 border-b border-zinc-800">
                          <tr>
                            <th className="px-6 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Example</th>
                            <th className="px-6 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Learned Category</th>
                            <th className="px-6 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {trainingData.map((item) => (
                            <tr key={item.timestamp} className="hover:bg-zinc-800/30 transition-colors">
                              <td className="px-6 py-4">
                                <p className="font-medium text-white truncate max-w-sm">{item.subject}</p>
                                <p className="text-xs text-zinc-500 truncate max-w-xs">{item.sender}</p>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-0.5 rounded text-xs ${item.userClassification === ClassificationCategory.PERSONAL ? 'bg-blue-900/30 text-blue-300' : 'bg-zinc-800 text-zinc-400'}`}>
                                    {item.userClassification}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <button 
                                    onClick={() => handleDeleteTrainingExample(item.timestamp)}
                                    className="text-zinc-500 hover:text-red-400 transition-colors"
                                    title="Delete this rule"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                    </svg>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                   </div>
                 )}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="max-w-7xl mx-auto p-6 text-center text-zinc-500 text-xs w-full border-t border-zinc-900 mt-auto">
        <p>
          Built with <a href="https://github.com/ankurgupta8907/FocusMail" target="_blank" rel="noreferrer" className="underline hover:text-zinc-300">Open Source</a> code. 
          Hosted on <a href="https://focusmail-254167712880.us-west1.run.app/" target="_blank" rel="noreferrer" className="underline hover:text-zinc-300">Google Cloud Run</a>.
        </p>
      </footer>

      {/* Settings / API Key Modal */}
      {showSettings && (
        <ApiKeyModal 
          onSave={handleSaveCredentials}
          onClose={(credentials || isDemoMode) ? () => setShowSettings(false) : undefined}
          onDemo={handleStartDemo}
          initialCredentials={credentials}
        />
      )}

      {/* Reply Modal */}
      {replyingTo && (
        <ReplyModal 
          email={replyingTo} 
          isOpen={!!replyingTo} 
          onClose={() => setReplyingTo(null)}
          onSend={handleReplySend}
        />
      )}
    </div>
  );
};

export const AppWrapper = () => <App />;
export { App as default };