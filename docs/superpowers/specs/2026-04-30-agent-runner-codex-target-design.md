# AgentRunner 일반화 및 Codex 실행 대상 설계

날짜: 2026-04-30
상태: 구현 계획용 초안
저장소: `~/Projects/kanban-task-engine`

## 1. 요약

`kanban run <id> --execute`는 현재 실행 backend를 Claude 전용 경로로 다룬다. MVP hardening loop에서는 같은 kanban lifecycle을 Codex 실행 대상으로도 돌릴 수 있어야 하며, 이를 위해 control-plane 의미를 다시 만들지 않고 실행 backend만 일반화한다.

이 문서는 기존 Claude 실행 경로를 backend 중립 `AgentRunner` 계약으로 추출하고, `kanban run <id> --execute --agent codex`를 위한 `codex` target을 추가한다. 기존 Claude 실행과 mock 실행은 migration window 동안 backward compatibility를 유지한다.

목표 lifecycle은 다음과 같다.

```text
READY issue
  -> kanban run <id> --execute --agent codex
  -> RUNNING
  -> target repo worktree 생성
  -> codex exec가 해당 worktree에서 실행
  -> code 변경이 있으면 engine이 checkpoint commit 생성
  -> issue가 REVIEW로 전이
  -> kanban approve <id>
  -> merge target을 fast-forward 갱신한 뒤 kanban branch merge
  -> issue가 DONE으로 전이
```

## 2. 목표

- `kanban run --execute`에 Codex를 실제 실행 backend로 추가한다.
- `kanban run <id>`의 inspect-only 동작은 유지한다.
- 실행 대상 선택 우선순위는 정확히 `CLI --agent > issue frontmatter executor > claude-code default`로 둔다.
- `kanban run <id> --execute`가 `--agent`와 issue frontmatter `executor`를 모두 받지 않은 경우에만 기존 Claude backend를 기본값으로 유지한다.
- `kanban run <id> --mock-executor`를 deterministic local test용으로 유지한다.
- backend별 process 실행은 공통 `AgentRunner` 계약 뒤로 숨긴다.
- `RUNNING`까지 도달한 모든 run은 `REVIEW` 또는 `FAILED`로 수렴하게 한다.
- backend, command, exit code, worktree path, git checkpoint 상태를 debug할 수 있는 artifact metadata를 남긴다.
- CI에서는 live Codex credential 없이 deterministic fake Codex test로 engine lifecycle을 검증한다.
- local authenticated 환경에서의 real Codex dogfood는 별도 release gate로 둔다.

## 3. 범위 제외

- kanban Markdown schema를 API database로 대체하지 않는다.
- Vercel AI SDK를 MVP code execution runtime으로 삼지 않는다.
- provider plugin marketplace를 만들지 않는다.
- autonomous scheduling, prioritization, multi-issue execution은 이번 slice에서 다루지 않는다.
- agent가 approve, merge, retry, issue lifecycle mutation을 직접 수행하게 하지 않는다.
- unsafe sandbox/approval bypass를 기본값으로 두지 않고 MVP public option으로 노출하지 않는다.
- unsafe sandbox/approval override를 MVP CLI flag나 issue frontmatter에 노출하지 않는다.

## 4. 현재 상태

현재 실행 경로는 다음 파일에 집중되어 있다.

- `packages/core/src/executor/claude-code-executor.ts`
- `packages/cli/src/commands/run.ts`
- `packages/core/src/executor/run-artifacts.ts`
- `packages/core/src/executor/worktree.ts`
- `packages/cli/src/commands/approve.ts`
- `packages/cli/src/commands/git-lifecycle.ts`

중요한 기존 동작은 다음과 같다.

- `runIssueWithClaude()`는 `READY` issue를 읽고, `RUNNING`으로 쓰고, kanban worktree를 만들고, prompt를 쓰고, Claude runner를 호출하고, run artifact를 쓰고, issue를 `REVIEW` 또는 `FAILED`로 전이한다.
- `createClaudeCliRunner()`는 `claude -p @<promptPath>`를 실행한다.
- `kanban run <id> --execute`는 real git과 real Claude를 사용한다.
- `kanban run <id> --mock-executor`는 fake git과 fake Claude를 사용한다.
- `RunMetadata`에는 optional `baseCommit`과 `headCommit`이 이미 있지만 현재 executor는 채우지 않는다.

이번 spec에서 닫아야 할 gap은 다음과 같다.

- issue가 `RUNNING`으로 쓰인 뒤 artifact 작성 전 예외가 나면 issue가 `RUNNING`에 stuck될 수 있다.
- runner timeout, cancellation, sandbox mode, approval policy, extra args가 runner contract에 없다.
- runner `exitCode`가 `0`이면 code 변경이 없어도 `REVIEW`로 갈 수 있다.
- run prompt는 issue markdown을 포함하지만 실행 contract가 충분히 강하지 않다.
- `approve`는 kanban branch merge 전에 local merge target을 `origin/<merge_into>`에서 fast-forward 갱신해야 한다.
- `~`가 포함된 default `working_dir` 값은 Node process API와 git command에 넘기기 전에 normalize되어야 한다.

## 5. 결정: Codex 실행 대상은 `codex exec` 사용

Codex backend는 MVP code execution에 Vercel AI SDK가 아니라 Codex CLI를 사용한다.

판단 근거:

- `codex exec`는 scripted 또는 CI-style non-interactive run에 맞는 entrypoint다.
- `-C`로 workspace root를 받을 수 있다.
- `-`로 stdin prompt를 받을 수 있다.
- `--json`으로 newline-delimited JSON event를 출력할 수 있다.
- `--sandbox`로 sandbox mode를 지정할 수 있다.
- `-c key=value`로 `approval_policy` 같은 inline config override를 줄 수 있다.

