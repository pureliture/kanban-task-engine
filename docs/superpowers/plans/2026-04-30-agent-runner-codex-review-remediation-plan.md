# AgentRunner Codex 리뷰 반영 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` 또는 `superpowers:executing-plans` to implement this plan task-by-task. Steps use Markdown checkbox syntax for tracking.

**Goal:** `AgentRunner` 일반화와 `codex` 실행 target을 MVP 수준으로 구현하되, 리뷰에서 발견된 P1/P2 항목을 먼저 설계와 테스트 gate에 반영해 `kanban run <id> --execute --agent codex`가 안전하게 `READY -> RUNNING -> REVIEW/FAILED -> DONE` lifecycle을 수행하도록 만든다.

**Architecture:** 구현은 세 겹으로 진행한다. 첫째, spec과 eval gate를 고쳐 잘못된 acceptance를 막는다. 둘째, runner/process/security/git lifecycle의 deterministic test를 RED로 추가한다. 셋째, `AgentRunner` orchestration, `codex exec` runner, CLI parser, approve/recovery flow를 작은 단위로 구현하고 매 단계 global check를 돌린다.

**Tech Stack:** TypeScript 5.4, Vitest, pnpm workspaces, Node.js `child_process.spawn`, Git CLI, Codex CLI `codex exec`, Superpowers skills, Context7 또는 공식 docs fallback.

---

## 0. 플러그인/스킬 사용 정책

각 단계는 다음 plugin/skill을 명시적으로 사용한다.

| 단계 | 사용할 plugin/skill | 목적 |
| --- | --- | --- |
| Task 1 | `context7`, OpenAI Developer Docs fallback | Node `spawn`, Codex CLI 옵션, sandbox/approval 최신 근거 확인 |
| Task 2 | `superpowers:receiving-code-review`, `superpowers:writing-plans` | 리뷰 항목을 P1/P2로 재분류하고 spec/plan에 반영 |
| Task 3-10 | `superpowers:test-driven-development` | RED-GREEN-REFACTOR 순서 강제 |
| Task 3-10 실패 시 | `superpowers:systematic-debugging` | 실패 원인 추적 후 수정 |
| Task 7-10 병렬 검토 | `superpowers:requesting-code-review`, `superpowers:subagent-driven-development` | 각 slice 구현 후 독립 리뷰 |
| Task 11 | `superpowers:verification-before-completion` | 완료 주장 전 fresh verification |
| Task 12 | `superpowers:writing-skills`, `skill-creator` | 반복 가능한 runner 구현 절차를 skill로 승격할지 판정 |

`context7`가 quota 초과로 실패하면 해당 단계는 실패로 멈추지 않는다. 대신 다음 근거를 사용하고 계획 로그에 “Context7 unavailable”을 기록한다.

- OpenAI Codex CLI reference: `https://developers.openai.com/codex/cli/reference#codex-exec`
- OpenAI Codex config reference: `https://developers.openai.com/codex/config-reference#configtoml`
- OpenAI sandbox and approvals guide: `https://developers.openai.com/codex/agent-approvals-security#sandbox-and-approvals`
- Node.js `child_process` docs: `https://nodejs.org/api/child_process.html`

## 1. 리뷰 항목 대응 매핑

| Review finding | 대응 Task | 완료 증거 |
| --- | --- | --- |
| P1 문서 언어 정책 위반 | Task 2 | spec 본문 한국어화, 명령어/식별자만 영어 유지 |
| P1 `ClaudeRunner` 호환성 깨짐 | Task 4 | legacy two-argument `ClaudeRunner.run(promptPath, cwd)` compile/runtime test |
| P1 `--agent` parser contract 부족 | Task 8 | `parseRunArgs()` unit/CLI tests |
| P1 eval gate false-positive | Task 3 | required check 실패 시 `pnpm eval:superpowers --json` non-zero, machine-readable JSON 검증은 `pnpm --silent eval:superpowers --json` |
| P1 checkpoint commit failure test 누락 | Task 7 | commit failure가 `FAILED`로 수렴하는 test |
| Gemini: command injection | Task 5 | `spawn(executable, args, { shell: false })` contract test |
| Gemini: zombie process | Task 5 | timeout 시 process group kill test |
| Gemini: credential leakage | Task 5, Task 6 | env whitelist와 log/metadata redaction test |
| Gemini: JSONL/log 모순 | Task 6 | `.ndjson`, `.log`, `last-message.md` artifact 분리 test |
| Gemini: stale lock/RUNNING recovery | Task 10 | stale `RUNNING` recovery command/test |
| Gemini: git author 누락 | Task 7 | `git -c user.name=... -c user.email=... commit` test |
| Architecture: fast-forward 실패 안내 부족 | Task 2, Task 9 | approve 실패 output에 branch/worktree 진단 정보와 rebase 기반 수동 복구 안내 포함 |
| Lifecycle: 불완전한 worktree cleanup 절차 | Task 2, Task 10 | `FAILED`/`recover-run` output이 worktree 보존 이유와 `retry`/`abort --discard` cleanup 절차를 안내 |
| Test Strategy: negative dogfood gate 부족 | Task 2, Task 11 | Codex 실패/timeout/no-change manual gate 추가 |
| Test Strategy: legacy Claude dogfood 부족 | Task 2, Task 11 | `kanban run <id> --execute` 기본 Claude manual gate 추가 |

