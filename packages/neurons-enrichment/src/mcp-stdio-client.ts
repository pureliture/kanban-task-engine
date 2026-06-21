import { spawn, type ChildProcess } from 'child_process';

/**
 * neurons brain MCP 호출 추상화. provider 는 이 인터페이스에만 의존하므로
 * 테스트에서는 mock 으로, 런타임에서는 StdioMcpClient 로 주입한다.
 */
export interface McpClient {
  /** MCP tools/call. 반환은 파싱된 tool 결과(JSON 객체). */
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

export interface StdioMcpClientOptions {
  /** neuron-knowledge ledger 경로 (필수) */
  ledgerPath: string;
  /** 실행 커맨드 (기본 'neuron-knowledge') */
  command?: string;
  /** mcp-stdio 인자 오버라이드. 미지정 시 ledgerPath/enableGraph 로 구성 */
  args?: string[];
  /** graphiti graph 결과 활성화 (--enable-graph) */
  enableGraph?: boolean;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

/**
 * `neuron-knowledge mcp-stdio` 를 child process 로 띄워 JSON-RPC 2.0(newline-delimited)로
 * 통신하는 MCP client. 인증 없음(로컬 프로세스 신뢰).
 *
 * 주의: 실 동작 검증은 neurons 환경(ledger + neuron-knowledge 설치) 준비 후. 현재는
 * mock 으로 provider 로직만 단위 검증된다(neurons 미설치 → fail-soft 로 enrichment 생략).
 */
export class StdioMcpClient implements McpClient {
  private proc?: ChildProcess;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private buffer = '';
  private initialized?: Promise<void>;

  constructor(private readonly options: StdioMcpClientOptions) {}

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.ensureInitialized();
    const result = await this.request('tools/call', { name, arguments: args });
    return parseToolResult(result);
  }

  async close(): Promise<void> {
    this.failAll(new Error('client closed'));
    this.proc?.stdin?.end();
    this.proc?.kill();
    this.proc = undefined;
    this.initialized = undefined;
  }

  private ensureStarted(): ChildProcess {
    if (this.proc) return this.proc;
    const args =
      this.options.args ??
      ['mcp-stdio', '--ledger', this.options.ledgerPath, ...(this.options.enableGraph ? ['--enable-graph'] : [])];
    const proc = spawn(this.options.command ?? 'neuron-knowledge', args, { stdio: ['pipe', 'pipe', 'inherit'] });
    proc.stdout?.setEncoding('utf8');
    proc.stdout?.on('data', (chunk: string) => this.onData(chunk));
    proc.on('error', (err: Error) => this.failAll(err));
    proc.on('exit', () => this.failAll(new Error('mcp process exited')));
    this.proc = proc;
    return proc;
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg: { id?: number; result?: unknown; error?: { message?: string } };
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof msg.id === 'number') {
        const pending = this.pending.get(msg.id);
        if (!pending) continue;
        this.pending.delete(msg.id);
        if (msg.error) pending.reject(new Error(msg.error.message ?? 'mcp error'));
        else pending.resolve(msg.result);
      }
    }
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    const proc = this.ensureStarted();
    const id = this.nextId++;
    const payload = `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      proc.stdin?.write(payload, (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  private notify(method: string, params?: unknown): void {
    const proc = this.ensureStarted();
    proc.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  private ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      this.initialized = (async () => {
        await this.request('initialize', {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'kanban-task-engine', version: '0.1.0' },
        });
        this.notify('notifications/initialized');
      })();
    }
    return this.initialized;
  }

  private failAll(err: Error): void {
    for (const pending of this.pending.values()) pending.reject(err);
    this.pending.clear();
  }
}

/**
 * MCP tools/call result → tool payload. structuredContent 우선, 없으면
 * content[].text(JSON 문자열) 파싱.
 */
export function parseToolResult(result: unknown): unknown {
  if (result && typeof result === 'object') {
    const r = result as { structuredContent?: unknown; content?: Array<{ type?: string; text?: string }> };
    if (r.structuredContent !== undefined) return r.structuredContent;
    const text = r.content?.find((c) => c.type === 'text')?.text;
    if (typeof text === 'string') {
      try {
        return JSON.parse(text);
      } catch {
        return { text };
      }
    }
  }
  return result;
}