Vercel AI SDK는 향후 LLM judge scoring, task classification, artifact summarization, structured report generation 같은 비실행 기능에는 유용할 수 있다. 하지만 repository를 수정하는 MVP substrate로 쓰면 engine이 shell tool layer, patch protocol, git lifecycle, sandbox, timeout, event model을 직접 설계하고 보호해야 하므로 이번 slice의 범위를 벗어난다.

참조 문서:

- OpenAI Codex CLI reference: `https://developers.openai.com/codex/cli/reference#codex-exec`
- OpenAI Codex config reference: `https://developers.openai.com/codex/config-reference#configtoml`
- OpenAI sandbox and approvals guide: `https://developers.openai.com/codex/agent-approvals-security#sandbox-and-approvals`
- Node.js child process docs: `https://nodejs.org/api/child_process.html`
- Vercel AI SDK docs: `https://vercel.com/docs/ai-sdk`

## 6. 공개 CLI 계약

### 6.1 조회 전용 동작

기존 동작을 유지한다.

```bash
kanban run <issue-id>
```

기대 동작:

- worktree를 만들지 않는다.
- agent를 실행하지 않는다.
- issue status를 바꾸지 않는다.
- issue id, title, status, working directory, merge target을 출력한다.

### 6.2 기존 실행 동작

Backward compatible하게 유지한다.

```bash
kanban run <issue-id> --execute
```

기대 동작:

- issue frontmatter `executor`가 있으면 해당 backend를 fallback으로 사용한다.
- issue frontmatter `executor`가 없으면 기본 backend인 `claude-code`를 사용한다.
- `--execute`에 의존하는 기존 script는 계속 동작한다.

### 6.3 명시적 실행 대상 선택

새 동작은 다음과 같다.

```bash
kanban run <issue-id> --execute --agent codex
kanban run <issue-id> --execute --agent claude-code
kanban run <issue-id> --execute --agent mock
```

규칙:

- `--agent`는 `--execute`와 함께 있을 때만 유효하다.
- 실행 대상 선택 우선순위는 정확히 `CLI --agent > issue frontmatter executor > claude-code default`다.
- `--execute`가 있고 `--agent`가 없으면 issue frontmatter `executor`를 fallback으로 쓴다.
- `claude-code` 기본값은 `--agent`와 issue frontmatter `executor`가 모두 없을 때만 적용한다.
- `--mock-executor`는 계속 지원하고 `mock` backend로 매핑한다.
- `--mock-executor`와 `--agent`가 동시에 오면 CLI parser conflict로 실패시킨다.
- 알 수 없는 backend 값은 issue status mutation 전에 실패시킨다.
- CLI에서 선택한 backend가 issue frontmatter보다 우선한다.
- issue frontmatter `executor`는 `--execute`가 있고 `--agent`가 생략된 경우에만 fallback으로 사용할 수 있다.
- unsafe sandbox/approval override는 MVP CLI/frontmatter에 노출하지 않는다.

권장 CLI 출력:

```text
issue: VC-001
outcome: REVIEW
backend: codex
runNumber: 1
worktree: /path/to/repo/.worktrees/kanban/VC-001
log: /path/to/vault/runs/2026-04-30/VC-001/run-1.log
metadata: /path/to/vault/runs/2026-04-30/VC-001/run-1.json
headCommit: abc1234
```

## 7. 핵심 API 계약

### 7.1 Agent 실행 대상 타입

`packages/core/src/executor/agent-runner.ts`에 backend 중립 type을 둔다.

```ts
export type AgentBackend = 'mock' | 'claude-code' | 'codex';
```

### 7.2 Agent 실행 입력

```ts
export interface AgentRunInput {
  promptPath: string;
  cwd: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}
```

### 7.3 Agent 실행 결과

```ts
export interface AgentRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
  command?: string[];
}
```

### 7.4 Agent 실행기 계약

```ts
export interface AgentRunner {
  backend: AgentBackend;
  run(input: AgentRunInput): Promise<AgentRunResult>;
}
```

### 7.5 실행기 옵션

```ts
export interface AgentCliRunnerOptions {
  executable?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}
```

Codex 전용 option:

```ts
export interface CodexCliRunnerOptions extends AgentCliRunnerOptions {
  sandboxMode?: 'read-only' | 'workspace-write';
  approvalPolicy?: 'never';
  model?: string;
  profile?: string;
  ephemeral?: boolean;
  json?: boolean;
}
```

Claude 전용 option은 처음에는 좁게 유지한다.

```ts
export interface ClaudeCliRunnerOptions extends AgentCliRunnerOptions {}
```

### 7.6 기존 Claude runner 형태 보존

기존 runtime과 test가 의존하던 two-argument Claude runner shape는 alias로 덮지 않는다. `ClaudeRunner`를 `AgentRunner`로 단순 alias하는 방식은 기존 call site의 `run(promptPath, cwd)` contract를 깨뜨릴 수 있으므로 금지한다.

Legacy contract는 다음 adapter로 보존한다.

```ts
export interface LegacyClaudeRunner {
  run(promptPath: string, cwd: string): Promise<AgentRunResult>;
}

export function adaptClaudeRunnerToAgent(claude: LegacyClaudeRunner): AgentRunner;
```

보존해야 하는 export:

```ts
export type ClaudeRunResult = AgentRunResult;
export function createClaudeCliRunner(options?: ClaudeCliRunnerOptions): LegacyClaudeRunner;
export function createClaudeAgentRunner(options?: ClaudeCliRunnerOptions): AgentRunner;
export function runIssueWithClaude(input: RunIssueWithClaudeInput): Promise<RunIssueWithClaudeResult>;
```