## 2. 파일 구조

### 생성

- `packages/core/src/executor/agent-runner.ts`
- `packages/core/src/executor/agent-process.ts`
- `packages/core/src/executor/codex-runner.ts`
- `packages/core/src/executor/claude-code-runner.ts`
- `packages/core/src/executor/mock-runner.ts`
- `packages/core/src/executor/prompt-assembler.ts`
- `packages/core/src/executor/redaction.ts`
- `packages/core/src/executor/execution-target.ts`
- `packages/core/src/executor/run-issue.ts`
- `packages/core/tests/executor/agent-process.test.ts`
- `packages/core/tests/executor/codex-runner.test.ts`
- `packages/core/tests/executor/prompt-assembler.test.ts`
- `packages/core/tests/executor/redaction.test.ts`
- `packages/core/tests/executor/execution-target.test.ts`
- `packages/core/tests/executor/run-issue.test.ts`
- `packages/cli/tests/run-args.test.ts`

### 수정

- `docs/superpowers/specs/2026-04-30-agent-runner-codex-target-design.md`
- `scripts/eval-superpowers.ts`
- `packages/core/src/executor/claude-code-executor.ts`
- `packages/core/src/executor/run-artifacts.ts`
- `packages/core/src/executor/git.ts`
- `packages/core/src/executor/index.ts`
- `packages/cli/src/commands/run.ts`
- `packages/cli/src/commands/approve.ts`
- `packages/cli/src/commands/git-lifecycle.ts`
- `packages/cli/src/vault.ts`
- `packages/cli/tests/index.test.ts`

### 수정하지 않음

- `packages/schema/**`는 이번 slice에서 executor enum을 강제하지 않는다. `executor`는 migration window 동안 string으로 유지한다.
- `adapter-*` packages는 건드리지 않는다.
- live vault issue는 dogfood Task 전까지 건드리지 않는다.

## Task 1: 근거 문서 확인 및 계획 로그 갱신

**사용 plugin/skill:** `context7`, OpenAI Developer Docs fallback, Node official docs fallback

**Files:**
- 수정: `codex-eval-loop.md`

- [x] **Step 1: Context7로 Node.js 문서 조회 시도**

실행:

```bash
# Codex tool step: mcp__context7__.resolve_library_id("Node.js", "child_process spawn detached shell false env timeout")
```

기대 결과:

- 성공하면 Node.js library id와 `child_process.spawn` 관련 docs를 기록한다.
- quota 초과면 `codex-eval-loop.md`에 `Context7 unavailable: monthly quota exceeded`를 기록한다.

- [x] **Step 2: OpenAI Codex CLI 공식 docs 확인**

Use OpenAI Developer Docs MCP:

```text
search_openai_docs("Codex CLI codex exec json output last message sandbox approval policy")
```

기대 결과:

- `codex exec`가 scripted/CI-style non-interactive run 용도임을 확인한다.
- `--json`, `-C`, `--sandbox`, `-c key=value`, `--output-last-message`, `PROMPT -` 항목을 plan evidence로 남긴다.

- [x] **Step 3: Node 공식 docs fallback 기록**

문서 근거:

```text
Node child_process.spawn:
- args array 지원
- shell 기본값 false
- env 기본값 process.env
- detached true는 non-Windows에서 새 process group/session 생성
- timeout/signal/killSignal 지원
```

기대 결과:

- `codex-eval-loop.md`에 사용한 공식 문서 URL과 판단을 5줄 이내로 기록한다.

## Task 2: Spec 문서 보수

**사용 plugin/skill:** `superpowers:receiving-code-review`, `superpowers:writing-plans`

**Files:**
- 수정: `docs/superpowers/specs/2026-04-30-agent-runner-codex-target-design.md`

- [x] **Step 1: 본문 한국어화**

수정 원칙:

```text
자연어 설명: 한국어
코드 식별자: 영어 원문 유지
명령어/API명: 영어 원문 유지
문서 URL: 원문 유지
```

기대 결과:

- 제목은 `# AgentRunner 일반화 및 Codex 실행 대상 설계`로 시작한다.
- `Summary`, `Goals`, `Non-Goals` 등 자연어 heading은 한국어로 바뀐다.

- [x] **Step 2: `ClaudeRunner` compatibility 수정**

spec의 기존 alias 제안을 제거하고 다음 contract로 바꾼다.

```ts
export interface LegacyClaudeRunner {
  run(promptPath: string, cwd: string): Promise<AgentRunResult>;
}

export function adaptClaudeRunnerToAgent(claude: LegacyClaudeRunner): AgentRunner;
```

기대 결과:

- `ClaudeRunner = AgentRunner` 문구가 없어야 한다.
- legacy two-argument runner signature 보존이 acceptance criteria에 들어간다.

- [x] **Step 3: process/security contract 추가**

