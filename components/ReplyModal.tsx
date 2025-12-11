import React, { useState } from 'react';
import { EmailData } from '../types';

interface ReplyModalProps {
  email: EmailData;
  isOpen: boolean;
  onClose: () => void;
  onSend: (email: EmailData, body: string) => Promise<void>;
}

const ReplyModal: React.FC<ReplyModalProps> = ({ email, isOpen, onClose, onSend }) => {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!body.trim()) return;
    setSending(true);
    await onSend(email, body);
    setSending(false);
    setBody('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
          <div>
            <h3 className="text-white font-semibold">Reply to {email.sender}</h3>
            <p className="text-xs text-zinc-500 truncate max-w-md">{email.subject}</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-4 flex-1 overflow-auto">
           <textarea
             className="w-full h-64 bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
             placeholder="Write your reply here..."
             value={body}
             onChange={(e) => setBody(e.target.value)}
             autoFocus
           />
        </div>

        <div className="p-4 border-t border-zinc-800 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSend}
            disabled={sending || !body.trim()}
            className={`px-6 py-2 rounded-lg text-sm font-semibold text-white transition-colors flex items-center gap-2
              ${sending ? 'bg-blue-800 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {sending ? (
              <>
                 <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Sending...
              </>
            ) : (
              <>
                Send Reply
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M3.105 2.289a.75.75 0 0 0-.826.95l1.414 4.925A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.89 28.89 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.289Z" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReplyModal;
