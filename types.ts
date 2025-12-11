export enum ClassificationCategory {
  PERSONAL = 'Personal',
  NOT_PERSONAL = 'Not Personal',
  UNCLASSIFIED = 'Unclassified'
}

export interface ContextExample {
  sender: string;
  subject: string;
  classification: ClassificationCategory;
}

export interface EmailData {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  sender: string;
  date: string;
  body?: string; // Text body for AI
  htmlBody?: string; // HTML body for UI rendering
  classification: ClassificationCategory;
  originalClassification?: ClassificationCategory; // The initial AI classification
  reclassifiedAt?: number; // Timestamp of manual reclassification
  reasoning?: string;
  contextExample?: ContextExample; // The top historical example used for RAG
  isProcessing?: boolean;
}

export interface TrainingExample {
  subject: string;
  sender: string;
  snippet: string;
  userClassification: ClassificationCategory;
  timestamp: number;
}

export interface Credentials {
  geminiApiKey: string;
  googleClientId: string;
}

// Google Identity Services Types
declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
          }) => TokenClient;
          hasGrantedAllScopes: (tokenResponse: TokenResponse, firstScope: string, ...restScopes: string[]) => boolean;
        };
      };
    };
  }
}

export interface TokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  error?: string;
}