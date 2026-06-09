import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Plus, Settings, Search, Trash2, PanelLeftClose, PanelLeft, Database, Pencil } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import type { Conversation } from '../types';
import { cn } from '../lib/utils';

interface SidebarProps {
  conversations: Conversation[];
  activeConvId: number | null;
  onNewChat: () => void;
  onSelectConv: (id: number) => void;
  onDeleteConv: (id: number) => void;
  onRenameConv: (id: number, title: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onNavigateSettings: () => void;
  onNavigateModels: () => void;
  hideWhenClosed?: boolean;
  previews?: Record<number, string>;
}

function getDateGroup(conv: Conversation): string {
  const now = new Date();
  const d = new Date(conv.updated_at);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOf7DaysAgo = new Date(startOfToday.getTime() - 7 * 86400000);
  if (d >= startOfToday) return 'Today';
  if (d >= startOfYesterday) return 'Yesterday';
  if (d >= startOf7DaysAgo) return 'Previous 7 days';
  return 'Older';
}

const GROUP_ORDER = ['Today', 'Yesterday', 'Previous 7 days', 'Older'];

function groupConversations(convs: Conversation[]): { label: string; convs: Conversation[] }[] {
  const map: Record<string, Conversation[]> = {};
  for (const conv of convs) {
    const g = getDateGroup(conv);
    if (!map[g]) map[g] = [];
    map[g].push(conv);
  }
  return GROUP_ORDER
    .filter((g) => map[g]?.length > 0)
    .map((label) => ({ label, convs: map[label] }));
}

export default function Sidebar({
  conversations,
  activeConvId,
  onNewChat,
  onSelectConv,
  onDeleteConv,
  onRenameConv,
  isOpen,
  onToggle,
  onNavigateSettings,
  onNavigateModels,
  hideWhenClosed = false,
  previews,
}: SidebarProps) {
  const [search, setSearch] = useState('');
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();

  useEffect(() => {
    if (editingId !== null) editInputRef.current?.focus();
  }, [editingId]);

  const startEdit = (e: React.MouseEvent, conv: Conversation) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditValue(conv.title);
  };

  const commitEdit = () => {
    if (editingId === null) return;
    const trimmed = editValue.trim();
    if (trimmed) onRenameConv(editingId, trimmed);
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  if (!isOpen) {
    if (hideWhenClosed) return null;
    return (
      <div className="flex flex-col items-center w-12 bg-surface-1 border-r border-border py-3 gap-3">
        <button onClick={onToggle} className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-3 rounded-lg transition-colors">
          <PanelLeft size={18} />
        </button>
        <button onClick={onNewChat} className="p-2 text-text-secondary hover:text-accent hover:bg-surface-3 rounded-lg transition-colors">
          <Plus size={18} />
        </button>
        <div className="flex-1" />
        <button
          onClick={onNavigateModels}
          title="Model Manager"
          className={cn(
            'p-2 rounded-lg transition-colors',
            location.pathname === '/models'
              ? 'text-accent bg-surface-3'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-3'
          )}
        >
          <Database size={18} />
        </button>
        <button onClick={onNavigateSettings} className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-3 rounded-lg transition-colors">
          <Settings size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-64 bg-surface-1 border-r border-border shrink-0">
      {/* Header */}
      <div className="flex items-center justify-end px-3 py-2 border-b border-border">
        <button onClick={onToggle} className="p-1 text-text-muted hover:text-text-primary hover:bg-surface-3 rounded transition-colors">
          <PanelLeftClose size={16} />
        </button>
      </div>

      {/* New chat */}
      <div className="px-3 py-2">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-3 rounded-lg transition-colors border border-border hover:border-surface-4"
        >
          <Plus size={15} />
          New conversation
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 rounded-lg border border-border">
          <Search size={13} className="text-text-muted shrink-0" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-xs text-text-primary placeholder:text-text-muted outline-none w-full"
          />
        </div>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {filtered.length === 0 && (
          <p className="text-xs text-text-muted text-center py-6">No conversations</p>
        )}
        {groupConversations(filtered).map(({ label, convs }) => (
          <div key={label} className="mb-1">
            <div className="px-3 py-1 text-[10px] text-text-muted font-medium tracking-wider uppercase">
              {label}
            </div>
            <div className="space-y-0.5">
              {convs.map((conv) => (
                <div
                  key={conv.id}
                  className={cn(
                    'group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm',
                    activeConvId === conv.id
                      ? 'bg-surface-3 text-text-primary'
                      : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                  )}
                  onClick={() => editingId !== conv.id && onSelectConv(conv.id)}
                  onMouseEnter={() => setHoveredId(conv.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <MessageSquare size={13} className="shrink-0 opacity-60" />
                  <div className="flex-1 min-w-0">
                    {editingId === conv.id ? (
                      <input
                        ref={editInputRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        onBlur={commitEdit}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full bg-surface-0 border border-accent/50 rounded px-1.5 py-0.5 text-xs text-text-primary outline-none"
                      />
                    ) : (
                      <>
                        <div
                          className="truncate text-xs font-medium"
                          onDoubleClick={(e) => startEdit(e, conv)}
                          title="Double-click to rename"
                        >
                          {conv.title}
                        </div>
                        {previews?.[conv.id] && (
                          <div className="text-[10px] text-text-muted truncate mt-0.5">
                            {previews[conv.id].slice(0, 60)}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  {editingId !== conv.id && (hoveredId === conv.id || activeConvId === conv.id) && (
                    <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={(e) => startEdit(e, conv)}
                        className="p-1 text-text-muted hover:text-text-primary rounded transition-colors"
                        title="Rename"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteConv(conv.id); }}
                        className="p-1 text-text-muted hover:text-red-400 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-border p-2 space-y-0.5">
        <button
          onClick={onNavigateModels}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg transition-colors',
            location.pathname === '/models'
              ? 'text-accent bg-surface-3'
              : 'text-text-muted hover:text-text-primary hover:bg-surface-2'
          )}
        >
          <Database size={14} />
          Model Manager
        </button>
        <button
          onClick={onNavigateSettings}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg transition-colors',
            location.pathname === '/settings'
              ? 'text-text-primary bg-surface-3'
              : 'text-text-muted hover:text-text-primary hover:bg-surface-2'
          )}
        >
          <Settings size={14} />
          Settings
        </button>
      </div>
    </div>
  );
}
