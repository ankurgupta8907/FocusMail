import { EmailData, ClassificationCategory } from '../types';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

// Extract header value helper
const getHeader = (headers: any[], name: string): string => {
  if (!headers) return '';
  const header = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
  return header ? header.value : '';
};

// Robust Base64Url decode using TextDecoder for proper UTF-8 handling
const decodeBase64 = (data: string): string => {
  if (!data) return '';
  try {
    // Replace non-url compatible chars
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    // Decode base64 to binary string
    const binaryString = window.atob(base64);
    // Convert binary string to Uint8Array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    // Decode utf-8
    return new TextDecoder().decode(bytes);
  } catch (e) {
    console.warn("Failed to decode email body chunk", e);
    return '';
  }
};

// Strip HTML tags to get raw text for AI
const stripHtml = (html: string): string => {
  const tmp = document.createElement("DIV");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

// Extract both HTML and Text bodies
const extractContent = (payload: any): { text: string, html: string } => {
  let text = '';
  let html = '';

  const traverse = (node: any) => {
    // If we already have both, stop (optimization for simple emails)
    // But for multipart/mixed we might need to keep going. 
    // Usually multipart/alternative implies strict choice, but we want to grab what we can.
    
    if (node.mimeType === 'text/plain' && node.body && node.body.data) {
      // Concatenate if multiple parts (unlikely for strict alternative, possible for mixed)
      if (!text) text = decodeBase64(node.body.data);
    }
    
    if (node.mimeType === 'text/html' && node.body && node.body.data) {
      if (!html) html = decodeBase64(node.body.data);
    }

    if (node.parts) {
      node.parts.forEach(traverse);
    }
  };

  // Special case: payload itself is the body (not multipart)
  if (payload.body && payload.body.data) {
    const content = decodeBase64(payload.body.data);
    if (payload.mimeType === 'text/html') {
      html = content;
    } else if (payload.mimeType === 'text/plain') {
      text = content;
    }
  } else {
    traverse(payload);
  }

  // Fallbacks
  if (!text && html) {
    text = stripHtml(html);
  }
  if (!html && text) {
    // Basic wrapper for plain text display
    html = `<div style="font-family: sans-serif; white-space: pre-wrap; color: #000;">${text}</div>`;
  }

  return { text, html };
};

export const getUserProfile = async (accessToken: string): Promise<{ email: string; name: string }> => {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error('Failed to fetch user profile');
    return await response.json();
  } catch (error) {
    console.error("Error fetching user profile", error);
    throw error;
  }
};

export const fetchUnreadEmails = async (accessToken: string, limit: number = 10): Promise<EmailData[]> => {
  try {
    // 1. List messages - Filter for Primary category
    const listUrl = `${GMAIL_API_BASE}/messages?q=is:unread%20category:primary&maxResults=${limit}`;
    const listResponse = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!listResponse.ok) throw new Error('Failed to list messages');
    const listData = await listResponse.json();
    
    if (!listData.messages || listData.messages.length === 0) return [];

    // 2. Fetch details for each message
    const emailPromises = listData.messages.map(async (msg: { id: string; threadId: string }) => {
      const detailUrl = `${GMAIL_API_BASE}/messages/${msg.id}?format=full`;
      const detailResponse = await fetch(detailUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const detailData = await detailResponse.json();
      
      const subject = getHeader(detailData.payload.headers, 'Subject') || '(No Subject)';
      const sender = getHeader(detailData.payload.headers, 'From') || 'Unknown';
      const date = getHeader(detailData.payload.headers, 'Date');
      
      const { text, html } = extractContent(detailData.payload);
      const cleanBody = text ? text.substring(0, 3000) : detailData.snippet;

      return {
        id: detailData.id,
        threadId: detailData.threadId,
        snippet: detailData.snippet, 
        subject,
        sender,
        date,
        body: cleanBody, // For AI
        htmlBody: html, // For UI
        classification: ClassificationCategory.UNCLASSIFIED,
      };
    });

    return await Promise.all(emailPromises);

  } catch (error) {
    console.error("Error fetching emails", error);
    throw error;
  }
};

export const markEmailsAsRead = async (accessToken: string, emailIds: string[]): Promise<boolean> => {
  if (emailIds.length === 0) return true;
  try {
    const response = await fetch(`${GMAIL_API_BASE}/messages/batchModify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ids: emailIds,
        removeLabelIds: ['UNREAD']
      })
    });
    return response.ok;
  } catch (error) {
    console.error("Error marking as read", error);
    return false;
  }
};

export const sendReply = async (accessToken: string, email: EmailData, replyBody: string): Promise<boolean> => {
  const to = email.sender;
  const subject = email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`;
  
  // Construct email with proper UTF-8 handling
  const emailLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `In-Reply-To: ${email.id}`,
    `References: ${email.id}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    replyBody
  ];
  
  const emailContent = emailLines.join('\n');

  // Base64Url encode for sending
  const encodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    const response = await fetch(`${GMAIL_API_BASE}/messages/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw: encodedEmail,
        threadId: email.threadId
      })
    });

    return response.ok;
  } catch (error) {
    console.error("Error sending reply", error);
    return false;
  }
};

