import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Database, Trash2, Play, Download, CheckCircle,
  AlertCircle, Cpu, HardDrive, Zap, RefreshCw,
} from 'lucide-react';
import { api } from '../api';
import type { OllamaModel, PullProgress } from '../types';
import { useDownloadStore } from '../store/downloadStore';
import { cn } from '../lib/utils';

// ─── Curated catalogue ────────────────────────────────────────────────────────

interface CuratedModel {
  name: string;
  pull: string;
  size: string;
  ramGb: number;
  desc: string;
  tag?: string;
}

const CATALOGUE: CuratedModel[] = [
  { name: 'Llama 3.1 8B',   pull: 'llama3.1:8b',    size: '4.9 GB', ramGb: 8,  desc: 'Best all-around',     tag: 'popular' },
  { name: 'Llama 3.1 70B',  pull: 'llama3.1:70b',   size: '40 GB',  ramGb: 32, desc: 'Highest quality'                      },
  { name: 'Phi-3 Mini',     pull: 'phi3:mini',       size: '2.3 GB', ramGb: 4,  desc: 'Fast, low RAM',       tag: 'lightweight' },
  { name: 'Mistral 7B',     pull: 'mistral:7b',      size: '4.1 GB', ramGb: 8,  desc: 'Great for code'                       },
  { name: 'LLaVA 7B',       pull: 'llava:7b',        size: '4.1 GB', ramGb: 8,  desc: 'Images + text',       tag: 'vision' },
  { name: 'LLaVA 13B',      pull: 'llava:13b',       size: '8 GB',   ramGb: 16, desc: 'Best vision model',   tag: 'vision' },
  { name: 'Gemma 2 9B',     pull: 'gemma2:9b',       size: '5.4 GB', ramGb: 8,  desc: "Google's model"                       },
  { name: 'CodeLlama 7B',   pull: 'codellama:7b',    size: '3.8 GB', ramGb: 8,  desc: 'Code specialist',     tag: 'code' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '—';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  return `${bytes} B`;
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    starting: 'Starting…',
    downloading: 'Downloading',
    'pulling manifest': 'Fetching manifest…',
    'verifying sha256 digest': 'Verifying…',
    'writing manifest': 'Writing…',
    'removing any unused layers': 'Cleaning up…',
    complete: 'Complete',
    error: 'Error',
    cancelled: 'Cancelled',
  };
  return map[s] ?? s;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ModelManagerProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  onRefreshStatus: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ModelManager({ selectedModel, onModelChange, onRefreshStatus }: ModelManagerProps) {
  const navigate = useNavigate();

  const [downloadedModels, setDownloadedModels] = useState<OllamaModel[]>([]);
  const [systemRam, setSystemRam] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingModel, setDeletingModel] = useState<string | null>(null);

  // downloads: model pull name → progress (global store — survives navigation)
  const { downloads, setDownload, clearDownload } = useDownloadStore();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [models, status] = await Promise.all([
        api.getOllamaModels(),
        api.getOllamaStatus(),
      ]);
      setDownloadedModels(models);
      setSystemRam(status.system_ram_gb ?? 0);
    } catch {
      // Ollama may not be running
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Poll active downloads ────────────────────────────────────────────────────

  useEffect(() => {
    const activeModels = Object.entries(downloads)
      .filter(([, p]) => p.status !== 'complete' && p.status !== 'error' && p.status !== 'cancelled')
      .map(([m]) => m);

    if (activeModels.length === 0) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }

    if (!pollRef.current) {
      pollRef.current = setInterval(async () => {
        const updates: Record<string, PullProgress> = {};
        await Promise.all(
          activeModels.map(async (model) => {
            try {
              updates[model] = await api.getPullStatus(model);
            } catch { /* ignore */ }
          })
        );

        Object.entries(updates).forEach(([model, progress]) => setDownload(model, progress));
        const justDone = Object.entries(updates).some(([, p]) => p.status === 'complete');
        if (justDone) {
          // Remove completed entries from the store then refresh lists
          Object.entries(updates)
            .filter(([, p]) => p.status === 'complete')
            .forEach(([model]) => clearDownload(model));
          loadData();
          onRefreshStatus();
        }
      }, 1000);
    }

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [downloads, loadData, onRefreshStatus]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleDownload = async (pullName: string) => {
    setDownload(pullName, { status: 'starting', percent: 0, speed: '' });
    try {
      await api.pullModel(pullName);
    } catch (e) {
      setDownload(pullName, { status: 'error', percent: 0, speed: '', error: String(e) });
    }
  };

  const handleCancelDownload = async (pullName: string) => {
    setDownload(pullName, { ...(downloads[pullName] ?? { percent: 0, speed: '' }), status: 'cancelling' });
    await api.cancelPull(pullName);
    setDownload(pullName, { status: 'cancelled', percent: 0, speed: '' });
  };

  const handleDelete = async (modelName: string) => {
    if (!window.confirm(`Delete "${modelName}"? This cannot be undone.`)) return;
    setDeletingModel(modelName);
    try {
      await api.deleteModel(modelName);
      setDownloadedModels((prev) => prev.filter((m) => m.name !== modelName));
      if (selectedModel === modelName) onModelChange('');
      onRefreshStatus();
    } catch (e) {
      alert(`Failed to delete model: ${e}`);
    } finally {
      setDeletingModel(null);
    }
  };

  // ── Derived state ────────────────────────────────────────────────────────────

  const downloadedNames = new Set(downloadedModels.map((m) => m.name));

  // Exact match only — "llama3.1:8b" must not be treated as "llama3.1:70b"
  const isDownloaded = (pullName: string) => downloadedNames.has(pullName);

  const catalogueItems = CATALOGUE.map((item) => ({
    ...item,
    downloaded: isDownloaded(item.pull),
    recommended: systemRam > 0 && systemRam >= item.ramGb,
    progress: downloads[item.pull],
  }));

  const inProgressCount = Object.values(downloads).filter(
    (p) => p.status !== 'complete' && p.status !== 'error' && p.status !== 'cancelled'
  ).length;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-surface-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-surface-1 shrink-0">
        <button
          onClick={() => navigate('/')}
          className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-3 rounded-lg transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <Database size={16} className="text-accent" />
          <h1 className="text-base font-semibold text-text-primary">Model Manager</h1>
        </div>
        {inProgressCount > 0 && (
          <span className="ml-2 px-2 py-0.5 bg-accent/20 text-accent text-xs rounded-full">
            {inProgressCount} downloading
          </span>
        )}
        <button
          onClick={loadData}
          className="ml-auto p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-3 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 max-w-4xl w-full mx-auto">

        {/* ── Downloaded Models ──────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <HardDrive size={15} className="text-text-muted" />
            <h2 className="text-sm font-semibold text-text-primary">Downloaded Models</h2>
            <span className="text-xs text-text-muted ml-1">({downloadedModels.length})</span>
          </div>

          {loading && (
            <div className="text-sm text-text-muted py-4">Loading…</div>
          )}

          {!loading && downloadedModels.length === 0 && (
            <div className="bg-surface-2 border border-border rounded-xl px-5 py-6 text-sm text-text-muted text-center">
              No models downloaded yet. Pull one from the catalogue below.
            </div>
          )}

          {!loading && downloadedModels.length > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {downloadedModels.map((model) => (
                <DownloadedModelCard
                  key={model.name}
                  model={model}
                  isActive={selectedModel === model.name}
                  isDeleting={deletingModel === model.name}
                  onUse={() => onModelChange(model.name)}
                  onDelete={() => handleDelete(model.name)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Available Models ───────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-1">
            <Download size={15} className="text-text-muted" />
            <h2 className="text-sm font-semibold text-text-primary">Available Models</h2>
          </div>
          {systemRam > 0 && (
            <p className="text-xs text-text-muted mb-4">
              Your machine has <span className="text-text-secondary font-medium">{systemRam} GB</span> RAM.
              Recommended models are highlighted.
            </p>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {catalogueItems.map((item) => (
              <CatalogueCard
                key={item.pull}
                item={item}
                onDownload={() => handleDownload(item.pull)}
                onCancel={() => handleCancelDownload(item.pull)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Downloaded model card ────────────────────────────────────────────────────

interface DownloadedModelCardProps {
  model: OllamaModel;
  isActive: boolean;
  isDeleting: boolean;
  onUse: () => void;
  onDelete: () => void;
}

function DownloadedModelCard({ model, isActive, isDeleting, onUse, onDelete }: DownloadedModelCardProps) {
  return (
    <div className={cn(
      'flex flex-col gap-3 p-4 bg-surface-2 border rounded-xl transition-colors',
      isActive ? 'border-green-500/50 shadow-[0_0_0_1px_rgba(34,197,94,0.2)]' : 'border-border'
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-text-primary truncate">{model.name}</span>
            {isActive && (
              <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 bg-green-500/15 text-green-400 text-[10px] rounded-full border border-green-500/25">
                <CheckCircle size={9} /> Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-text-muted flex items-center gap-1">
              <HardDrive size={11} /> {formatBytes(model.size)}
            </span>
            {model.details?.parameter_size && (
              <span className="text-xs text-text-muted">{model.details.parameter_size}</span>
            )}
            {model.details?.quantization_level && (
              <span className="text-xs text-text-muted">{model.details.quantization_level}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!isActive && (
          <button
            onClick={onUse}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-3 hover:bg-surface-4 border border-border text-text-secondary hover:text-text-primary rounded-lg text-xs transition-colors"
          >
            <Play size={11} /> Use this model
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs transition-colors disabled:opacity-50 ml-auto"
        >
          <Trash2 size={11} />
          {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

// ─── Catalogue card ───────────────────────────────────────────────────────────

interface CatalogueItem extends CuratedModel {
  downloaded: boolean;
  recommended: boolean;
  progress?: PullProgress;
}

interface CatalogueCardProps {
  item: CatalogueItem;
  onDownload: () => void;
  onCancel: () => void;
}

const TAG_STYLES: Record<string, string> = {
  popular: 'bg-accent/15 text-accent border-accent/25',
  lightweight: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  vision: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
  code: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
};

function CatalogueCard({ item, onDownload, onCancel }: CatalogueCardProps) {
  const { progress } = item;
  const isActive = progress &&
    progress.status !== 'complete' &&
    progress.status !== 'error' &&
    progress.status !== 'cancelled';
  const isError = progress?.status === 'error';
  const isCancelled = progress?.status === 'cancelled';
  const isCancelling = progress?.status === 'cancelling';

  return (
    <div className={cn(
      'flex flex-col gap-3 p-4 bg-surface-2 border rounded-xl transition-colors',
      item.recommended ? 'border-green-500/30' : 'border-border'
    )}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-text-primary">{item.name}</span>
            {item.tag && (
              <span className={cn('shrink-0 px-1.5 py-0.5 text-[10px] rounded-full border', TAG_STYLES[item.tag] ?? '')}>
                {item.tag}
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-0.5">{item.desc}</p>
        </div>

        {/* Badges */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          {item.recommended && !item.downloaded && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-green-500/15 text-green-400 text-[10px] rounded-full border border-green-500/25 whitespace-nowrap">
              <Zap size={9} /> Recommended
            </span>
          )}
          {item.downloaded && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/15 text-blue-400 text-[10px] rounded-full border border-blue-500/25">
              <CheckCircle size={9} /> Downloaded
            </span>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-4 text-xs text-text-muted">
        <span className="flex items-center gap-1"><HardDrive size={11} /> {item.size}</span>
        <span className="flex items-center gap-1"><Cpu size={11} /> {item.ramGb} GB RAM</span>
        <span className="font-mono text-[11px] text-text-muted/70">{item.pull}</span>
      </div>

      {/* Progress bar (while downloading) */}
      {isActive && progress && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-text-muted">
            <span>{statusLabel(progress.status)}</span>
            <span>{progress.status === 'downloading' ? `${progress.percent.toFixed(1)}%` : ''}</span>
          </div>
          <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                progress.status === 'downloading' ? 'bg-accent' : 'bg-accent/50 animate-pulse'
              )}
              style={{ width: `${Math.max(progress.percent, progress.status === 'downloading' ? 0 : 5)}%` }}
            />
          </div>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
          <AlertCircle size={12} />
          {progress?.error ?? 'Download failed'}
        </div>
      )}

      {/* Action button */}
      <div className="flex gap-2">
        {item.downloaded ? (
          <span className="text-xs text-text-muted">Already installed</span>
        ) : isActive ? (
          <button
            onClick={onCancel}
            disabled={isCancelling}
            className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs transition-colors disabled:opacity-50"
          >
            {isCancelling ? 'Cancelling…' : 'Cancel'}
          </button>
        ) : (
          <button
            onClick={onDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-surface-0 rounded-lg text-xs font-medium transition-colors"
          >
            <Download size={11} />
            {isCancelled || isError ? 'Retry' : 'Download'}
          </button>
        )}
      </div>
    </div>
  );
}
