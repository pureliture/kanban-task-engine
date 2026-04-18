import chokidar from 'chokidar';
import path from 'path';

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  filePath: string;
  timestamp: Date;
}

export interface FileWatcherOptions {
  pattern?: string;
  basePath?: string;
  depth?: number;
  debounceMs?: number;
}

export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private handlers: ((event: FileChangeEvent) => void)[] = [];
  private basePath: string;
  private pattern: string;
  private depth: number;
  private debounceMs: number;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private lastEvent: FileChangeEvent | null = null;

  constructor(options: FileWatcherOptions = {}) {
    this.basePath = options.basePath ?? '';
    this.pattern = options.pattern ?? '*.md';
    this.depth = options.depth ?? 99;
    this.debounceMs = options.debounceMs ?? 1000;
  }

  start(basePath?: string): void {
    const watchBase = basePath ?? this.basePath;
    const absolutePattern = path.join(watchBase, this.pattern);

    this.watcher = chokidar.watch(absolutePattern, {
      ignored: /(^|[/\\])\../,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
      depth: this.depth,
    });

    this.watcher.on('add', (filePath) => this.handleEvent('add', filePath));
    this.watcher.on('change', (filePath) => this.handleEvent('change', filePath));
    this.watcher.on('unlink', (filePath) => this.handleEvent('unlink', filePath));
    this.watcher.on('error', (err) => {
      console.error(`FileWatcher error: ${err}`);
    });
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    // Clear all pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  onChange(handler: (event: FileChangeEvent) => void): void {
    this.handlers.push(handler);
  }

  getLastEvent(): FileChangeEvent | null {
    return this.lastEvent;
  }

  simulateFileChange(filePath: string): void {
    this.handleEvent('change', filePath);
  }

  private handleEvent(type: FileChangeEvent['type'], filePath: string): void {
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(filePath, setTimeout(() => {
      this.debounceTimers.delete(filePath);
      const event: FileChangeEvent = { type, filePath, timestamp: new Date() };
      this.lastEvent = event;
      for (const handler of this.handlers) {
        handler(event);
      }
    }, this.debounceMs));
  }
}