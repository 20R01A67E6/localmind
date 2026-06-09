import React from 'react';
import { Minus, Square, X, MessageSquare } from 'lucide-react';

declare global {
  interface Window {
    electronAPI?: {
      platform?: string;
      appVersion?: string;
      minimize?: () => void;
      maximize?: () => void;
      close?: () => void;
    };
  }
}

export default function TitleBar() {
  if (typeof window === 'undefined' || !window.electronAPI) return null;

  return (
    <div className="titlebar-drag flex items-center justify-between h-9 bg-surface-1 border-b border-border shrink-0 select-none">
      <div className="flex items-center gap-2 px-4">
        <div className="w-5 h-5 rounded bg-accent flex items-center justify-center">
          <MessageSquare size={11} className="text-surface-0" />
        </div>
        <span className="text-xs font-semibold text-text-secondary">LocalMind</span>
      </div>

      <div className="titlebar-no-drag flex items-center h-full">
        <button
          onClick={() => window.electronAPI?.minimize?.()}
          className="flex items-center justify-center w-11 h-full text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
          title="Minimize"
        >
          <Minus size={13} />
        </button>
        <button
          onClick={() => window.electronAPI?.maximize?.()}
          className="flex items-center justify-center w-11 h-full text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
          title="Maximize"
        >
          <Square size={11} />
        </button>
        <button
          onClick={() => window.electronAPI?.close?.()}
          className="flex items-center justify-center w-11 h-full text-text-muted hover:text-white hover:bg-red-600 transition-colors"
          title="Close"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
