import { create } from 'zustand';
import type { PullProgress } from '../types';

interface DownloadState {
  downloads: Record<string, PullProgress>;
  setDownload: (model: string, progress: PullProgress) => void;
  clearDownload: (model: string) => void;
}

export const useDownloadStore = create<DownloadState>((set) => ({
  downloads: {},
  setDownload: (model, progress) =>
    set((s) => ({ downloads: { ...s.downloads, [model]: progress } })),
  clearDownload: (model) =>
    set((s) => {
      const d = { ...s.downloads };
      delete d[model];
      return { downloads: d };
    }),
}));
