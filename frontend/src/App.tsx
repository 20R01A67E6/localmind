import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TitleBar from './components/TitleBar';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import ModelManager from './pages/ModelManager';
import type { Conversation, OllamaStatus } from './types';
import { api } from './api';

export default function App() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>({ running: false, models: [] });
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem('localmind_model') || ''
  );
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [convPreviews, setConvPreviews] = useState<Record<number, string>>({});

  // Auto-close sidebar on narrow windows
  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const convs = await api.getConversations();
      setConversations(convs);
      return convs;
    } catch {
      return [];
    }
  }, []);

  const checkOllama = useCallback(async () => {
    try {
      const status = await api.getOllamaStatus();
      setOllamaStatus(status);
      if (status.models.length > 0 && !selectedModel) {
        const model = status.models[0];
        setSelectedModel(model);
        localStorage.setItem('localmind_model', model);
      }
    } catch {
      setOllamaStatus({ running: false, models: [] });
    }
  }, [selectedModel]);

  useEffect(() => {
    checkOllama();
    const interval = setInterval(checkOllama, 10000);
    return () => clearInterval(interval);
  }, [checkOllama]);

  useEffect(() => {
    loadConversations().then((convs) => {
      if (convs.length > 0 && !activeConvId) {
        setActiveConvId(convs[0].id);
        navigate('/');
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewChat = async () => {
    const model = selectedModel || 'llama3.1';
    const conv = await api.createConversation('New conversation', model);
    setConversations((prev) => [conv, ...prev]);
    setActiveConvId(conv.id);
    navigate('/');
  };

  const handleSelectConv = (id: number) => {
    setActiveConvId(id);
    navigate('/');
  };

  const handleDeleteConv = async (id: number) => {
    await api.deleteConversation(id);
    const updated = conversations.filter((c) => c.id !== id);
    setConversations(updated);
    if (activeConvId === id) {
      if (updated.length > 0) {
        setActiveConvId(updated[0].id);
      } else {
        setActiveConvId(null);
      }
    }
  };

  const handleRenameConv = async (id: number, title: string) => {
    const updated = await api.renameConversation(id, title);
    setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    localStorage.setItem('localmind_model', model);
  };

  const handleConversationUpdate = (updated: Conversation) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    );
  };

  const handleLastMessageChange = useCallback((convId: number, preview: string) => {
    setConvPreviews((prev) => ({ ...prev, [convId]: preview }));
  }, []);

  return (
    <div className="flex flex-col h-screen bg-surface-0 overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <Sidebar
          conversations={conversations}
          activeConvId={activeConvId}
          onNewChat={handleNewChat}
          onSelectConv={handleSelectConv}
          onDeleteConv={handleDeleteConv}
          onRenameConv={handleRenameConv}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen((o) => !o)}
          onNavigateSettings={() => navigate('/settings')}
          onNavigateModels={() => navigate('/models')}
          hideWhenClosed={isMobile}
          previews={convPreviews}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <Routes>
            <Route
              path="/"
              element={
                <Chat
                  conversationId={activeConvId}
                  conversationTitle={conversations.find((c) => c.id === activeConvId)?.title}
                  selectedModel={selectedModel}
                  ollamaStatus={ollamaStatus}
                  onModelChange={handleModelChange}
                  onConversationUpdate={handleConversationUpdate}
                  onNewChat={handleNewChat}
                  sidebarOpen={sidebarOpen}
                  onToggleSidebar={() => setSidebarOpen((o) => !o)}
                  onLastMessageChange={handleLastMessageChange}
                />
              }
            />
            <Route
              path="/settings"
              element={
                <Settings
                  onClearAll={async () => {
                    await api.clearAllConversations();
                    setConversations([]);
                    setActiveConvId(null);
                    navigate('/');
                  }}
                />
              }
            />
            <Route
              path="/models"
              element={
                <ModelManager
                  selectedModel={selectedModel}
                  onModelChange={handleModelChange}
                  onRefreshStatus={checkOllama}
                />
              }
            />
          </Routes>
        </div>
      </div>
    </div>
  );
}
