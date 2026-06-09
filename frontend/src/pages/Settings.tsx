import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Trash2, AlertTriangle } from 'lucide-react';
import pkg from '../../../package.json';

interface SettingsProps {
  onClearAll: () => void;
}

export default function Settings({ onClearAll }: SettingsProps) {
  const navigate = useNavigate();
  const [systemPrompt, setSystemPrompt] = useState(
    () => localStorage.getItem('localmind_system_prompt') || 'You are a helpful local AI assistant.'
  );
  const [contextLength, setContextLength] = useState(
    () => localStorage.getItem('localmind_context_length') || '8192'
  );
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleSave = () => {
    localStorage.setItem('localmind_system_prompt', systemPrompt);
    localStorage.setItem('localmind_context_length', contextLength);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearAll = async () => {
    await onClearAll();
    setConfirmClear(false);
    navigate('/');
  };

  return (
    <div className="flex flex-col h-full bg-surface-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-surface-1">
        <button
          onClick={() => navigate('/')}
          className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-3 rounded-lg transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-semibold text-text-primary">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-2xl">
        {/* System Prompt */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-text-primary mb-1">System Prompt</h2>
          <p className="text-xs text-text-muted mb-3">
            This prompt is sent to the model before every conversation.
          </p>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={5}
            className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 transition-colors resize-none font-mono leading-relaxed"
          />
          <button
            onClick={handleSave}
            className="mt-2 flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-surface-0 rounded-lg text-sm font-medium transition-colors"
          >
            <Save size={14} />
            {saved ? 'Saved!' : 'Save'}
          </button>
        </section>

        {/* Context Window */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-text-primary mb-1">Model Context</h2>
          <p className="text-xs text-text-muted mb-3">
            Controls how many tokens the model can "see" at once (conversation history + response).
          </p>
          <select
            value={contextLength}
            onChange={(e) => setContextLength(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50 transition-colors cursor-pointer"
          >
            <option value="8192">8k tokens — Default, fastest</option>
            <option value="16384">16k tokens — 2× memory</option>
            <option value="32768">32k tokens — 4× memory (recommended)</option>
            <option value="65536">64k tokens — 8× memory</option>
            <option value="131072">128k tokens — Maximum, needs 32 GB+ RAM</option>
          </select>
          <p className="text-xs text-text-muted mt-2">
            Larger context = more RAM usage. Click Save, then start a new conversation to apply.
          </p>
        </section>

        {/* App Info */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-text-primary mb-3">About</h2>
          <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between items-baseline">
              <span className="text-text-muted">App</span>
              <div className="text-right">
                <span className="text-text-primary font-medium">LocalMind</span>
                <span className="text-text-muted text-xs ml-2">v{pkg.version}</span>
              </div>
            </div>
            <p className="text-xs text-text-muted pb-1">Offline AI · Powered by Ollama</p>
            <div className="border-t border-border" />
            <div className="flex justify-between">
              <span className="text-text-muted">Backend</span>
              <span className="text-text-primary font-mono">localhost:8000</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Ollama</span>
              <span className="text-text-primary font-mono">localhost:11434</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Data storage</span>
              <span className="text-text-primary font-mono text-xs">localmind.db (SQLite)</span>
            </div>
          </div>
        </section>

        {/* Danger zone */}
        <section>
          <h2 className="text-sm font-semibold text-red-400 mb-3">Danger Zone</h2>
          <div className="bg-surface-2 border border-red-500/20 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-text-primary font-medium">Clear all conversations</p>
                <p className="text-xs text-text-muted mt-1">This will permanently delete all conversations and messages. This cannot be undone.</p>
              </div>
              {!confirmClear ? (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm transition-colors"
                >
                  <Trash2 size={14} />
                  Clear all
                </button>
              ) : (
                <div className="shrink-0 flex flex-col items-end gap-2">
                  <div className="flex items-center gap-1 text-xs text-yellow-400">
                    <AlertTriangle size={12} /> Are you sure?
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmClear(false)} className="px-3 py-1 text-xs text-text-secondary hover:text-text-primary bg-surface-3 rounded-lg transition-colors">
                      Cancel
                    </button>
                    <button onClick={handleClearAll} className="px-3 py-1 text-xs text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors">
                      Yes, delete all
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
