import React, { useState, useRef, useCallback } from 'react';
import { Paperclip, Send, X, Square } from 'lucide-react';
import { api } from '../api';
import type { UploadedFile } from '../types';
import { cn } from '../lib/utils';

interface InputBarProps {
  onSend: (message: string, files: UploadedFile[]) => void;
  isStreaming: boolean;
  onCancel: () => void;
  disabled: boolean;
}

const ALLOWED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/png', 'image/jpeg', 'image/jpg'];
const ALLOWED_EXT = ['.pdf', '.docx', '.txt', '.png', '.jpg', '.jpeg'];

export default function InputBar({ onSend, isStreaming, onCancel, disabled }: InputBarProps) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const adjustHeight = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed && files.length === 0) return;
    if (isStreaming || disabled) return;
    onSend(trimmed, files);
    setText('');
    setFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    e.target.value = '';

    for (const file of selected) {
      if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXT.some((ext) => file.name.endsWith(ext))) {
        alert(`Unsupported file type: ${file.name}`);
        continue;
      }
      setUploading(true);
      try {
        const isImage = file.type.startsWith('image/');
        if (isImage) {
          // Convert to base64 for vision models
          const base64 = await toBase64(file);
          setFiles((prev) => [...prev, { name: file.name, type: file.type, base64, size: file.size }]);
        } else {
          const result = await api.uploadFile(file);
          setFiles((prev) => [...prev, { name: file.name, type: file.type, extractedText: result.extracted_text, size: file.size }]);
        }
      } catch (err) {
        alert(`Failed to process ${file.name}`);
      } finally {
        setUploading(false);
      }
    }
  }, []);

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const canSend = (text.trim().length > 0 || files.length > 0) && !isStreaming && !disabled && !uploading;

  return (
    <div className="border-t border-border bg-surface-1 px-4 py-3">
      {/* File chips */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-3 border border-border rounded-full text-xs text-text-secondary">
              <Paperclip size={11} />
              <span className="max-w-[140px] truncate">{f.name}</span>
              <button onClick={() => removeFile(i)} className="text-text-muted hover:text-red-400 transition-colors ml-0.5">
                <X size={11} />
              </button>
            </div>
          ))}
          {uploading && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-3 border border-border rounded-full text-xs text-text-muted animate-pulse">
              Processing...
            </div>
          )}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        <input ref={fileInputRef} type="file" multiple accept={ALLOWED_EXT.join(',')} onChange={handleFileSelect} className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isStreaming}
          className="p-2 text-text-muted hover:text-text-secondary hover:bg-surface-3 rounded-lg transition-colors disabled:opacity-40 shrink-0"
          title="Attach file"
        >
          <Paperclip size={18} />
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => { setText(e.target.value); adjustHeight(); }}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Start a conversation to chat...' : 'Message LocalMind... (Enter to send, Shift+Enter for newline)'}
          rows={1}
          disabled={disabled}
          className={cn(
            'flex-1 resize-none bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 transition-colors leading-relaxed',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          style={{ minHeight: '44px', maxHeight: '200px' }}
        />

        {isStreaming ? (
          <button
            onClick={onCancel}
            className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg transition-colors shrink-0"
            title="Stop generation"
          >
            <Square size={16} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={cn(
              'p-2 rounded-lg transition-colors shrink-0',
              canSend
                ? 'bg-accent hover:bg-accent-hover text-surface-0'
                : 'bg-surface-3 text-text-muted cursor-not-allowed'
            )}
            title="Send message"
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
