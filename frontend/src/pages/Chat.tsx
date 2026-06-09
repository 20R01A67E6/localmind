import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertTriangle, Download, PanelLeft, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ChatWindow from '../components/ChatWindow';
import InputBar from '../components/InputBar';
import ModelSelector from '../components/ModelSelector';
import type { Conversation, Message, OllamaStatus, UploadedFile } from '../types';
import { api } from '../api';
import { cn } from '../lib/utils';

const BASE = 'http://localhost:8000';

interface ChatProps {
  conversationId: number | null;
  conversationTitle?: string;
  selectedModel: string;
  ollamaStatus: OllamaStatus;
  onModelChange: (model: string) => void;
  onConversationUpdate: (conv: Conversation) => void;
  onNewChat: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onLastMessageChange?: (convId: number, preview: string) => void;
}

function formatCtxTokens(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}

export default function Chat({
  conversationId,
  conversationTitle,
  selectedModel,
  ollamaStatus,
  onModelChange,
  onConversationUpdate,
  onNewChat,
  sidebarOpen,
  onToggleSidebar,
  onLastMessageChange,
}: ChatProps) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [genStats, setGenStats] = useState<Record<number, { duration: number; tps: number }>>({});
  const abortRef = useRef<AbortController | null>(null);
  const systemPrompt = localStorage.getItem('localmind_system_prompt') || 'You are a helpful local AI assistant.';

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    api.getMessages(conversationId).then((msgs) => {
      setMessages(msgs);
      if (msgs.length > 0) {
        onLastMessageChange?.(conversationId, msgs[msgs.length - 1].content);
      }
    }).catch(console.error);
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(async (text: string, files: UploadedFile[]) => {
    if (!conversationId || isStreaming) return;

    const userMsg: Message = {
      id: Date.now(),
      conversation_id: conversationId,
      role: 'user',
      content: text,
      files_attached: files.length > 0 ? JSON.stringify(files.map((f) => f.name)) : null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setStreamingContent('');

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const numCtx = parseInt(localStorage.getItem('localmind_context_length') || '8192', 10);
    const streamStart = Date.now();
    let tokenCount = 0;

    try {
      const res = await fetch(`${BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          message: text,
          model: selectedModel,
          system_prompt: systemPrompt,
          num_ctx: numCtx,
          files: files.map((f) => ({
            name: f.name,
            type: f.type,
            extracted_text: f.extractedText,
            base64: f.base64,
          })),
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                tokenCount++;
                fullContent += parsed.token;
                setStreamingContent(fullContent);
              } else if (parsed.error) {
                fullContent += `\n\n**Error:** ${parsed.error}`;
                setStreamingContent(fullContent);
              } else if (parsed.conversation) {
                onConversationUpdate(parsed.conversation);
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }

      const updated = await api.getMessages(conversationId);
      setMessages(updated);

      // Record generation stats on the last assistant message
      const lastMsg = updated[updated.length - 1];
      if (lastMsg?.role === 'assistant' && tokenCount > 0) {
        const duration = (Date.now() - streamStart) / 1000;
        setGenStats((prev) => ({
          ...prev,
          [lastMsg.id]: { duration, tps: tokenCount / Math.max(duration, 0.1) },
        }));
      }

      // Update sidebar preview
      if (updated.length > 0) {
        onLastMessageChange?.(conversationId, updated[updated.length - 1].content);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            conversation_id: conversationId,
            role: 'assistant',
            content: `Error: ${err.message}. Make sure Ollama is running and the selected model is available.`,
            files_attached: null,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
      abortRef.current = null;
    }
  }, [conversationId, isStreaming, selectedModel, systemPrompt, onConversationUpdate, onLastMessageChange]);

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleRegenerate = useCallback(async () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg || isStreaming) return;
    await handleSend(lastUserMsg.content, []);
  }, [messages, isStreaming, handleSend]);

  const pendingSuggestionRef = useRef<string | null>(null);
  useEffect(() => {
    if (conversationId && pendingSuggestionRef.current) {
      const text = pendingSuggestionRef.current;
      pendingSuggestionRef.current = null;
      handleSend(text, []);
    }
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSuggestion = useCallback((text: string) => {
    if (conversationId) {
      handleSend(text, []);
    } else {
      pendingSuggestionRef.current = text;
      onNewChat();
    }
  }, [conversationId, handleSend, onNewChat]);

  const handleEditMessage = useCallback(async (msgId: number, newContent: string) => {
    if (!conversationId || isStreaming) return;
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx === -1) return;
    setMessages(messages.slice(0, idx));
    try {
      await api.deleteMessagesFrom(conversationId, msgId);
    } catch { /* continue even if delete fails */ }
    handleSend(newContent, []);
  }, [conversationId, isStreaming, messages, handleSend]);

  // Context usage estimate (read fresh each render so it reflects the current setting)
  const contextLimit = parseInt(localStorage.getItem('localmind_context_length') || '8192', 10);
  const contextTokens = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
  const contextPct = Math.min(contextTokens / contextLimit, 1);

  const ollamaWarning = !ollamaStatus.running
    ? { level: 'error', msg: 'Ollama not detected — run: ollama serve' }
    : ollamaStatus.models.length === 0
    ? { level: 'warn', msg: 'No models found — run: ollama pull llama3.1' }
    : null;

  const hasModels = ollamaStatus.models.length > 0;
  const showRegenerate =
    !isStreaming &&
    messages.length > 0 &&
    messages[messages.length - 1]?.role === 'assistant';

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface-1 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {!sidebarOpen && (
            <button onClick={onToggleSidebar} className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-3 rounded-lg transition-colors shrink-0">
              <PanelLeft size={16} />
            </button>
          )}
          <span className="text-sm text-text-secondary font-medium truncate">
            {conversationTitle ?? (conversationId ? 'Conversation' : 'LocalMind')}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Context usage indicator */}
          {messages.length > 0 && (
            <div
              className={cn(
                'flex items-center px-2 py-0.5 rounded-full border text-[10px] font-mono',
                contextPct > 0.8
                  ? 'border-red-500/30 bg-red-500/10 text-red-400'
                  : contextPct > 0.5
                  ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
                  : 'border-green-500/30 bg-green-500/10 text-green-400'
              )}
              title="Estimated context usage (~4 chars = 1 token)"
            >
              {/* Compact: no spaces or "tokens" label (narrow screens) */}
              <span className="sm:hidden">{formatCtxTokens(contextTokens)}/{formatCtxTokens(contextLimit)}</span>
              {/* Full: spaced with "tokens" label (wider screens) */}
              <span className="hidden sm:inline">{formatCtxTokens(contextTokens)} / {formatCtxTokens(contextLimit)} tokens</span>
            </div>
          )}
          <ModelSelector
            selectedModel={selectedModel}
            ollamaStatus={ollamaStatus}
            onModelChange={onModelChange}
          />
        </div>
      </div>

      {/* Ollama warning banner */}
      {ollamaWarning && (
        <div className={`flex items-center gap-2 px-4 py-2 text-xs ${
          ollamaWarning.level === 'error'
            ? 'bg-red-500/10 border-b border-red-500/20 text-red-300'
            : 'bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-300'
        }`}>
          <AlertTriangle size={13} />
          <span>{ollamaWarning.msg}</span>
          {!ollamaStatus.running && (
            <a
              href="https://ollama.ai"
              target="_blank"
              rel="noreferrer"
              className="ml-auto flex items-center gap-1 hover:underline"
            >
              <Download size={12} /> Get Ollama
            </a>
          )}
        </div>
      )}

      {/* Chat area */}
      <ChatWindow
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
        hasModels={hasModels}
        onNavigateModels={() => navigate('/models')}
        onSendSuggestion={handleSuggestion}
        onEditMessage={handleEditMessage}
        genStats={genStats}
      />

      {/* Regenerate */}
      {showRegenerate && (
        <div className="flex justify-center pb-1 shrink-0">
          <button
            onClick={handleRegenerate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-muted hover:text-text-primary bg-surface-2 hover:bg-surface-3 border border-border rounded-lg transition-colors"
          >
            <RotateCcw size={12} />
            Regenerate
          </button>
        </div>
      )}

      {/* Input */}
      <InputBar
        onSend={handleSend}
        isStreaming={isStreaming}
        onCancel={handleCancel}
        disabled={!conversationId}
      />
    </div>
  );
}
