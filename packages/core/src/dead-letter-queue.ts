import fs from 'fs/promises';
import path from 'path';

export interface DeadLetterEntry {
  filePath: string;
  error: string;
  timestamp: number;
  rawContent: string;
  retryCount?: number;
}

export class DeadLetterQueue {
  private entries: DeadLetterEntry[] = [];
  private readonly filePath: string;
  private loaded: boolean = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;

    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      this.entries = JSON.parse(data);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist - start fresh
        this.entries = [];
      } else if (err instanceof SyntaxError) {
        // Invalid JSON - start fresh but log
        console.error('Invalid JSON in dead letter queue:', this.filePath);
        this.entries = [];
      } else {
        throw err; // Re-throw other errors (permission, etc.)
      }
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.entries, null, 2));
  }

  async add(entry: DeadLetterEntry): Promise<void> {
    await this.ensureLoaded();
    this.entries.push(entry);
    await this.persist();
  }

  async remove(filePath: string): Promise<void> {
    await this.ensureLoaded();
    this.entries = this.entries.filter(e => e.filePath !== filePath);
    await this.persist();
  }

  async getAll(): Promise<DeadLetterEntry[]> {
    await this.ensureLoaded();
    return [...this.entries];
  }

  async getByError(errorPattern: string): Promise<DeadLetterEntry[]> {
    await this.ensureLoaded();
    return this.entries.filter(e =>
      e.error.toLowerCase().includes(errorPattern.toLowerCase())
    );
  }

  async clear(): Promise<void> {
    this.entries = [];
    this.loaded = true;
    await this.persist();
  }

  async size(): Promise<number> {
    await this.ensureLoaded();
    return this.entries.length;
  }
}