spec에 다음 불변식을 추가한다.

```text
- child_process.spawn은 shell: false와 args array만 사용한다.
- Codex/Claude child env는 allowlist 기반으로 만든다.
- stdout/stderr/metadata에 쓰기 전 secret redaction을 적용한다.
- timeout 시 POSIX에서는 detached process group을 종료한다.
- Windows는 child kill 후 retry/cleanup 진단을 남긴다.
- unsafe sandbox/approval override는 MVP CLI/frontmatter에 노출하지 않는다.
```

기대 결과:

- `shell: true` 금지, env allowlist, redaction, process group kill이 명시되어 있다.

- [x] **Step 4: artifact contract 추가**

spec에 다음 artifact 분리를 추가한다.

```text
runs/<date>/<issue-id>/run-<n>.ndjson
runs/<date>/<issue-id>/run-<n>.log
runs/<date>/<issue-id>/run-<n>.last-message.md
runs/<date>/<issue-id>/run-<n>.json
```

기대 결과:

- `--json` output은 raw `.ndjson`로 저장한다.
- 사람이 읽는 `.log`는 redacted summary로 만든다.
- `--output-last-message` output을 별도 artifact로 남긴다.

- [x] **Step 5: recovery와 cleanup policy 추가**

spec에 다음 정책을 추가한다.

```text
- FAILED 기본값은 worktree 보존이다.
- cleanup은 retry/abort/explicit cleanup command에서 수행한다.
- stale lock은 기존 staleMs 기반으로 교체할 수 있다.
- stale RUNNING issue는 recovery command가 FAILED로 전이한다.
```

기대 결과:

- 실패 즉시 worktree를 자동 삭제하라는 문구가 없어야 한다.
- debugging evidence 보존 이유가 적혀 있다.

- [x] **Step 6: approve 실패 안내와 cleanup 절차 보강**

spec에 다음 리뷰 반영 내용을 추가한다.

```text
- fast-forward 실패 시 engine은 DONE을 쓰지 않고 REVIEW를 유지한다.
- CLI error는 working_dir, merge_into, origin/<merge_into>, kanban/<issue-id>, worktree path를 포함한다.
- CLI error는 git log / worktree-local rebase origin/<merge_into> / kanban approve 재시도 안내를 포함한다.
- FAILED와 recover-run 출력은 worktree 보존 이유와 retry/abort 기반 cleanup 절차를 안내한다.
```

기대 결과:

- fast-forward 실패 안내는 자동 rebase가 아니라 수동 진단/복구 안내로 표현된다.
- cleanup은 실패 즉시 자동 삭제가 아니라 evidence 보존 후 사용자가 선택하는 절차로 표현된다.

- [x] **Step 7: dogfood gate 보강**

spec의 실제 검증 관문에 다음 manual gate를 추가한다.

```text
- Codex 성공 경로: kanban run <id> --execute --agent codex -> approve
- Codex 실패/timeout/no-change 경로: FAILED 수렴, artifact/redaction, recover-run diagnostic 확인
- Legacy Claude 경로: kanban run <id> --execute 가 claude-code 기본 backend로 동작하는지 확인
```

기대 결과:

- operationally ready 판단은 성공 경로만 보지 않는다.
- AgentRunner 일반화 이후 기존 Claude 기본 실행이 깨지지 않았는지 수동 검증한다.

## Task 3: Eval harness를 실제 gate로 수정

**사용 plugin/skill:** `superpowers:test-driven-development`, `superpowers:systematic-debugging`

**Files:**
- 수정: `scripts/eval-superpowers.ts`

- [x] **Step 1: RED 확인**

실행:

```bash
pnpm --silent eval:superpowers --json
```

Expected now:

- Task 3 적용 전 baseline에서는 `AgentRunner` 구현이 없어도 non-silent `pnpm eval:superpowers --json`가 exit code 0일 수 있었다. 이 동작을 출력 요약에 false-positive baseline으로 기록한다.
- JSON stdout을 machine-readable하게 검증할 때는 pnpm run banner를 피하기 위해 `pnpm --silent eval:superpowers --json`를 사용한다.

- [x] **Step 2: AgentRunner/Codex required checks 추가**

`scripts/eval-superpowers.ts`에 새 eval group을 추가한다.

