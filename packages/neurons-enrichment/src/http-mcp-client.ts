import type { McpClient } from './mcp-stdio-client';
import { parseToolResult } from './mcp-stdio-client';

export interface HttpMcpClientOptions {
  /** mcp-http endpoint (예: http://<tailnet-host>:8765/mcp) */
  url: string;
  /** 추가 헤더 (v1 인증 없음; Tailscale tailnet 신뢰경계) */
  headers?: Record<string, string>;
  /** 테스트 주입용 fetch */
  fetchImpl?: typeof fetch;
}

interface JsonRpcResponse {
  id?: number;
  result?: unknown;
  error?: { message?: string };
}

/**
 * neurons `mcp-http`(Streamable HTTP, MCP 2025-06-18)에 연결하는 client.
 * 서버는 우분투에 Tailscale tailnet bind 전용으로 뜬다(0.0.0.0 거부). Mac 이 tailnet 에
 * 있어야 도달 가능. 응답은 application/json 또는 text/event-stream(SSE) 둘 다 처리.
 *
 * 실 검증은 서버 mcp-http 배포(M6) 후. 현재는 mock fetch 로 로직만 단위 검증.
 */
export class HttpMcpClient implements McpClient {
  private sessionId?: string;
  private nextId = 1;
  private initialized?: Promise<void>;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpMcpClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.ensureInitialized();
    const result = await this.rpc('tools/call', { name, arguments: args });
    return parseToolResult(result);
  }

  async close(): Promise<void> {
    this.sessionId = undefined;
    this.initialized = undefined;
  }

  private ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      this.initialized = (async () => {
        await this.rpc('initialize', {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'kanban-task-engine', version: '0.1.0' },
        });
        await this.notify('notifications/initialized');
      })();
    }
    return this.initialized;
  }

  private async rpc(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const res = await this.post({ jsonrpc: '2.0', id, method, params });
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    if (!res.ok) throw new Error(`mcp-http ${method} failed: HTTP ${res.status}`);
    const msg = await readJsonRpcResponse(res, id);
    if (msg.error) throw new Error(msg.error.message ?? 'mcp error');
    return msg.result;
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    const res = await this.post({ jsonrpc: '2.0', method, params });
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    // notification 응답 본문은 무시 (202/empty 허용)
  }

  private post(body: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...this.options.headers,
    };
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;
    return this.fetchImpl(this.options.url, { method: 'POST', headers, body: JSON.stringify(body) });
  }
}

/** application/json 또는 text/event-stream(SSE) 응답에서 JSON-RPC 메시지를 뽑는다. */
export async function readJsonRpcResponse(res: Response, expectId: number): Promise<JsonRpcResponse> {
  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();
  if (contentType.includes('application/json')) {
    return JSON.parse(text) as JsonRpcResponse;
  }
  // SSE: 여러 `event:`/`data:` 블록. expectId 와 매칭되는 data 를 찾는다.
  for (const block of text.split(/\n\n/)) {
    const dataLine = block.split('\n').find((line) => line.startsWith('data:'));
    if (!dataLine) continue;
    try {
      const msg = JSON.parse(dataLine.slice('data:'.length).trim()) as JsonRpcResponse;
      if (msg.id === expectId || msg.result !== undefined || msg.error !== undefined) return msg;
    } catch {
      // skip malformed event
    }
  }
  try {
    return JSON.parse(text) as JsonRpcResponse;
  } catch {
    return { error: { message: `unparseable mcp-http response: ${text.slice(0, 200)}` } };
  }
}