`createClaudeCliRunner()`는 기존 two-argument `LegacyClaudeRunner.run(promptPath, cwd)` shape를 계속 반환한다. 새 `AgentRunner`가 필요한 orchestration은 `createClaudeAgentRunner()`를 사용하거나 내부에서 `adaptClaudeRunnerToAgent(createClaudeCliRunner(options))` 경로를 사용한다. `runIssueWithClaude()`는 `runIssueWithAgent()`에 `agent: createClaudeAgentRunner()`를 넘기는 thin wrapper로 유지한다. 기존 two-argument runner 호출자는 변경 없이 유지되어야 한다.

## 8. 프로세스 및 보안 계약

agent process 실행은 `packages/core/src/executor/agent-process.ts` 같은 공통 helper로 모은다. Codex와 Claude runner는 이 helper를 통해 동일한 security invariant를 따른다.

불변식:

- `child_process.spawn`은 반드시 executable과 args array로 호출한다.
- spawn option은 `shell: false`를 명시하거나 Node 기본값이 `false`임을 test로 고정한다. `shell: true`는 금지한다.
- command string concat으로 shell command를 만들지 않는다.
- Codex/Claude child env는 allowlist 기반으로 구성한다.
- allowlist 예시는 `PATH`, `HOME`, `USER`, `TMPDIR`, `LANG`, `LC_ALL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `CODEX_HOME`, `CLAUDE_CONFIG_DIR`이며, 실제 목록은 test로 고정한다.
- stdout, stderr, metadata, human log 저장 전 secret redaction을 적용한다.
- redaction은 token-like value, API key env value, bearer token, `sk-...` 형태를 최소한 가린다.
- timeout 시 POSIX에서는 child를 `detached: true` process group으로 실행하고 `process.kill(-pid, signal)`로 group을 종료한다.
- Windows에서는 negative pid process group kill을 사용하지 않는다. child kill 후 retry/cleanup 진단을 metadata와 log에 남긴다.
- timeout 결과는 `exitCode: 124`, `timedOut: true`, redacted stderr summary로 반환한다.
- missing executable은 `exitCode: 127`로 반환하고 issue를 `FAILED`로 수렴시킨다.
- unsafe sandbox/approval override는 MVP CLI/frontmatter에 노출하지 않는다.
- MVP public runner option은 unsafe sandbox mode나 arbitrary CLI argument bypass를 받지 않는다.

Codex command shape:

```bash
codex exec - \
  -C <worktree-path> \
  --sandbox workspace-write \
  -c approval_policy=never \
  --json \
  --color never \
  --output-last-message <last-message-path> \
  --ephemeral
```

Codex runner 동작:

- `promptPath`를 읽어 `codex exec -` stdin으로 전달한다.
- process `cwd`는 worktree path로 둔다.
- `-C <worktree-path>`도 함께 넘겨 Codex workspace root를 명시한다.
- `sandboxMode` 기본값은 `workspace-write`다.
- `approvalPolicy`는 MVP에서 non-interactive execution을 위해 `never`로 고정한다.
- `json` 기본값은 `true`다.
- `ephemeral` 기본값은 `true`로 두고, kanban engine이 durable run artifact를 소유한다.
- arbitrary `extraArgs`는 MVP public option에서 제거한다. test helper가 내부적으로 추가 argument를 주입해야 한다면 allowlist/denylist를 가진 internal-only fixture option으로 제한하고 production CLI/frontmatter로 연결하지 않는다.
- `--full-auto`는 on-request approval로 hang될 수 있으므로 기본값으로 쓰지 않는다.
- unsafe approval/sandbox bypass flag는 기본값으로 쓰지 않고 MVP public contract에 노출하지 않는다.

## 9. 프롬프트 계약

prompt file은 raw issue markdown과 engine이 생성한 실행 contract tail을 함께 포함한다.

필수 prompt section:

```markdown
# <issue-id> execution prompt

<raw issue markdown>

---

## Engine Execution Contract

- Work only inside the current repository worktree.
- Implement only the issue described above.
- Do not edit the kanban vault directly.
- Do not approve, merge, retry, or mutate issue lifecycle state.
- Do not run destructive git commands such as `git reset --hard` unless the issue explicitly requires it.
- Prefer the smallest relevant tests before broad test suites.
- Leave code changes in the worktree; the kanban engine will create the checkpoint commit.
- In the final response, summarize changed files, commands run, and remaining risks.
```

판단 근거:

- agent는 implementation에 집중해야 한다.
- engine은 status transition, artifact writing, checkpoint commit을 소유해야 한다.
- engine은 code 변경이 없는 성공 exit를 `FAILED`로 처리할 수 있어야 한다.

Acceptance에서는 prompt content test를 요구한다. 이 test는 raw issue markdown, `Engine Execution Contract`, lifecycle mutation 금지 문구, checkpoint commit 소유권 문구가 prompt에 들어가는지 확인해야 한다.

## 10. 실행 생명주기

### 10.1 사전 점검

issue를 변경하기 전에 다음을 수행한다.

- id로 issue를 resolve한다.
- frontmatter id가 요청 id와 일치하는지 확인한다.
- status가 `READY`인지 확인한다.
- CLI flag, issue frontmatter, 기본값 순서로 backend를 resolve한다.
- backend가 known value인지 확인한다.
- `working_dir`를 resolve하고 normalize한다.
- git command 전에 unresolved `~` path를 reject한다.
- execution lock을 획득한다.

### 10.2 RUNNING 전이

lock 획득 후 다음을 수행한다.

- `runNumber`를 계산한다.
- `run_count`를 증가시킨다.
- issue status를 `RUNNING`으로 쓴다.
- 이 시점 이후 모든 실패는 `FAILED`로 수렴해야 한다.

### 10.3 작업 트리 준비

- test에서 비활성화하지 않은 경우 `fetch origin`을 수행한다.
- branch `kanban/<issue-id>`를 만든다.
- worktree를 `<working_dir>/.worktrees/kanban/<issue-id>`에 만든다.
- worktree 생성 뒤 `baseCommit`을 기록한다.

### 10.4 Agent 실행 단계

- prompt를 `runtime/prompts/<date>/<issue-id>-run-<n>.md`에 쓴다.
- 선택된 `AgentRunner`를 실행한다.
- stdout, stderr, command, exit code, timeout flag를 capture한다.
- capture된 raw stream은 artifact 저장 전 redaction pipeline을 거친다. `--json` raw event stream은 별도 `.ndjson`에 보존하되 secret value는 저장 전에 redaction한다.

### 10.5 성공 조건

run은 아래 조건을 모두 만족할 때만 `REVIEW`로 갈 수 있다.

- agent result가 `exitCode === 0`이다.
- agent run 이후 worktree에 file change가 있다.
- engine이 `kanban/<issue-id>`에 checkpoint commit을 성공적으로 만든다.
- `headCommit`이 `baseCommit`과 다르다.

`exitCode === 0`이지만 worktree change가 없으면 reason `agent produced no changes`로 `FAILED` 처리한다.

### 10.6 Checkpoint commit 생성

engine이 checkpoint commit을 소유한다.

```bash
git add -A
git -c user.name="Kanban Task Engine" -c user.email="kanban-task-engine@noreply.local" commit -m "kanban: <issue-id> <issue-title>"
```

commit body:

```text
Issue: <issue-id>
Backend: <backend>
실행: <runNumber>