```ts
{
  const agentProcessTest = maybeRead('packages/core/tests/executor/agent-process.test.ts');
  const redactionTest = maybeRead('packages/core/tests/executor/redaction.test.ts');
  const promptAssemblerTest = maybeRead('packages/core/tests/executor/prompt-assembler.test.ts');
  const checks: Check[] = [
    { name: 'AgentRunner abstraction exists', pass: exists('packages/core/src/executor/agent-runner.ts') },
    { name: 'Codex runner exists with tests', pass: exists('packages/core/src/executor/codex-runner.ts') && exists('packages/core/tests/executor/codex-runner.test.ts') },
    { name: 'Generic run issue orchestration exists with tests', pass: exists('packages/core/src/executor/run-issue.ts') && exists('packages/core/tests/executor/run-issue.test.ts') },
    { name: 'Agent process tests cover shell false, spawn args, and env allowlist', pass: exists('packages/core/tests/executor/agent-process.test.ts') && includesAll(agentProcessTest, [/shell:\s*false|shell false/i, /args array|spawn args|argv|arguments array/i, /env allowlist|allowlist.*env|allowed env/i]) },
    { name: 'Redaction tests cover stdout, stderr, and metadata', pass: exists('packages/core/tests/executor/redaction.test.ts') && includesAll(redactionTest, [/stdout/i, /stderr/i, /metadata/i]) },
    { name: 'Prompt assembler tests cover raw issue markdown and execution contract', pass: exists('packages/core/tests/executor/prompt-assembler.test.ts') && includesAll(promptAssemblerTest, [/raw issue markdown|issue markdown/i, /Engine Execution Contract|execution contract/i, /prompt content|lifecycle mutation|checkpoint commit/i]) },
    { name: 'CLI --agent parser conflicts are tested', pass: exists('packages/cli/tests/run-args.test.ts') && includesAll(maybeRead('packages/cli/tests/run-args.test.ts'), [/--agent/, /--mock-executor/, /conflict|cannot.*together|mutually exclusive/i]) },
    { name: 'RUNNING failure convergence is tested', pass: exists('packages/core/tests/executor/run-issue.test.ts') && includesAll(maybeRead('packages/core/tests/executor/run-issue.test.ts'), [/non-zero|nonzero|exit code/i, /exception after RUNNING/i, /no file changes/i, /commit failure|checkpoint commit fails/i]) },
    { name: 'Approve stale target or fast-forward target update fixture exists', pass: /approve/i.test(maybeRead('packages/cli/tests/index.test.ts')) && /stale[- ]target|fast[- ]forward target|fast-forward update|behind origin/i.test(maybeRead('packages/cli/tests/index.test.ts')) },
    { name: 'Approve fast-forward failure guidance is tested', pass: /approve/i.test(maybeRead('packages/cli/tests/index.test.ts')) && /rebase|manual recovery|복구 안내|git log/i.test(maybeRead('packages/cli/tests/index.test.ts')) },
    { name: 'Stale RUNNING recovery test exists', pass: /stale RUNNING|recover-run|recoverRun/i.test(maybeRead('packages/cli/tests/index.test.ts')) },
    { name: 'Recovery cleanup guidance is tested', pass: /recover-run|FAILED/i.test(maybeRead('packages/cli/tests/index.test.ts')) && /cleanup|abort --discard|retry|worktree.*preserve|worktree.*보존/i.test(maybeRead('packages/cli/tests/index.test.ts')) },
    { name: 'Run metadata and artifact path fields are tested', pass: exists('packages/core/tests/executor/run-artifacts.test.ts') && includesAll(maybeRead('packages/core/tests/executor/run-artifacts.test.ts'), [/backend/i, /baseCommit/i, /headCommit/i, /ndjson/i, /logPath|\.log/i, /lastMessagePath|last-message/i, /jsonPath|run-<n>\.json|metadata/i]) },
  ];
  evals.push({
    id: 'agent-runner-codex',
    name: 'AgentRunner + Codex Target',
    required: true,
    dependencyOrder: 6,
    planProgress: planProgress('docs/superpowers/plans/2026-04-30-agent-runner-codex-review-remediation-plan.md'),
    localEvalCommand: 'pnpm --filter @kanban-task-engine/core test -- tests/executor/agent-process.test.ts tests/executor/codex-runner.test.ts tests/executor/prompt-assembler.test.ts tests/executor/redaction.test.ts tests/executor/run-issue.test.ts tests/executor/run-artifacts.test.ts && pnpm --filter @kanban-task-engine/cli test -- tests/run-args.test.ts tests/index.test.ts',
    ...score(checks),
    checks,
  });
}
```

- [x] **Step 3: required failure 시 non-zero exit**

파일 끝에 다음 정책을 구현한다.

```ts
const requiredFailed = evals
  .filter(item => item.required)
  .flatMap(item => item.checks
    .filter(check => !check.pass)
    .map(check => `${item.name}: ${check.name}`));

if (requiredFailed.length > 0) {
  process.exitCode = 1;
}
```

기대 결과:

- Task 3 적용 직후, 실제 구현 파일과 테스트가 아직 없으면 `pnpm eval:superpowers --json`은 실패한다.
- JSON stdout parse 검증은 `pnpm --silent eval:superpowers --json`로 수행한다.
- 구현 완료 후에만 0이 된다.

## Task 4: Legacy Claude API 보존

**사용 plugin/skill:** `superpowers:test-driven-development`

**Files:**
- 생성: `packages/core/src/executor/agent-runner.ts`
- 수정: `packages/core/src/executor/claude-code-executor.ts`
- 수정: `packages/core/src/executor/index.ts`
- 테스트: `packages/core/tests/executor/claude-code-executor.test.ts`

- [x] **Step 1: legacy signature test 추가**

`packages/core/tests/executor/claude-code-executor.test.ts`에 추가한다.

