export interface Conversation {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  model_used: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant';
  content: string;
  files_attached: string | null;
  created_at: string;
}

export interface OllamaStatus {
  running: boolean;
  models: string[];
  system_ram_gb?: number;
  error?: string;
}

export interface OllamaModel {
  name: string;
  model: string;
  size: number;
  modified_at: string;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
    family?: string;
  };
}

export interface PullProgress {
  status: 'starting' | 'downloading' | 'complete' | 'error' | 'cancelled' | string;
  percent: number;
  speed: string;
  error?: string;
}

export interface UploadedFile {
  name: string;
  type: string;
  extractedText?: string;
  base64?: string;
  size: number;
}