Co-Authored-By: Codex <session model name if available> <noreply@openai.com>
```

runtime에서 current session model name을 알 수 없으면 deterministic fallback을 쓴다.

```text
Co-Authored-By: Codex unknown <noreply@openai.com>
```

checkpoint commit failure는 `FAILED`로 수렴해야 하며, worktree는 기본적으로 보존한다. Acceptance에서는 git author 설정 누락, empty commit, commit command failure가 `FAILED`와 diagnostic metadata로 이어지는 checkpoint commit failure test를 포함한다.

### 10.7 실패 수렴

issue가 `RUNNING`으로 쓰인 뒤 발생한 모든 error는 가능한 범위에서 다음을 수행해야 한다.

- run log를 쓴다.
- run metadata를 쓴다.
- `issue.run` event를 append한다.
- issue log entry를 append한다.
- issue status를 `FAILED`로 옮긴다.
- lock을 release한다.

artifact writing 자체가 실패해도 engine은 issue를 `FAILED`로 옮기려고 시도하고, original error와 artifact error를 issue log에 함께 남긴다.

## 11. 산출물 계약

run artifact는 raw machine stream, human summary, last message, metadata를 분리한다.

경로:

```text
runs/<date>/<issue-id>/run-<n>.ndjson
runs/<date>/<issue-id>/run-<n>.log
runs/<date>/<issue-id>/run-<n>.last-message.md
runs/<date>/<issue-id>/run-<n>.json
```

저장 규칙:

- `--json` stdout event stream은 raw `.ndjson` artifact에 저장한다.
- `.ndjson`는 newline-delimited JSON event 원형을 유지하되 secret redaction을 먼저 적용한다.
- human `.log`는 redacted summary다. command, backend, exit code, timeout, base/head commit, 주요 stdout/stderr summary만 사람이 읽기 좋게 담는다.
- `--output-last-message`가 쓴 output은 `run-<n>.last-message.md` 별도 artifact로 남긴다.
- `run-<n>.json`은 structured metadata이며 backend, command array, exitCode, timedOut, worktreePath, logPath, ndjsonPath, lastMessagePath, baseCommit, headCommit, cleanup/recovery diagnostic을 포함한다.

`RunMetadata` 확장:

```ts
export interface RunMetadata {
  issueId: string;
  runNumber: number;
  startedAt: string;
  completedAt?: string;
  outcome: 'REVIEW' | 'FAILED';
  backend: AgentBackend;
  command?: string[];
  exitCode?: number;
  timedOut?: boolean;
  failureReason?: string;
  acceptanceRatio: AcceptanceRatio;
  baseCommit?: string;
  headCommit?: string;
  worktreePath?: string;
  logPath?: string;
  ndjsonPath?: string;
  lastMessagePath?: string;
  cleanup?: CleanupDiagnostic;
  recovery?: RecoveryDiagnostic;
}
```

human log 예시:

```markdown
backend: codex
command: codex exec - -C /path/to/worktree --sandbox workspace-write ...
exitCode: 0
timedOut: false
baseCommit: abc1234
headCommit: def5678
ndjson: /path/to/vault/runs/2026-04-30/VC-001/run-1.ndjson
lastMessage: /path/to/vault/runs/2026-04-30/VC-001/run-1.last-message.md

## stdout summary

...

## stderr summary