```ts
it('keeps legacy ClaudeRunner run(promptPath, cwd) compatibility', async () => {
  const calls: Array<{ promptPath: string; cwd: string }> = [];
  const runner = {
    async run(promptPath: string, cwd: string) {
      calls.push({ promptPath, cwd });
      return { exitCode: 0, stdout: 'ok', stderr: '' };
    },
  };

  const result = await runner.run('/tmp/prompt.md', '/tmp/worktree');

  expect(result.exitCode).toBe(0);
  expect(calls).toEqual([{ promptPath: '/tmp/prompt.md', cwd: '/tmp/worktree' }]);
});
```

실행:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/executor/claude-code-executor.test.ts
```

기대 결과:

- 현재는 통과할 수 있다. 이후 refactor에서 이 test가 compatibility guard가 된다.

- [x] **Step 2: 새 타입은 별도 파일에 추가**

`packages/core/src/executor/agent-runner.ts`:

```ts
export type AgentBackend = 'mock' | 'claude-code' | 'codex';

export interface AgentRunInput {
  promptPath: string;
  cwd: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AgentRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
  command?: string[];
}

export interface AgentRunner {
  backend: AgentBackend;
  run(input: AgentRunInput): Promise<AgentRunResult>;
}

export interface LegacyClaudeRunner {
  run(promptPath: string, cwd: string): Promise<AgentRunResult>;
}

export function adaptClaudeRunnerToAgent(claude: LegacyClaudeRunner): AgentRunner {
  return {
    backend: 'claude-code',
    run(input) {
      return claude.run(input.promptPath, input.cwd);
    },
  };
}
```

기대 결과:

- `ClaudeRunner` public shape를 `AgentRunner`로 alias하지 않는다.

## Task 5: 안전한 process runner primitive

**사용 plugin/skill:** `context7` 또는 Node official docs fallback, `superpowers:test-driven-development`

**Files:**
- 생성: `packages/core/src/executor/agent-process.ts`
- 테스트: `packages/core/tests/executor/agent-process.test.ts`

- [x] **Step 1: RED tests 작성**

테스트 항목:

```ts
it('spawns with args array and shell false');
it('passes only allowlisted env vars');
it('kills timed out process with exitCode 124');
it('records command without secrets');
```

Expected failure:

- `agent-process.ts`가 없어 fail.

- [x] **Step 2: process runner 구현**

핵심 contract:

```ts
export interface SpawnAgentProcessInput {
  executable: string;
  args: string[];
  cwd: string;
  stdin?: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
}

