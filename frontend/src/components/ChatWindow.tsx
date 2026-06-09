import React, { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import type { Message } from '../types';
import { Bot, Download } from 'lucide-react';

interface ChatWindowProps {
  messages: Message[];
  streamingContent: string;
  isStreaming: boolean;
  hasModels?: boolean;
  onNavigateModels?: () => void;
  onSendSuggestion?: (text: string) => void;
  onEditMessage?: (msgId: number, newContent: string) => void;
  genStats?: Record<number, { duration: number; tps: number }>;
}

const SUGGESTED_PROMPTS = [
  'Explain quantum computing in simple terms',
  'Write a Python script to rename files in a folder',
  'Help me debug this JavaScript code',
  'What are the best practices for REST API design?',
];

export default function ChatWindow({
  messages,
  streamingContent,
  isStreaming,
  hasModels = true,
  onNavigateModels,
  onSendSuggestion,
  onEditMessage,
  genStats,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Empty state
  if (messages.length === 0 && !isStreaming) {
    if (!hasModels) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-6">
          <div className="w-20 h-20 rounded-2xl bg-surface-2 border border-border flex items-center justify-center">
            <Bot size={40} className="text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-text-primary mb-2">Welcome to LocalMind</h1>
            <p className="text-text-secondary text-sm">Your fully offline AI assistant</p>
          </div>
          <div className="bg-surface-2 border border-border rounded-xl px-6 py-4 max-w-sm text-sm text-text-muted text-center">
            To start chatting, you need to download an AI model. Models run entirely on your machine — no internet required after download.
          </div>
          <button
            onClick={onNavigateModels}
            className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-surface-0 rounded-xl text-sm font-medium transition-colors"
          >
            <Download size={15} />
            Download your first model
          </button>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-6">
        <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center">
          <Bot size={32} className="text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-text-primary mb-2">LocalMind</h1>
          <p className="text-text-secondary text-sm">Your fully offline AI assistant. Running on your machine.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 max-w-lg w-full">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onSendSuggestion?.(prompt)}
              className="px-4 py-3 bg-surface-2 border border-border rounded-xl text-sm text-text-secondary hover:text-text-primary hover:border-accent/30 hover:bg-surface-3 cursor-pointer transition-colors text-left"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4">
      <div className="max-w-[760px] mx-auto w-full">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onEdit={msg.role === 'user' ? (newContent) => onEditMessage?.(msg.id, newContent) : undefined}
            genStats={genStats?.[msg.id]}
          />
        ))}

        {/* Streaming message */}
        {isStreaming && streamingContent && (
          <MessageBubble
            message={{
              id: -1,
              conversation_id: -1,
              role: 'assistant',
              content: streamingContent,
              files_attached: null,
              created_at: new Date().toISOString(),
            }}
            isStreaming
          />
        )}

        {/* Thinking indicator (before first token arrives) */}
        {isStreaming && !streamingContent && (
          <div className="flex gap-3 py-4">
            <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center shrink-0">
              <Bot size={14} className="text-text-secondary" />
            </div>
            <div className="px-4 py-3 bg-surface-2 border border-border rounded-2xl rounded-tl-sm">
              <div className="flex gap-1.5 items-center h-4">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
