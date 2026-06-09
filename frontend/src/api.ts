import type { Conversation, Message, OllamaStatus, OllamaModel, PullProgress } from './types';

const BASE = 'http://localhost:8000';

export const api = {
  async getConversations(): Promise<Conversation[]> {
    const res = await fetch(`${BASE}/conversations`);
    if (!res.ok) throw new Error('Failed to fetch conversations');
    return res.json();
  },

  async createConversation(title: string, model: string): Promise<Conversation> {
    const res = await fetch(`${BASE}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, model_used: model }),
    });
    if (!res.ok) throw new Error('Failed to create conversation');
    return res.json();
  },

  async deleteConversation(id: number): Promise<void> {
    const res = await fetch(`${BASE}/conversations/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete conversation');
  },

  async getMessages(conversationId: number): Promise<Message[]> {
    const res = await fetch(`${BASE}/conversations/${conversationId}/messages`);
    if (!res.ok) throw new Error('Failed to fetch messages');
    return res.json();
  },

  async getOllamaStatus(): Promise<OllamaStatus> {
    const res = await fetch(`${BASE}/ollama/status`);
    if (!res.ok) throw new Error('Failed to get Ollama status');
    return res.json();
  },

  async uploadFile(file: File): Promise<{ filename: string; extracted_text: string; file_type: string }> {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/files/upload`, { method: 'POST', body: form });
    if (!res.ok) throw new Error('Failed to upload file');
    return res.json();
  },

  async renameConversation(id: number, title: string): Promise<Conversation> {
    const res = await fetch(`${BASE}/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error('Failed to rename conversation');
    return res.json();
  },

  async deleteMessagesFrom(convId: number, msgId: number): Promise<void> {
    const res = await fetch(`${BASE}/conversations/${convId}/messages/from/${msgId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete messages');
  },

  async clearAllConversations(): Promise<void> {
    const res = await fetch(`${BASE}/conversations/all`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to clear conversations');
  },

  async getOllamaModels(): Promise<OllamaModel[]> {
    const res = await fetch(`${BASE}/ollama/models`);
    if (!res.ok) throw new Error('Failed to fetch model details');
    return res.json();
  },

  async pullModel(model: string): Promise<{ status: string }> {
    const res = await fetch(`${BASE}/ollama/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
    if (!res.ok) throw new Error('Failed to start pull');
    return res.json();
  },

  async getPullStatus(model: string): Promise<PullProgress> {
    const res = await fetch(`${BASE}/ollama/pull-status/${encodeURIComponent(model)}`);
    if (!res.ok) throw new Error('Failed to get pull status');
    return res.json();
  },

  async cancelPull(model: string): Promise<void> {
    await fetch(`${BASE}/ollama/pull-cancel/${encodeURIComponent(model)}`, { method: 'POST' });
  },

  async deleteModel(model: string): Promise<void> {
    const res = await fetch(`${BASE}/ollama/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
    if (!res.ok) throw new Error('Failed to delete model');
  },
};