export async function spawnAgentProcess(input: SpawnAgentProcessInput): Promise<AgentRunResult> {
  // spawn(input.executable, input.args, {
  //   cwd: input.cwd,
  //   shell: false,
  //   detached: process.platform !== 'win32',
  //   env: buildAgentEnv(input.env),
  //   stdio: ['pipe', 'pipe', 'pipe'],
  // })
}
```

Process group policy:

```ts
function terminateChild(child: ChildProcess): void {
  if (process.platform !== 'win32' && typeof child.pid === 'number') {
    try {
      process.kill(-child.pid, 'SIGTERM');
      return;
    } catch {
      child.kill('SIGTERM');
      return;
    }
  }
  child.kill('SIGTERM');
}
```

Env allowlist:

```ts
const ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'TMPDIR',
  'OPENAI_API_KEY',
  'CODEX_HOME',
  'XDG_CONFIG_HOME',
];
```

기대 결과:

- `shell: true`가 코드에 없어야 한다.
- tests가 process timeout과 env filtering을 증명한다.

## Task 6: redaction과 artifact 분리

**사용 plugin/skill:** `superpowers:test-driven-development`

**Files:**
- 생성: `packages/core/src/executor/redaction.ts`
- 수정: `packages/core/src/executor/run-artifacts.ts`
- 테스트: `packages/core/tests/executor/redaction.test.ts`
- 테스트: `packages/core/tests/executor/run-artifacts.test.ts`

- [x] **Step 1: redaction tests 작성**

케이스:

```ts
expect(redactSecrets('OPENAI_API_KEY=sk-proj-abc123')).toContain('[REDACTED]');
expect(redactSecrets('token: ghp_abcdefghijklmnopqrstuvwxyz')).toContain('[REDACTED]');
expect(redactSecrets('normal output')).toBe('normal output');
```

- [x] **Step 2: artifact paths 확장**

`RunArtifactPaths`에 추가:

```ts
ndjsonPath: string;
lastMessagePath: string;
```

Expected file names:

```text
run-1.ndjson
run-1.log
run-1.last-message.md
run-1.json
```

- [x] **Step 3: raw와 human log 분리**

정책:

```text
- stdout JSONL raw는 .ndjson에 저장한다.
- 사람이 읽는 .log에는 redacted summary와 stderr/stdout first lines를 넣는다.
- metadata도 redacted command/env만 저장한다.
```

기대 결과:

- tests가 secret string이 `.log`와 `.json`에 남지 않음을 검증한다.

## Task 7: checkpoint commit과 run lifecycle

**사용 plugin/skill:** `superpowers:test-driven-development`, 실패 시 `superpowers:systematic-debugging`

**Files:**
- 생성: `packages/core/src/executor/run-issue.ts`
- 수정: `packages/core/src/executor/git.ts`
- 수정: `packages/core/src/executor/claude-code-executor.ts`
- 테스트: `packages/core/tests/executor/run-issue.test.ts`

- [x] **Step 1: RED lifecycle tests 작성**

필수 test names:

```ts
it('moves READY to REVIEW when agent changes files and checkpoint commit succeeds');
it('moves READY to FAILED when agent exits zero but produces no changes');
it('moves RUNNING to FAILED when agent exits non-zero');
it('moves RUNNING to FAILED when checkpoint commit fails');
it('moves RUNNING to FAILED when artifact writing fails after preserving issue log');
it('records baseCommit and headCommit in metadata');
```

- [x] **Step 2: git helpers 추가**

`packages/core/src/executor/git.ts`에 추가:

```ts
export async function revParse(runner: GitRunner, repoPath: string, ref = 'HEAD'): Promise<string>;
export async function addAll(runner: GitRunner, repoPath: string): Promise<void>;
export async function commitAll(runner: GitRunner, repoPath: string, message: string, body: string): Promise<void>;
```

`commitAll`은 author를 명시한다.

```bash
git -c user.name=Kanban Engine -c user.email=kanban-engine@example.invalid commit -m <message> -m <body>
```

- [x] **Step 3: `runIssueWithAgent()` 구현**

성공 조건:

```text
exitCode === 0
git status --porcelain has changes
git add -A succeeds
git commit succeeds
headCommit !== baseCommit
```

Failure convergence:

```text
RUNNING 이후 error -> best-effort artifact -> issue log append -> status FAILED -> lock release
```

기대 결과:

- no-change success는 `FAILED`.
- commit failure는 `FAILED`.
- lock은 모든 test에서 release.

## Task 8: CLI parser와 backend selection

**사용 plugin/skill:** `superpowers:test-driven-development`

**Files:**
- 생성: `packages/cli/tests/run-args.test.ts`
- 수정: `packages/cli/src/commands/run.ts`
- 수정: `packages/cli/tests/index.test.ts`

- [x] **Step 1: `parseRunArgs()` tests 작성**

케이스:

```ts
it('parses inspect-only run');
it('defaults execute backend to claude-code');
it('parses --execute --agent codex');
it('rejects --agent without --execute');
it('rejects unknown backend');
it('rejects --execute with --mock-executor conflict');
it('maps --mock-executor to mock backend without real git');
it('rejects extra positional args');
```

- [x] **Step 2: parser 구현**

Return shape:

```ts
type RunMode =
  | { kind: 'inspect'; issueId: string }
  | { kind: 'execute'; issueId: string; backend: AgentBackend; mockFail: boolean };
