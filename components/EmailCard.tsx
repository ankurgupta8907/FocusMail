import React, { useState, useEffect, useRef } from 'react';
import { EmailData, ClassificationCategory } from '../types';

interface EmailCardProps {
  email: EmailData;
  onMove: (email: EmailData, newCategory: ClassificationCategory) => void;
  onReply: (email: EmailData) => void;
}

const EmailCard: React.FC<EmailCardProps> = ({ email, onMove, onReply }) => {
  const [expanded, setExpanded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isPersonal = email.classification === ClassificationCategory.PERSONAL;

  // Auto-resize iframe when content loads or window resizes
  useEffect(() => {
    if (expanded && iframeRef.current && email.htmlBody) {
      const iframe = iframeRef.current;
      
      const resizeIframe = () => {
        if (iframe.contentWindow) {
          // Calculate height without resetting it first to prevent scroll jumping
          const body = iframe.contentWindow.document.body;
          const html = iframe.contentWindow.document.documentElement;
          
          const newHeight = Math.max(
            body.scrollHeight,
            body.offsetHeight,
            html.clientHeight,
            html.scrollHeight,
            html.offsetHeight
          );
          
          // Only update if significantly different to avoid jitter
          const currentHeight = parseInt(iframe.style.height || '0', 10);
          if (Math.abs(newHeight - currentHeight) > 5) {
             iframe.style.height = `${newHeight + 20}px`;
          }
        }
      };

      // Set content
      iframe.srcdoc = email.htmlBody;
      
      // Listen for load
      iframe.onload = resizeIframe;
      
      // Optional: Poll for size changes (e.g. images loading later)
      // We removed the 'reset to 100px' logic here to fix the scroll jumping issue
      const interval = setInterval(resizeIframe, 1000);

      return () => clearInterval(interval);
    }
  }, [expanded, email.htmlBody]);


  return (
    <div className={`bg-zinc-900 border ${isPersonal ? 'border-blue-900/50' : 'border-zinc-800'} rounded-lg p-4 mb-3 hover:border-zinc-600 transition-all shadow-sm group`}>
      <div className="flex justify-between items-start cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-zinc-100 truncate text-sm">{email.sender}</h3>
            <span className="text-xs text-zinc-500">
               {email.date ? new Date(email.date).toLocaleString(undefined, {
                 month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
               }) : ''}
            </span>
          </div>
          <p className="font-medium text-zinc-300 truncate text-sm">{email.subject}</p>
          <p className="text-zinc-500 truncate text-xs mt-1">{email.snippet}</p>
        </div>
        
        {/* Actions appearing on hover or when expanded */}
        <div className="flex flex-col gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={(e) => { e.stopPropagation(); onMove(email, isPersonal ? ClassificationCategory.NOT_PERSONAL : ClassificationCategory.PERSONAL); }}
            className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white"
            title={isPersonal ? "Move to Not Personal" : "Move to Personal"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="mt-4 pt-3 border-t border-zinc-800">
          <div className="mb-3">
             <div className="flex flex-col gap-2 mb-4">
                <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${isPersonal ? 'bg-blue-900/50 text-blue-200' : 'bg-zinc-700 text-zinc-300'}`}>
                      {email.classification}
                    </span>
                    <span className="text-xs text-zinc-500">AI Reason: {email.reasoning}</span>
                </div>
                
                {/* RAG Context Display */}
                {email.contextExample && (
                   <div className="flex items-start gap-1.5 text-xs text-zinc-500 bg-zinc-800/30 p-2 rounded-md border border-zinc-800">
                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-blue-400 shrink-0 mt-0.5">
                       <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd" />
                     </svg>
                     <div className="flex flex-col">
                       <span className="font-medium text-zinc-400 mb-0.5">Based on similar email you classified:</span>
                       <span className="text-zinc-500">
                         <strong>{email.contextExample.sender}</strong>: "{email.contextExample.subject}"
                         <span className="ml-1 opacity-70">({email.contextExample.classification})</span>
                       </span>
                     </div>
                   </div>
                )}
             </div>
             
             {/* HTML Email Body Renderer */}
             <div className="bg-white rounded-md overflow-hidden min-h-[100px]">
               <iframe 
                 ref={iframeRef}
                 title="Email Content"
                 className="w-full border-0 block"
                 sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
               />
             </div>
          </div>
          
          <div className="flex justify-end gap-2 pt-2">
            <button 
               onClick={(e) => { e.stopPropagation(); onReply(email); }}
               className="text-xs flex items-center gap-1 bg-zinc-100 hover:bg-white text-zinc-900 px-3 py-1.5 rounded-md font-medium transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
              </svg>
              Reply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailCard;