import chokidar from 'chokidar';
import path from 'path';

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  filePath: string;
  timestamp: Date;
}

export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private handlers: ((event: FileChangeEvent) => void)[] = [];
  private workspacePaths: string[];
  private debounceMs: number;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(workspacePaths: string[], debounceMs: number = 1000) {
    this.workspacePaths = workspacePaths;
    this.debounceMs = debounceMs;
  }

  start(): void {
    const patterns = this.workspacePaths.map(p => path.join(p, 'issues', '*.md'));

    this.watcher = chokidar.watch(patterns, {
      ignored: /(^|[/\\])\../,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
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

  private handleEvent(type: FileChangeEvent['type'], filePath: string): void {
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(filePath, setTimeout(() => {
      this.debounceTimers.delete(filePath);
      const event: FileChangeEvent = { type, filePath, timestamp: new Date() };
      for (const handler of this.handlers) {
        handler(event);
      }
    }, this.debounceMs));
  }
}