```

기대 결과:

- issue status mutation 전에 parser error가 반환된다.

## Task 9: execution target resolver와 approve fix

**사용 plugin/skill:** `superpowers:test-driven-development`

**Files:**
- 생성: `packages/core/src/executor/execution-target.ts`
- 테스트: `packages/core/tests/executor/execution-target.test.ts`
- 수정: `packages/cli/src/vault.ts`
- 수정: `packages/cli/src/commands/git-lifecycle.ts`
- 수정: `packages/cli/tests/index.test.ts`

- [x] **Step 1: resolver tests 작성**

케이스:

```ts
it('normalizes ~/ paths using os.homedir()');
it('uses merge_into to derive baseRef origin/<mergeInto>');
it('defaults mergeInto to repository default branch only when missing');
it('rejects missing working_dir before RUNNING mutation');
```

- [x] **Step 2: approve stale target fixture 추가**

CLI integration test:

```text
origin/main is one commit ahead of local main
kanban/VC-001 is based on origin/main
approve fetches, checkout main, merge --ff-only origin/main, merge --ff-only kanban/VC-001
issue becomes DONE
```

Failure test:

```text
local main diverged from origin/main
approve fails
issue remains REVIEW
```

- [x] **Step 3: `approveWithGit()` 수정**

필수 순서:

```ts
await fetchOrigin(runner, workingDir);
const mergeInto = await resolveMergeTarget(runner, issue, workingDir);
await checkoutBranch(runner, workingDir, mergeInto);
await mergeFfOnly(runner, workingDir, `origin/${mergeInto}`);
await mergeFfOnly(runner, workingDir, getKanbanBranchName(issue.id));
await cleanupKanbanWorktree(runner, workingDir, issue.id);
```

기대 결과:

- stale local target으로 DONE을 쓰지 않는다.

- [x] **Step 4: approve fast-forward 실패 안내 구현**

Failure output requirements:

```text
- working_dir, merge_into, origin/<merge_into>, kanban/<issue-id>, worktree path를 출력한다.
- 사용자가 직접 실행할 수 있는 진단 명령을 출력한다.
- kanban branch를 origin/<merge_into> 위로 재배치하는 rebase 예시를 출력한다.
- engine은 자동 rebase를 수행하지 않고 issue를 REVIEW에 둔다.
```

Suggested output snippets:

```bash
git -C <working_dir> fetch origin --prune
git -C <working_dir> log --oneline --graph --decorate --max-count=20 <merge_into> origin/<merge_into> kanban/<issue-id>
# kanban/<issue-id>는 이미 <worktree_path>에 checkout되어 있다.
git -C <worktree_path> rebase origin/<merge_into>
kanban approve <issue-id>
```

기대 결과:

- fast-forward 실패가 사용자가 복구 가능한 상태와 명령으로 설명된다.
- local target branch divergence는 engine이 해결하지 않고 사용자가 먼저 정리해야 한다는 문구가 있다.

## Task 10: Codex runner와 recovery command

**사용 plugin/skill:** OpenAI Developer Docs fallback, `superpowers:test-driven-development`

**Files:**
- 생성: `packages/core/src/executor/codex-runner.ts`
- 생성: `packages/core/tests/executor/codex-runner.test.ts`
- 수정: `packages/cli/src/commands/recover-run.ts`
- 수정: `packages/cli/src/commands/run.ts`
- 수정: `packages/cli/src/index.ts`
- 테스트: `packages/cli/tests/index.test.ts`

- [x] **Step 1: fake Codex executable tests 작성**

케이스:

```ts
it('runs codex exec with stdin prompt and workspace root');
it('uses --sandbox workspace-write and approval_policy never');
it('writes --output-last-message artifact path');
it('captures JSONL stdout into ndjson artifact');
it('maps ENOENT to exitCode 127');
it('maps timeout to exitCode 124');
```

- [x] **Step 2: `createCodexCliRunner()` 구현**

기본 args:

```ts
[
  'exec',
  '-',
  '-C', cwd,
  '--sandbox', 'workspace-write',
  '-c', 'approval_policy=never',
  '--json',
  '--color', 'never',
  '--ephemeral',
  '--output-last-message', lastMessagePath,
]
```

기대 결과:

- `--dangerously-bypass-approvals-and-sandbox`가 기본 args에 없어야 한다.

- [x] **Step 3: stale RUNNING recovery 설계 구현**

CLI command:

```bash
kanban recover-run <issue-id> --reason "stale RUNNING after process crash"
```

MVP 동작:

```text
only RUNNING issue accepted
lock is stale or missing
issue moves to FAILED
worktree is preserved
issue log records recovery reason
```

기대 결과:

- `RUNNING` issue를 사람이 수동으로 복구할 수 있다.

- [x] **Step 4: failed/recovery cleanup 안내 구현**

출력 요구사항:

```text
- recover-run은 worktree와 branch를 삭제하지 않는다.
- output과 issue log는 worktreePath, branchName, artifact path를 남긴다.
- output은 cleanupOwner를 retry 또는 abort로 안내한다.
- output은 진단 후 kanban retry <issue-id> 또는 kanban abort <issue-id> --discard를 선택하라고 안내한다.
```

기대 결과:

- 리뷰의 cleanup 요구는 자동 삭제가 아니라 명시적 cleanup 절차로 반영된다.
- failed worktree가 남아도 사용자가 다음 행동을 알 수 있다.

## Task 11: 검증 및 리뷰

**사용 plugin/skill:** `superpowers:verification-before-completion`, `superpowers:requesting-code-review`

**Files:**
- 수정: `codex-eval-loop.md`

- [x] **Step 1: targeted tests**

실행:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/executor/agent-process.test.ts
pnpm --filter @kanban-task-engine/core test -- tests/executor/redaction.test.ts tests/executor/run-artifacts.test.ts
pnpm --filter @kanban-task-engine/core test -- tests/executor/run-issue.test.ts tests/executor/codex-runner.test.ts
pnpm --filter @kanban-task-engine/cli test -- tests/run-args.test.ts tests/index.test.ts
```

기대 결과:

- 모두 PASS.
- timeout race 회귀 테스트는 `stdin error`, `child error`, child `close` 순서까지 포함한다.

- [x] **Step 2: global checks**

실행:

```bash
pnpm -r build
pnpm -r test
pnpm eval:superpowers
```

기대 결과:

- 모두 exit code 0.

- [x] **Step 3: artifact 직접 검사**

검사 대상:

```text
runs/<date>/<issue-id>/run-<n>.json
runs/<date>/<issue-id>/run-<n>.log
runs/<date>/<issue-id>/run-<n>.ndjson
runs/<date>/<issue-id>/run-<n>.last-message.md
events/<date>.jsonl
issue markdown log section
```

기대 결과:

- secret pattern이 redacted.
- backend, exitCode, baseCommit, headCommit 기록.
- raw JSONL과 human log 분리.
- fake `codex` executable smoke에서 `run-1.ndjson`, `run-1.log`, `run-1.last-message.md`, `run-1.json`, `events/<date>.jsonl`, issue log를 직접 확인한다.

- [x] **Step 4: subagent review**

read-only reviewer dispatch 대상:

```text
Reviewer A: API compatibility and CLI parser
Reviewer B: process/security/redaction
Reviewer C: lifecycle/git/recovery/eval
```

기대 결과:

