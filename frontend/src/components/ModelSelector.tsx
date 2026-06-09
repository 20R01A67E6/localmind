import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Circle } from 'lucide-react';
import type { OllamaStatus } from '../types';
import { cn } from '../lib/utils';

interface ModelSelectorProps {
  selectedModel: string;
  ollamaStatus: OllamaStatus;
  onModelChange: (model: string) => void;
}

export default function ModelSelector({ selectedModel, ollamaStatus, onModelChange }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const statusColor = ollamaStatus.running
    ? ollamaStatus.models.length > 0 ? 'text-green-400' : 'text-yellow-400'
    : 'text-red-400';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 hover:bg-surface-3 border border-border rounded-lg text-sm transition-colors"
      >
        <Circle size={8} className={cn('fill-current', statusColor)} />
        <span className="text-text-primary text-xs font-medium">
          {selectedModel || 'No model'}
        </span>
        <ChevronDown size={13} className="text-text-muted" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-surface-2 border border-border rounded-lg shadow-xl z-50 overflow-hidden animate-fade-in">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[11px] text-text-muted font-medium uppercase tracking-wide">Available Models</p>
          </div>
          {ollamaStatus.models.length === 0 ? (
            <div className="px-3 py-3 text-xs text-text-muted">
              {ollamaStatus.running ? 'No models found' : 'Ollama not running'}
            </div>
          ) : (
            ollamaStatus.models.map((model) => (
              <button
                key={model}
                onClick={() => { onModelChange(model); setOpen(false); }}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm transition-colors hover:bg-surface-3',
                  selectedModel === model ? 'text-accent' : 'text-text-primary'
                )}
              >
                {model}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