...
```

event에는 backend를 포함한다.

```json
{"type":"issue.run","issueId":"VC-001","runNumber":1,"backend":"codex","outcome":"REVIEW","at":"2026-04-30T00:00:00.000Z"}
```

## 12. 복구 및 정리 정책

debug evidence 보존을 위해 `FAILED` 기본값은 worktree 보존이다. 실패 직후 자동 cleanup은 하지 않는다.

정책:

- `FAILED` issue의 worktree, branch, raw artifact는 기본적으로 보존한다.
- 기존 retry lifecycle은 이미 소유한 retry 경로에서 기존 failed worktree 정리를 수행할 수 있다.
- 기존 abort lifecycle은 이미 소유한 abort 경로에서 사용자가 명시한 cleanup을 수행할 수 있다.
- 이번 MVP가 새로 추가하는 stale RUNNING recovery command는 `kanban recover-run <issue-id> --reason "<reason>"`다.
- `recover-run`은 MVP에서 cleanup option을 노출하지 않는다. worktree는 항상 보존한다.
- Task 10은 retry/abort를 재구현하지 않는다. retry/abort의 기존 cleanup 경로는 유지하고, 새 stale RUNNING recovery만 `recover-run`으로 추가한다.
- stale lock은 기존 staleMs 기반 정책으로 교체할 수 있다.
- stale RUNNING issue는 `kanban recover-run <issue-id>`가 diagnostic artifact를 남긴 뒤 `FAILED`로 전이한다.
- stale RUNNING recovery는 lock 교체와 issue status 전이를 분리해서 기록한다.
- Windows timeout cleanup은 child kill 뒤 남은 process를 확정적으로 보장하지 못할 수 있으므로 retry/cleanup 진단을 metadata에 남긴다.
- `FAILED` 또는 `recover-run` 출력은 남은 worktree와 branch를 명시하고, 정리 절차를 함께 안내한다.
- 정리 안내는 자동 삭제가 아니라 사용자가 진단 후 선택할 수 있는 절차다. 기본 안내는 `kanban retry <issue-id>`로 새 실행을 준비하거나, 더 이상 보존할 필요가 없으면 `kanban abort <issue-id> --discard`로 기존 cleanup 경로를 사용하라는 형태다.
- 정리 안내에는 최소한 `worktreePath`, `branchName`, `cleanupOwner: retry|abort`, 그리고 재시도 전 확인할 artifact path를 포함한다.

Acceptance에서는 stale lock replacement fixture, stale RUNNING issue recovery fixture, 그리고 recovery/failed 출력이 cleanup 절차를 안내하는 fixture를 포함한다.

## 13. 승인 생명주기 수정

`kanban approve <id>`는 stale local target branch에 merge하면 안 된다.

필수 approve 순서:

```text
find REVIEW issue
resolve working_dir and merge_into
fetch origin --prune
checkout <merge_into>
merge --ff-only origin/<merge_into>
merge --ff-only kanban/<issue-id>
remove worktree
delete kanban branch
write issue DONE
```

git step이 실패하면 다음을 지킨다.

- `DONE`을 쓰지 않는다.
- CLI error를 명확히 반환한다.
- retry/diagnosis를 위해 issue를 `REVIEW`에 둔다.
- error에는 `working_dir`, `merge_into`, `origin/<merge_into>`, `kanban/<issue-id>`, worktree path를 포함한다.
- fast-forward 실패 시 engine은 자동 rebase를 수행하지 않는다. 대신 사용자가 직접 진단하고 고칠 수 있는 안내를 출력한다.

권장 진단/복구 안내:

```bash
git -C <working_dir> fetch origin --prune
git -C <working_dir> log --oneline --graph --decorate --max-count=20 <merge_into> origin/<merge_into> kanban/<issue-id>
# kanban/<issue-id>는 이미 <worktree_path>에 checkout되어 있다.
git -C <worktree_path> rebase origin/<merge_into>
kanban approve <issue-id>
```

이 안내는 `<worktree_path>`에 이미 checkout된 kanban branch를 최신 `origin/<merge_into>` 위로 재배치해야 하는 경우를 위한 수동 절차다. parent repo에서 `kanban/<issue-id>`를 checkout하지 않는다. local `<merge_into>` 자체가 `origin/<merge_into>`와 diverge된 경우에는 사용자가 target branch의 local divergence를 먼저 해소해야 하며, engine은 `DONE`을 쓰지 않고 멈춘다.

Acceptance에서는 approve stale-target fixture를 요구한다. 이 fixture는 local `merge_into`가 `origin/<merge_into>`보다 뒤처진 상태에서 approve가 먼저 fast-forward update를 수행하는지, fast-forward가 불가능하면 `DONE`을 쓰지 않는지, CLI error가 위 진단/복구 안내를 포함하는지 검증한다.

## 14. 구현 파일 지도

예상 구현 파일:

```text
packages/core/src/executor/
  agent-runner.ts
    공통 AgentRunner type과 option type.

  agent-process.ts
    spawn, env allowlist, timeout, redaction handoff.

  redaction.ts
    stdout, stderr, metadata, log용 secret redaction helper.

  run-issue.ts
    backend 중립 runIssueWithAgent orchestration.

  claude-code-runner.ts
    Claude CLI process runner 및 legacy adapter support.

  codex-runner.ts
    Codex CLI process runner.

  mock-runner.ts
    test와 --mock-executor용 deterministic runner.

  prompt-assembler.ts
    raw issue markdown와 Engine Execution Contract.

  claude-code-executor.ts
    run-issue.ts 주변 compatibility wrapper.

  run-artifacts.ts
    metadata 및 artifact path extension.

  git.ts
    아직 없다면 commit/status helper.

  worktree.ts
    필요 시 worktree path normalization support.

packages/cli/src/commands/
  run.ts
    --agent를 parse하고 선택된 backend로 dispatch.

  approve.ts
  git-lifecycle.ts
    kanban branch merge 전 local merge target을 origin에서 fast-forward.

  recover-run.ts
    worktree를 보존하면서 required reason으로 stale RUNNING을 복구.

packages/cli/src/
  vault.ts
    working_dir fallback을 normalize하고 executor frontmatter support를 유지.

packages/core/tests/executor/
  agent-process.test.ts
  redaction.test.ts
  prompt-assembler.test.ts
  codex-runner.test.ts
  run-issue.test.ts
  claude-code-executor.test.ts