export const getMockEmails = (): EmailData[] => {
  const now = new Date();
  return [
      {
          id: 'mock-1',
          threadId: 't-1',
          snippet: 'Hey, are we still on for lunch tomorrow at 12?',
          subject: 'Lunch tomorrow?',
          sender: 'Alice Smith <alice@example.com>',
          date: new Date(now.getTime() - 1000 * 60 * 30).toISOString(), // 30 mins ago
          body: 'Hey,\n\nAre we still on for lunch tomorrow at 12? I was thinking of that new Italian place.\n\nBest,\nAlice',
          htmlBody: '<div style="font-family: sans-serif;">Hey,<br><br>Are we still on for lunch tomorrow at 12? I was thinking of that new <strong>Italian place</strong>.<br><br>Best,<br>Alice</div>',
          classification: ClassificationCategory.PERSONAL,
          originalClassification: ClassificationCategory.PERSONAL,
          reasoning: 'Direct correspondence from a specific person regarding a meeting.',
          isProcessing: false,
          contextExample: {
            sender: 'Alice Smith <alice@example.com>',
            subject: 'Dinner plans',
            classification: ClassificationCategory.PERSONAL
          }
      },
      {
          id: 'mock-2',
          threadId: 't-2',
          snippet: 'Your weekly report is ready to view.',
          subject: 'Weekly Analytics Report',
          sender: 'Analytics Bot <noreply@analytics.com>',
          date: new Date(now.getTime() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
          body: 'Hello,\n\nYour weekly analytics report is ready. Click here to view dashboard.',
          htmlBody: '<div style="font-family: sans-serif; padding: 20px; background: #f5f5f5; border-radius: 5px;"><h2 style="color: #333;">Weekly Report</h2><p>Your analytics are ready.</p><a href="#" style="background: blue; color: white; padding: 10px; text-decoration: none; border-radius: 4px; display: inline-block;">View Dashboard</a></div>',
          classification: ClassificationCategory.NOT_PERSONAL,
          originalClassification: ClassificationCategory.NOT_PERSONAL,
          reasoning: 'Automated notification from a bot.',
          isProcessing: false,
          contextExample: {
            sender: 'Analytics Bot <noreply@analytics.com>',
            subject: 'Monthly Analytics Report',
            classification: ClassificationCategory.NOT_PERSONAL
          }
      },
      {
          id: 'mock-3',
          threadId: 't-3',
          snippet: 'Don\'t miss out on our summer sale! 50% off everything.',
          subject: 'Summer Sale Starts Now!',
          sender: 'FashionStore <promo@fashionstore.com>',
          date: new Date(now.getTime() - 1000 * 60 * 60 * 5).toISOString(), // 5 hours ago
          body: 'Summer Sale!\n\nGet 50% off everything in store. valid until Sunday.',
          htmlBody: '<html><body style="margin:0;padding:0;"><div style="text-align:center;"><img src="https://via.placeholder.com/600x200?text=Summer+Sale" alt="Sale" style="width:100%;max-width:600px;"/><h1 style="color: #e91e63;">50% OFF EVERYTHING</h1><p>Valid until Sunday</p></div></body></html>',
          classification: ClassificationCategory.NOT_PERSONAL,
          originalClassification: ClassificationCategory.NOT_PERSONAL,
          reasoning: 'Marketing email sent to a broad list.',
          isProcessing: false
      },
       {
          id: 'mock-4',
          threadId: 't-4',
          snippet: 'Can you review the attached document before the meeting?',
          subject: 'Review needed: Q3 Projections',
          sender: 'Bob Jones <bob.jones@workplace.com>',
          date: new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
          body: 'Hi Ankur,\n\nCan you review the attached document before the meeting on Friday?\n\nThanks,\nBob',
          htmlBody: '<div style="font-family: Arial;">Hi Ankur,<br><br>Can you review the attached document before the meeting on Friday?<br><br>Thanks,<br>Bob</div>',
          classification: ClassificationCategory.PERSONAL,
          originalClassification: ClassificationCategory.PERSONAL,
          reasoning: 'Work related request from a colleague.',
          isProcessing: false
      },
      {
          id: 'mock-5',
          threadId: 't-5',
          snippet: 'Your order #12345 has been shipped!',
          subject: 'Order Shipped',
          sender: 'Amazon <shipment@amazon.com>',
          date: new Date(now.getTime() - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
          body: 'Hi,\n\nYour order has been shipped and will arrive tomorrow.',
          htmlBody: '<div style="background: #fff; padding: 20px;"><h3>Order #12345 Shipped</h3><p>Your item is on the way.</p><hr/><p style="color: #666;">Amazon Logistics</p></div>',
          classification: ClassificationCategory.NOT_PERSONAL,
          originalClassification: ClassificationCategory.NOT_PERSONAL,
          reasoning: 'Transactional update.',
          isProcessing: false
      }
  ];
}