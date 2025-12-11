import { GoogleGenAI, Type } from "@google/genai";
import { EmailData, ClassificationCategory, TrainingExample } from '../types';

const STORAGE_KEY = 'focusmail_training_data';

// Helper to get training data
export const getStoredTrainingData = (): TrainingExample[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

// Helper to save training data
export const saveTrainingExample = (email: EmailData, correctCategory: ClassificationCategory) => {
  const currentHistory = getStoredTrainingData();
  const newExample: TrainingExample = {
    subject: email.subject,
    sender: email.sender,
    snippet: email.snippet,
    userClassification: correctCategory,
    timestamp: Date.now()
  };
  
  // Filter out duplicates based on subject + sender to avoid redundant rules
  const uniqueHistory = currentHistory.filter(h => 
    !(h.subject === newExample.subject && h.sender === newExample.sender)
  );

  // Truncate to 100 most recent items as requested
  const updatedHistory = [newExample, ...uniqueHistory].slice(0, 100);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedHistory));
};

export const deleteTrainingExample = (timestamp: number) => {
  const currentHistory = getStoredTrainingData();
  const updatedHistory = currentHistory.filter(item => item.timestamp !== timestamp);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedHistory));
};

// --- SIMPLIFIED RAG IMPLEMENTATION ---

// Extract email address from "Name <email@domain.com>" format for stricter matching
const extractEmailAddress = (senderStr: string): string => {
  const match = senderStr.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase() : senderStr.toLowerCase();
};

// Scoring Algorithm: STRICT SENDER MATCH ONLY
const calculateRelevanceScore = (target: EmailData, candidate: TrainingExample): number => {
  const targetEmail = extractEmailAddress(target.sender);
  const candidateEmail = extractEmailAddress(candidate.sender);

  // Only return a score if the email addresses match exactly
  return targetEmail === candidateEmail ? 1 : 0;
};

// Retriever: Finds the top K most relevant examples (Exact sender match only)
const getRelevantExamples = (email: EmailData, history: TrainingExample[], limit: number = 10): TrainingExample[] => {
  if (history.length === 0) return [];

  // Filter for exact sender matches
  const matchingExamples = history.filter(example => calculateRelevanceScore(email, example) > 0);

  // Since history is stored newest-first, this automatically prioritizes recent interactions
  return matchingExamples.slice(0, limit);
};

// --- END RAG IMPLEMENTATION ---

export const classifyEmail = async (
  email: EmailData, 
  apiKey: string
): Promise<{ 
  category: ClassificationCategory; 
  reasoning: string;
  usedContext?: { sender: string; subject: string; classification: ClassificationCategory }
}> => {
  
  const ai = new GoogleGenAI({ apiKey });
  const allHistory = getStoredTrainingData();
  
  // RAG: Fetch only the most relevant examples for THIS specific email (Same Sender)
  const relevantExamples = getRelevantExamples(email, allHistory, 5); 
  
  // Pick the top example to show in UI as "Context"
  const topExample = relevantExamples.length > 0 ? relevantExamples[0] : undefined;
  
  const historyText = relevantExamples.length > 0 
    ? `Here are past emails from THIS SENDER that the user has classified. Follow these precedents exactly:\n` + 
      relevantExamples.map(h => 
        `- Subject: "${h.subject}", Snippet: "${h.snippet}" -> Classified as: ${h.userClassification}`
      ).join('\n')
    : "No past history from this sender found.";

  const prompt = `
    You are an intelligent email assistant for "FocusMail".
    Your goal is to classify an email into one of two categories: "Personal" or "Not Personal".
    
    Definitions:
    - Personal: Emails from real humans, direct correspondence, urgent alerts, work threads, or anything requiring specific action or response.
    - Not Personal: Newsletters, marketing, automated system notifications, receipts, social media updates, or generic blasts.

    ${historyText}

    Current Email to Classify:
    - Sender: ${email.sender}
    - Subject: ${email.subject}
    - Body Snippet: ${email.snippet}

    Provide the classification and a brief (1 sentence) explanation why.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { 
              type: Type.STRING, 
              enum: [ClassificationCategory.PERSONAL, ClassificationCategory.NOT_PERSONAL] 
            },
            reasoning: { type: Type.STRING }
          },
          required: ["category", "reasoning"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    
    return {
      category: result.category || ClassificationCategory.NOT_PERSONAL, // Default safe fallback
      reasoning: result.reasoning || "AI could not determine reason.",
      usedContext: topExample ? {
        sender: topExample.sender,
        subject: topExample.subject,
        classification: topExample.userClassification
      } : undefined
    };

  } catch (error) {
    console.error("Gemini Classification Error:", error);
    return {
      category: ClassificationCategory.UNCLASSIFIED,
      reasoning: "Error connecting to AI service."
    };
  }
};