packages/cli/tests/
  run-args.test.ts
  index.test.ts

scripts/
  eval-superpowers.ts
    static check를 Claude 전용 executor에서 AgentRunner + Codex target으로 갱신.
```

## 15. 테스트 설계

구현은 TDD 순서로 진행한다. 각 구현 step은 deterministic failing test부터 추가한다.

### 15.1 Codex 실행기 단위 테스트

대상:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/executor/codex-runner.test.ts
```

케이스:

- fake `codex` executable이 `exec`, `-`, `-C <worktree>`, `--sandbox workspace-write`, `-c approval_policy=never`, `--json`, `--color never`, `--output-last-message <path>`를 받는다.
- prompt content가 stdin으로 전달된다.
- process cwd가 worktree path다.
- stdout과 stderr가 capture된다.
- non-zero exit code가 반환된다.
- missing executable은 `exitCode: 127`로 매핑된다.
- timeout은 `exitCode: 124`, `timedOut: true`로 매핑된다.
- timeout 시 POSIX에서는 detached process group kill을 시도한다.
- Windows timeout은 child kill과 retry/cleanup diagnostic을 남긴다.

### 15.2 Agent process 및 보안 테스트

대상:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/executor/agent-process.test.ts
pnpm --filter @kanban-task-engine/core test -- tests/executor/redaction.test.ts
```

케이스:

- `child_process.spawn`은 args array와 `shell: false`로 호출된다.
- command injection payload가 shell에서 해석되지 않는다.
- child env는 allowlist에 포함된 key만 전달한다.
- stdout/stderr/metadata/log 저장 전 redaction이 적용된다.
- API key, bearer token, known secret env value가 artifact에 평문으로 남지 않는다.

### 15.3 Prompt assembler 테스트

대상:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/executor/prompt-assembler.test.ts
```

케이스:

- raw issue markdown이 prompt에 포함된다.
- `Engine Execution Contract`가 포함된다.
- kanban vault 직접 수정 금지, approve/merge/retry/lifecycle mutation 금지, destructive git command 금지 문구가 포함된다.
- checkpoint commit은 engine이 만든다는 문구가 포함된다.

### 15.4 일반 실행 생명주기 테스트

대상:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/executor/run-issue.test.ts
```

케이스:

- `READY` issue는 mock agent가 file을 바꾸고 engine commit이 성공하면 `RUNNING`을 거쳐 `REVIEW`가 된다.
- agent non-zero result는 `FAILED`가 된다.
- agent success지만 file change가 없으면 `FAILED`가 된다.
- `RUNNING` 이후 exception은 `FAILED`가 된다.
- checkpoint commit failure는 `FAILED`가 되고 worktree를 보존한다.
- metadata에는 backend, command, exitCode, baseCommit, headCommit, worktreePath, logPath, ndjsonPath, lastMessagePath가 포함된다.
- lock은 success와 failure 모두에서 release된다.

### 15.5 하위 호환성 테스트

대상:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/executor/claude-code-executor.test.ts
```

케이스:

- `runIssueWithClaude()`는 계속 import 가능하다.
- `createClaudeCliRunner()`는 계속 import 가능하고 `LegacyClaudeRunner`를 반환한다.
- `createClaudeAgentRunner()`는 계속 import 가능하고 `AgentRunner`를 반환한다.
- `LegacyClaudeRunner.run(promptPath, cwd)` shape가 `adaptClaudeRunnerToAgent()`를 통해 `AgentRunner.run(input)`으로 호출된다.
- 기존 Claude test는 compatibility wrapper를 통해 계속 통과한다.

### 15.6 CLI dispatch 및 parser 테스트

대상:

```bash
pnpm --filter @kanban-task-engine/cli test -- tests/run-args.test.ts
pnpm --filter @kanban-task-engine/cli test -- tests/index.test.ts
```

케이스:

- `kanban run <id>`는 inspect-only로 남는다.
- `kanban run <id> --mock-executor`는 계속 동작한다.
- `kanban run <id> --execute`는 Claude를 기본값으로 선택한다.
- `kanban run <id> --execute --agent codex`는 Codex를 선택한다.
- `kanban run <id> --execute --agent wat`는 issue mutation 전에 실패한다.
- `--execute` 없이 `--agent codex`를 주면 명확히 실패한다.
- `--mock-executor`와 `--agent codex`를 함께 주면 CLI parser conflict로 실패한다.
- issue frontmatter `executor: codex`는 fallback으로만 쓰인다.

### 15.7 승인 생명주기 테스트

대상:

```bash
pnpm --filter @kanban-task-engine/cli test -- tests/index.test.ts
```

케이스:

- `approve`는 merge 전에 `fetch origin --prune`을 수행한다.
- `approve`는 local `merge_into`를 `origin/<merge_into>`에서 fast-forward update한다.
- approve stale-target fixture는 local target이 뒤처진 상태를 만들고 update가 먼저 일어나는지 확인한다.
- local target이 fast-forward될 수 없으면 `DONE`을 쓰지 않고 실패한다.
- fast-forward 실패 출력은 worktree/branch 정보를 포함하고, `git log`, `<worktree_path>` 기준 `git rebase origin/<merge_into>`, `kanban approve <issue-id>` 수동 복구 안내를 포함한다.
- 성공한 approve는 worktree를 제거하고 kanban branch를 삭제하고 `DONE`을 쓴다.

### 15.8 복구 및 정리 테스트

대상:

```bash
pnpm --filter @kanban-task-engine/cli test -- tests/index.test.ts
```

케이스:

