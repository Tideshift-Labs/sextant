export type IndexingStatus = 'idle' | 'indexing' | 'ready' | 'error';

export interface IndexingState {
  status: IndexingStatus;
  filesFound: number;
  filesProcessed: number;
  chunksCreated: number;
  currentFile: string | null;
  startedAt: number | null;
  completedAt: number | null;
  lastError: string | null;
  cancelRequested: boolean;
}

const state: IndexingState = {
  status: 'idle',
  filesFound: 0,
  filesProcessed: 0,
  chunksCreated: 0,
  currentFile: null,
  startedAt: null,
  completedAt: null,
  lastError: null,
  cancelRequested: false,
};

export function getState(): Readonly<IndexingState> {
  return { ...state };
}

export function setIndexing(filesFound: number): void {
  state.status = 'indexing';
  state.filesFound = filesFound;
  state.filesProcessed = 0;
  state.chunksCreated = 0;
  state.currentFile = null;
  state.startedAt = Date.now();
  state.completedAt = null;
  state.lastError = null;
  state.cancelRequested = false;
}

export function updateProgress(filesProcessed: number, chunksCreated: number, currentFile: string): void {
  state.filesProcessed = filesProcessed;
  state.chunksCreated = chunksCreated;
  state.currentFile = currentFile;
}

export function setReady(stats: { filesProcessed: number; chunksCreated: number }): void {
  state.status = 'ready';
  state.filesProcessed = stats.filesProcessed;
  state.chunksCreated = stats.chunksCreated;
  state.currentFile = null;
  state.completedAt = Date.now();
}

export function setError(msg: string): void {
  state.status = 'error';
  state.lastError = msg;
  state.currentFile = null;
  state.completedAt = Date.now();
}

export function requestCancel(): void {
  state.cancelRequested = true;
}

export function isCancelRequested(): boolean {
  return state.cancelRequested;
}