- P0/P1 없음.
- P2는 후속 issue로 분리하거나 구현 전에 반영한다.
- 최종 timeout/process review 결과는 `Merge-ready`, P0/P1 없음이다.

- [x] **Step 5: manual dogfood gate 확장**

Codex 성공 게이트:

```bash
kanban run <real-issue-id> --execute --agent codex
kanban approve <real-issue-id>
```

Codex 실패 게이트:

```bash
kanban run <failing-issue-id> --execute --agent codex
kanban recover-run <failing-issue-id> --reason "dogfood failure recovery"
```

Legacy Claude 게이트:

```bash
kanban run <legacy-issue-id> --execute
kanban approve <legacy-issue-id>
```

기대 결과:

- Codex 성공 경로는 `READY -> RUNNING -> REVIEW -> DONE`과 artifact 생성을 증명한다.
- Codex 실패/timeout/no-change 경로는 `FAILED`, redaction, preserved worktree, cleanup 안내를 증명한다.
- `--agent`를 생략한 legacy Claude 경로는 backend `claude-code`로 동작하고 approve까지 통과한다.

Status:

- Gate 정의와 증거 기준은 `docs/superpowers/specs/2026-04-30-agent-runner-codex-target-design.md` section 16을 authoritative source로 둔다.
- 이 plan slice에서는 중복 spec을 만들지 않고 `codex-eval-loop.md`의 `Manual Dogfood Gate - Pending Live Runtime` 섹션에 실행 명령, 필수 evidence, blocker recording rule을 추가했다.
- 실제 live Codex/Claude dogfood는 이 환경에서 실행하지 않았다. Authenticated `codex`/`claude` CLI와 안전한 real issue/runtime이 확인되기 전까지 operational readiness는 pending/blocker로 유지한다.

## Task 12: Skill 승격 여부 판정

**사용 plugin/skill:** `superpowers:writing-skills`, `skill-creator`

**Files:**
- No code change by default
- Optional create only if approved later: `$CODEX_HOME/skills/kanban-agent-runner/SKILL.md`

- [x] **Step 1: skill 필요성 판정**

다음 조건 중 2개 이상이면 skill 생성을 제안한다.

```text
- AgentRunner backend를 추가하는 작업이 반복될 가능성이 높다.
- process runner security/redaction/recovery 절차를 다른 repo에서도 재사용한다.
- 다른 agent가 이 절차를 자주 빠뜨릴 가능성이 있다.
```

기대 결과:

- 이번 구현 중에는 새 skill을 자동 생성하지 않는다.
- 필요하면 별도 승인 후 `skill-creator`의 init/validate workflow를 따른다.
- 판정: 반복 가능성은 있으나 현재 repo-specific convention과 구현 세부가 강하므로 이번 PR에서는 새 skill을 만들지 않는다. 후속 backend가 추가될 때 cross-project pattern으로 재평가한다.

- [x] **Step 2: skill로 만들 경우 scope**

Skill name:

```text
kanban-agent-runner
```

Description draft:

```yaml
description: Use when adding or reviewing kanban-task-engine AgentRunner backends, non-interactive CLI agent execution, runner security, artifact logging, or run lifecycle recovery.
```

기대 결과:

- project-specific convention이면 repo docs에 두고, cross-project pattern이면 skill로 승격한다.

## 완료 조건

- spec 문서가 한국어 정책을 만족한다.
- 기존 `ClaudeRunner.run(promptPath, cwd)` compatibility가 테스트로 보호된다.
- `--agent` parser가 mutation 전 검증된다.
- eval harness가 AgentRunner/Codex required checks 실패 시 non-zero로 실패한다.
- Codex runner는 `shell: false`, args array, env allowlist, redaction, timeout process cleanup을 테스트로 증명한다.
- checkpoint commit failure와 no-change success가 `FAILED`로 수렴한다.
- approve는 `origin/<merge_into>` fast-forward 후 kanban branch를 merge한다.
- approve fast-forward 실패 output은 수동 진단/복구 안내와 rebase 예시를 포함한다.
- stale `RUNNING` recovery 경로가 있다.
- failed/recovery output은 worktree 보존 이유와 retry/abort 기반 cleanup 절차를 안내한다.
- `pnpm -r build`, `pnpm -r test`, `pnpm eval:superpowers`가 통과한다.
- 실제 Codex auth가 있으면 Codex 성공, Codex 실패/timeout/no-change, legacy Claude 기본 실행 dogfood를 수행하고 artifact를 직접 검사한다.

## 실행 방식 선택

권장 실행 방식:

1. `superpowers:subagent-driven-development`: Task 2-3, Task 5-6, Task 7-10을 독립 slice로 나눠 진행하고 각 slice 후 리뷰한다.
2. `superpowers:executing-plans`: 한 세션에서 순차 실행하되 Task 3, 7, 10, 11에서 checkpoint review를 둔다.

현재 repo의 dirty state가 크므로 구현 시작 전에는 반드시 별도 worktree를 만든다. worktree를 만들 수 없는 상황이면 현재 dirty files를 그대로 둔 채 새 파일만 수정하는 방식으로 제한한다.