- stale lock은 staleMs 기준으로 교체 가능하다.
- stale RUNNING issue는 `kanban recover-run <issue-id>`로 `FAILED` 전이된다.
- `FAILED` 기본 동작은 worktree 보존이다.
- 기존 retry/abort lifecycle은 각자 이미 소유한 cleanup 경로를 유지한다.
- `recover-run`은 `--reason` 값을 요구하고 worktree 보존 diagnostic을 남긴다.
- 기존 retry/abort 외 경로에서 failed worktree를 자동 삭제하지 않는다.
- `recover-run`과 failed run 출력은 남은 worktree/branch, artifact path, `kanban retry <issue-id>` 또는 `kanban abort <issue-id> --discard` 기반 cleanup 절차를 안내한다.

### 15.9 평가 harness 테스트

대상:

```bash
pnpm eval:superpowers
pnpm --silent eval:superpowers --json
```

정적 check는 다음을 검증하고, 하나라도 빠지면 non-zero로 실패해야 한다.

- AgentRunner abstraction 존재.
- Codex runner와 Codex runner test 존재.
- `agent-process.test.ts`가 `shell: false`, args array, env allowlist를 검증.
- `redaction.test.ts`가 stdout/stderr/metadata redaction을 검증.
- prompt content test 존재.
- CLI가 `--agent`를 노출하고 parser conflict를 test.
- failure convergence test 존재.
- checkpoint commit failure test 존재.
- approve fast-forward target update test와 approve stale-target fixture 존재.
- stale RUNNING recovery test 존재.
- run metadata가 backend와 commit/artifact path field를 포함.

`pnpm eval:superpowers --json`은 required check 누락 시 exit code가 non-zero여야 한다. JSON report를 machine-readable stdout으로 소비하는 검증은 pnpm runner banner를 피하기 위해 `pnpm --silent eval:superpowers --json`를 사용한다. 이것이 eval false-positive 재발을 막는 acceptance gate다.

### 15.10 전체 검증

