import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { User, Bot, Paperclip, Copy, Check, Pencil, X } from 'lucide-react';
import { isToday } from 'date-fns';
import type { Message } from '../types';
import { cn } from '../lib/utils';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  onEdit?: (newContent: string) => void;
  genStats?: { duration: number; tps: number };
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="relative rounded-lg border border-border my-2 max-w-full">
      <div className="flex items-center justify-between px-4 py-1.5 bg-surface-3 border-b border-border rounded-t-lg">
        <span className="text-[11px] text-text-muted font-mono">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary transition-colors"
        >
          {copied ? (
            <><Check size={11} className="text-green-400" /><span className="text-green-400">Copied</span></>
          ) : (
            <><Copy size={11} />Copy</>
          )}
        </button>
      </div>
      {/* Scroll container: clips horizontally inside the block, not the page */}
      <div className="overflow-x-auto rounded-b-lg">
        <SyntaxHighlighter
          language={language}
          style={oneDark}
          customStyle={{ margin: 0, borderRadius: 0, fontSize: '13px', background: '#141414', minWidth: 'max-content' }}
          PreTag="div"
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

function formatTimestamp(iso: string | undefined): string {
  const date = iso ? new Date(iso) : new Date();
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday(date)) return timeStr;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + timeStr;
}

export default function MessageBubble({ message, isStreaming, onEdit, genStats }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const filesAttached = message.files_attached ? JSON.parse(message.files_attached) as string[] : [];
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [editing]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const startEdit = () => {
    setEditValue(message.content);
    setEditing(true);
  };

  const commitEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== message.content) onEdit?.(trimmed);
    setEditing(false);
  };

  const cancelEdit = () => setEditing(false);

  return (
    <div className={cn('flex gap-3 py-4 animate-fade-in group', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5',
        isUser ? 'bg-accent text-surface-0' : 'bg-surface-3 text-text-secondary'
      )}>
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      {/* Content — min-w-0 lets the flex item shrink below its content width */}
      <div className={cn('flex flex-col gap-1 max-w-[95%] xs:max-w-[90%] md:max-w-[85%] min-w-0', isUser ? 'items-end' : 'items-start')}>
        {/* File attachments */}
        {filesAttached.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {filesAttached.map((fname, i) => (
              <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-surface-3 text-text-secondary text-[11px] rounded-full border border-border">
                <Paperclip size={10} />{fname}
              </span>
            ))}
          </div>
        )}

        {/* Message bubble */}
        {isUser && editing ? (
          <div className="flex flex-col gap-2 w-full max-w-[480px]">
            <textarea
              ref={textareaRef}
              value={editValue}
              onChange={(e) => {
                setEditValue(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); }
                if (e.key === 'Escape') cancelEdit();
              }}
              rows={1}
              className="w-full bg-surface-2 border border-accent/50 rounded-xl px-4 py-3 text-sm text-text-primary outline-none resize-none leading-relaxed"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={cancelEdit} className="flex items-center gap-1 px-3 py-1.5 text-xs text-text-muted hover:text-text-primary bg-surface-2 hover:bg-surface-3 border border-border rounded-lg transition-colors">
                <X size={11} /> Cancel
              </button>
              <button onClick={commitEdit} className="flex items-center gap-1 px-3 py-1.5 text-xs text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors">
                Save & Send
              </button>
            </div>
          </div>
        ) : (
          <div className={cn(
            'px-4 py-3 rounded-2xl text-[13px] xs:text-sm leading-relaxed overflow-hidden max-w-full break-words',
            isUser
              ? 'bg-accent text-surface-0 rounded-tr-sm'
              : 'bg-surface-2 text-text-primary rounded-tl-sm border border-border'
          )}>
            {isUser ? (
              <span className="whitespace-pre-wrap">{message.content}</span>
            ) : (
              <div className="prose-dark">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code(props) {
                      const { className, children } = props;
                      const match = /language-(\w+)/.exec(className || '');
                      const code = String(children).replace(/\n$/, '');
                      if (match) return <CodeBlock language={match[1]} code={code} />;
                      return (
                        <code className="bg-[#1e1e2e] text-[#cdd6f4] px-1.5 py-0.5 rounded text-[0.875em] font-mono break-all whitespace-pre-wrap">
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
                {isStreaming && (
                  <span className="inline-block w-0.5 h-4 bg-text-secondary ml-0.5 animate-blink align-middle" />
                )}
              </div>
            )}
          </div>
        )}

        {/* Generation stats — shown below assistant message after streaming */}
        {!isUser && genStats && !isStreaming && (
          <div className="text-[10px] text-text-muted px-1">
            Generated in {genStats.duration.toFixed(1)}s · {Math.round(genStats.tps)} tok/s
          </div>
        )}

        {/* Timestamp — fades in on hover */}
        {!editing && (
          <div className={cn(
            'text-[10px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity px-1',
            isUser ? 'text-right' : 'text-left'
          )}>
            {formatTimestamp(message.created_at)}
          </div>
        )}

        {/* Action buttons */}
        {!editing && !isStreaming && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {isUser && onEdit && (
              <button
                onClick={startEdit}
                className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-text-muted hover:text-text-primary rounded-md hover:bg-surface-3 transition-all"
                title="Edit message"
              >
                <Pencil size={11} /> Edit
              </button>
            )}
            {!isUser && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-text-muted hover:text-text-primary rounded-md hover:bg-surface-3 transition-all"
                title="Copy message"
              >
                {copied ? (
                  <><Check size={11} className="text-green-400" /><span className="text-green-400">Copied!</span></>
                ) : (
                  <><Copy size={11} />Copy</>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
