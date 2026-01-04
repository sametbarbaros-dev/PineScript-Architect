export interface PineScriptParams {
  prompt: string;
  scriptType: 'indicator' | 'strategy';
  overlay: boolean;
  version: string;
  model: string;
  customContext?: string; // New: For Knowledge Base / PDF text
}

export interface GeneratedResult {
  code: string;
  explanation: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export enum LoadingState {
  IDLE = 'IDLE',
  NORMALIZING = 'NORMALIZING', // New: Cleaning user input
  OPTIMIZING = 'OPTIMIZING',   // New: Adding pro defaults
  GENERATING = 'GENERATING',   // Standard generation
  VALIDATING = 'VALIDATING',   // New: Virtual test pipeline
  REFINING = 'REFINING',       // New: Refinement stage
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface HistoryItem {
  id: string;
  params: PineScriptParams;
  result: GeneratedResult;
  timestamp: number;
}