구현 완료 주장 전 필수 command:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/executor/agent-process.test.ts
pnpm --filter @kanban-task-engine/core test -- tests/executor/redaction.test.ts
pnpm --filter @kanban-task-engine/core test -- tests/executor/prompt-assembler.test.ts
pnpm --filter @kanban-task-engine/core test -- tests/executor/codex-runner.test.ts
pnpm --filter @kanban-task-engine/core test -- tests/executor/run-issue.test.ts
pnpm --filter @kanban-task-engine/core test -- tests/executor/claude-code-executor.test.ts
pnpm --filter @kanban-task-engine/cli test -- tests/run-args.test.ts
pnpm --filter @kanban-task-engine/cli test -- tests/index.test.ts
pnpm -r build
pnpm -r test
pnpm eval:superpowers
pnpm --silent eval:superpowers --json
```

## 16. 실제 Codex 검증 관문

Deterministic test는 live Codex auth를 요구하지 않는다. 단, feature를 operationally ready라고 부르기 전에는 real dogfood run이 필요하다.

Manual gate:

```bash
kanban run <real-issue-id> --execute --agent codex
kanban approve <real-issue-id>
```

확인할 evidence:

- issue status가 `READY -> RUNNING -> REVIEW -> DONE`으로 이동했다.
- worktree가 생성됐다.
- Codex `.ndjson`, `.log`, `.last-message.md`, `.json` artifact가 존재한다.
- metadata가 backend `codex`를 기록한다.
- metadata가 `baseCommit`과 `headCommit`을 기록한다.
- target repository에 checkpoint commit이 존재한다.
- approve step이 merge target을 갱신한 뒤 kanban branch를 merge했다.
- approve 성공 후 worktree와 kanban branch가 cleanup됐다.

Negative manual gate:

```bash
kanban run <failing-issue-id> --execute --agent codex
kanban recover-run <failing-issue-id> --reason "dogfood failure recovery"
```

확인할 evidence:

- 의도적으로 실패하거나 timeout/no-change를 유발한 issue가 `FAILED`로 수렴했다.
- failed run의 `.ndjson`, `.log`, `.last-message.md`, `.json` artifact가 존재한다.
- log와 metadata에 secret이 평문으로 남지 않았다.
- `recover-run`은 worktree를 삭제하지 않고 보존 diagnostic과 cleanup 안내를 남겼다.

Legacy Claude manual gate:

```bash
kanban run <legacy-issue-id> --execute
kanban approve <legacy-issue-id>
```

확인할 evidence:

- `--agent`를 생략한 기존 실행은 `claude-code` backend를 선택했다.
- 기존 Claude flow도 `READY -> RUNNING -> REVIEW -> DONE`으로 이동했다.
- metadata와 event가 backend `claude-code`를 기록했다.

live Codex auth, model access, local CLI availability가 없으면 blocker를 문서화하고 deterministic fake-Codex gate를 최고 완료 수준으로 둔다.

## 17. MVP 수용 기준

- `kanban run <id> --execute --agent codex`를 CLI가 받아들인다.
- `--agent`와 `--mock-executor` parser conflict가 mutation 전에 실패한다.
- fake Codex test가 process args, stdin prompt, cwd, stdout/stderr capture, non-zero exit, missing executable, timeout handling을 검증한다.
- `child_process.spawn`은 `shell: false`와 args array만 사용한다.
- Codex/Claude child env는 allowlist 기반이다.
- stdout/stderr/metadata/log artifact는 secret redaction 이후 저장된다.
- timeout 시 POSIX detached process group 종료와 Windows retry/cleanup diagnostic이 test된다.
- unsafe sandbox/approval override는 MVP CLI/frontmatter에 노출되지 않는다.
- generic run orchestration은 Claude-specific assumption을 제거한다.
- 기존 Claude behavior는 `createClaudeCliRunner()`의 `LegacyClaudeRunner` 반환과 `createClaudeAgentRunner()`/`adaptClaudeRunnerToAgent()` 경로로 backward compatible하다.
- 기존 mock executor behavior는 backward compatible하다.
- `RUNNING`에 도달한 모든 run은 `REVIEW` 또는 `FAILED`로 끝난다.
- agent success지만 code change가 없으면 `REVIEW`로 인정하지 않는다.
- successful agent code change는 engine이 checkpoint commit한다.
- checkpoint commit failure는 `FAILED`로 수렴하고 diagnostic을 남긴다.
- run artifact는 `run-<n>.ndjson`, `run-<n>.log`, `run-<n>.last-message.md`, `run-<n>.json`로 분리된다.
- `--json` output은 raw `.ndjson`, human log는 redacted summary, `--output-last-message`는 별도 artifact로 저장된다.
- `FAILED` 기본값은 worktree 보존이다.
- 기존 retry/abort lifecycle은 각자 이미 소유한 cleanup 경로를 유지한다.
- 새 stale RUNNING recovery는 cleanup을 수행하지 않고 worktree를 보존한다.
- failed/recovery output은 남은 worktree와 branch, artifact path, `retry`/`abort --discard` 기반 cleanup 절차를 안내한다.
- stale lock은 staleMs 기반으로 교체 가능하다.
- stale RUNNING issue는 `recover-run` command가 `FAILED`로 전이한다.
- `approve`는 kanban branch merge 전에 local merge target을 `origin/<merge_into>`에서 갱신한다.
- approve stale-target fixture가 존재한다.
- fast-forward 실패 output은 수동 진단/복구 안내와 rebase 예시를 포함하고, issue를 `REVIEW`에 둔다.
- prompt content test가 raw issue markdown과 engine execution contract를 검증한다.
- `pnpm eval:superpowers`와 `pnpm eval:superpowers --json`은 required AgentRunner/Codex coverage가 빠지면 non-zero로 실패한다. JSON parse가 필요한 검증은 `pnpm --silent eval:superpowers --json`를 사용한다.
- critical deterministic test가 실패하지 않는다.
- real dogfood gate는 Codex 성공 경로, Codex 실패/timeout/no-change 경로, legacy Claude 기본 실행 경로를 분리해서 검증한다.

## 18. 위험 및 완화

- live Codex behavior는 설치된 CLI version에 따라 달라질 수 있다. deterministic contract는 command construction을 검증하고, dogfood gate가 local runtime을 검증한다.
- non-interactive Codex run은 approval policy가 `never`로 고정되지 않으면 hang될 수 있다.
- prompt 자유도가 높으면 agent가 issue file이나 lifecycle state를 수정할 수 있다. engine execution contract가 이를 명시적으로 금지해야 한다.
- exit code `0`만 성공으로 보아 git change를 확인하지 않으면 false `REVIEW`가 생긴다.
- fast-forward-only approve는 기존 mock-heavy test가 놓친 stale local branch 문제를 드러낼 수 있다.
- `runIssueWithClaude()` wrapper와 `LegacyClaudeRunner` adapter 보존은 migration 동안 기존 import와 tests를 깨지 않기 위해 필요하다.

## 19. 권장 구현 순서

1. `agent-process.test.ts`와 `redaction.test.ts`에 process/security failing test를 추가한다.
2. `AgentRunner` type, `LegacyClaudeRunner`, `createClaudeAgentRunner()`, `adaptClaudeRunnerToAgent()` contract를 추가한다.
3. fake executable 기반 Codex runner failing test를 추가한다.
4. `createCodexCliRunner()`를 구현한다.
5. prompt content failing test를 추가하고 `prompt-assembler.ts`를 구현한다.
6. success, no-change success, non-zero failure, exception-after-RUNNING, checkpoint commit failure run lifecycle test를 추가한다.
7. `runIssueWithAgent()`를 추출하고 `runIssueWithClaude()` wrapper를 유지한다.
8. checkpoint commit support와 metadata commit/artifact field를 추가한다.
9. CLI `--agent` parsing, `--mock-executor` conflict, dispatch test를 추가한다.
10. CLI backend selection을 구현한다.
11. approve fast-forward update test와 approve stale-target fixture를 추가한다.
12. approve lifecycle fix를 구현한다.
13. approve fast-forward failure output에 수동 진단/복구 안내와 rebase 예시를 추가한다.
14. stale RUNNING recovery와 `recover-run --reason` test를 추가한다.
15. `recover-run` command를 구현하고 failed/recovery output에 cleanup 절차 안내를 추가한다.
16. `scripts/eval-superpowers.ts`를 required checks non-zero gate로 갱신한다.
17. 전체 deterministic check를 실행한다.
18. local environment에 authenticated Codex CLI access가 있으면 Codex 성공, Codex 실패/timeout/no-change, legacy Claude 기본 실행 dogfood를 수행한다.

## 20. 미결정 사항

- issue frontmatter `executor`를 계속 free-form string으로 둘지, schema validation을 known backend name으로 좁힐지 결정해야 한다.
- checkpoint commit message에 Markdown frontmatter title을 쓸지 sanitized first heading을 쓸지 결정해야 한다.
- `--agent codex`에서 `--model`과 `--profile` pass-through를 MVP CLI에 허용할지, 첫 dogfood 성공 전까지 config-only로 둘지 결정해야 한다.
- `--ephemeral`을 모든 Codex run의 기본값으로 둘지, debug mode에서는 Codex session file persistence를 허용할지 결정해야 한다.

이 미결정 사항은 MVP를 막지 않는다. 보수적 기본값은 schema를 넓게 유지하고, issue title이 있으면 사용하고, model/profile은 runner option에만 두며, Codex는 ephemeral run을 기본값으로 하되 kanban-owned artifact를 보존하는 것이다.
