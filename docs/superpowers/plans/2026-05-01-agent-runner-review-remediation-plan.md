# AgentRunner 리뷰 Remediation 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `runIssueWithAgent()`의 최종 상태 기록 split-brain 위험을 제거하고, `kanban run`의 `--agent` 출처를 raw argv가 아니라 parser contract로 전달한다.

**Architecture:** 변경은 두 개의 작은 TDD slice로 제한한다. 첫째, `REVIEW` metadata는 final issue write 성공 전에는 디스크에 publish하지 않도록 `runIssueWithAgent()`의 artifact 순서를 조정한다. 둘째, `parseRunArgs()`가 agent option의 출처를 구조화해서 `commandRun()`이 `args.includes('--agent')`에 의존하지 않게 한다.

**Tech Stack:** TypeScript 5.4, Vitest, pnpm workspaces, `superpowers:test-driven-development`, `superpowers:subagent-driven-development`, `superpowers:verification-before-completion`.

---

## 0. 플러그인/스킬 사용 계획

| 단계 | 사용할 plugin/skill | 사용 이유 |
| --- | --- | --- |
| 계획 작성 | `superpowers:receiving-code-review`, `superpowers:writing-plans` | 리뷰 항목을 그대로 수용하지 않고 코드 현실에 대조한 뒤 실행 가능한 계획으로 고정한다. |
| 외부 문서 확인 | `context7` | Node.js 또는 Codex CLI API 의미가 새로 필요해질 때만 사용한다. 이번 계획은 내부 ordering/parser 수정이라 필수 조회는 없다. |
| 구현 | `superpowers:test-driven-development` | production code 변경 전 실패하는 회귀 테스트를 먼저 작성하고 RED를 확인한다. |
| 구현 orchestration | `superpowers:subagent-driven-development` | task별 구현 subagent, spec review, code quality review 순서로 진행한다. |
| 품질 관점 | `code-simplifier` | P2 parser 변경에서 raw argv coupling을 줄이고 명시적인 contract를 유지한다. |
| 완료 검증 | `superpowers:verification-before-completion` | 완료 주장 전 fresh build/test/eval을 실행한다. |
| skill 승격 검토 | `superpowers:writing-skills` | 반복되는 AgentRunner remediation 절차를 skill로 승격할 필요가 있는지 마지막에만 검토한다. 이번 변경 자체에는 새 skill을 만들지 않는다. |

## 1. 리뷰 항목 매핑

| Finding | 우선순위 | 대응 Task | 완료 증거 |
| --- | --- | --- | --- |
| `runIssueWithAgent()`가 final issue write 전에 `REVIEW` metadata를 쓸 수 있음 | P1 | Task 1 | final issue write 실패 테스트에서 `run-1.json`이 생성되지 않음을 검증한다. metadata write 실패 기존 계약도 유지한다. |
| `commandRun()`이 `args.includes('--agent')`로 CLI 출처를 추론함 | P2 | Task 2 | `parseRunArgs()` 결과가 `cliAgent`를 포함하고, CLI-level backend precedence 테스트와 static grep에서 raw args heuristic 제거를 확인한다. |

## 2. 파일 구조

### 수정

- `packages/core/src/executor/run-issue.ts`
- `packages/core/tests/executor/run-issue.test.ts`
- `packages/cli/src/commands/run.ts`
- `packages/cli/tests/run-args.test.ts`
- `codex-eval-loop.md`

### 수정하지 않음

- `packages/core/src/executor/run-artifacts.ts`: redaction과 artifact path helper는 이번 finding의 직접 원인이 아니다.
- `packages/core/src/executor/codex-runner.ts`: Codex CLI invocation contract는 변경하지 않는다.
- `packages/cli/src/commands/approve.ts`, `abort.ts`, `retry.ts`: parser 중복 정리는 follow-up으로 남긴다.
- `scripts/eval-superpowers.ts`: 기존 required gate는 이번 두 finding을 간접 커버한다. 새 테스트와 `rg` static gate를 이번 slice의 직접 evidence로 사용하고, eval harness 변경은 YAGNI로 둔다.

## Task 1: final issue write 전 `REVIEW` metadata publish 차단

**사용 plugin/skill:** `superpowers:test-driven-development`, `superpowers:subagent-driven-development`, `superpowers:verification-before-completion`

**Files:**
- Modify: `packages/core/tests/executor/run-issue.test.ts`
- Modify: `packages/core/src/executor/run-issue.ts`

- [ ] **Step 1: 실패하는 회귀 테스트 추가**

`packages/core/tests/executor/run-issue.test.ts`의 기존 `does not append a REVIEW event when the final issue write fails` 테스트에 metadata artifact 검증을 추가한다.

추가할 assertion:

```ts
    const metadataPath = path.join(vaultRoot, 'runs', '2026-04-24', 'VC-001', 'run-1.json');
    await expect(fs.access(metadataPath)).rejects.toMatchObject({ code: 'ENOENT' });
```

의도:

- final issue write가 `status: REVIEW`에서 실패하면 `run-1.json`도 아직 publish되지 않아야 한다.
- `appendRunEvent`가 호출되지 않는 기존 검증은 유지한다.

- [ ] **Step 2: RED 확인**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/executor/run-issue.test.ts
```

Expected:

- 해당 테스트가 FAIL한다.
- 실패 이유는 `run-1.json`이 이미 존재하기 때문이다.

- [ ] **Step 3: 최소 구현**

`packages/core/src/executor/run-issue.ts`에서 initial artifact publish 순서를 바꾼다.

구현 규칙:

- `writeRunLog()`는 final issue write 전에도 허용한다. run log는 문제 진단 artifact이고 structured `outcome` source of truth가 아니다.
- `writeRunMetadata()`는 final issue write 성공 후에만 호출한다.
- initial log write 실패는 기존처럼 `outcome = 'FAILED'`로 수렴한다.
- final issue write 실패는 그대로 throw하여 caller가 실패를 보게 하되, 그 시점에는 `REVIEW` metadata와 event가 없어야 한다.
- final issue write 성공 후 `writeRunMetadata()`가 실패하면 기존 계약을 유지한다. 즉 `outcome = 'FAILED'`, issue status는 `FAILED`, 반환 `metadataPath`는 기본 metadata path, 실제 metadata file은 없어도 된다.
- metadata write 실패로 `FAILED` 재수렴할 때 같은 run의 `run -> REVIEW` issue log를 남기지 않는다. `appendLog()`는 기존 log를 지우지 않으므로, implementation은 final issue body를 쓰기 전 body snapshot을 보존하고 metadata failure rewrite 시 그 snapshot에 `FAILED` log만 append해야 한다.
- event append 실패 시 기존처럼 `outcome = 'FAILED'`로 바꾸고 log/metadata/issue/event를 best-effort로 재기록한다.

권장 코드 shape:

```ts
    try {
      logPath = await artifacts.writeRunLog(
        input.vaultRoot,
        date,
        metadata,
        formatRunLog(finalAgentResult, failureReason),
      );
      metadata = { ...metadata, logPath };
    } catch (error) {
      outcome = 'FAILED';
      failureReason = `Artifact writing failed: ${errorMessage(error)}`;
      metadata = { ...metadata, outcome, logPath };
      try {
        logPath = await artifacts.writeRunLog(
          input.vaultRoot,
          date,
          metadata,
          formatRunLog(finalAgentResult, failureReason),
        );
        metadata = { ...metadata, logPath };
      } catch {
        // Keep final issue convergence independent of log durability.
      }
    }

    const issueBeforeFinalState = await readIssueDocument(input.issuePath);
    await writeFinalIssueState(issueBeforeFinalState);
    try {
      metadataPath = await artifacts.writeRunMetadata(input.vaultRoot, date, metadata);
    } catch (error) {
      outcome = 'FAILED';
      failureReason = `Artifact writing failed: ${errorMessage(error)}`;
      metadata = { ...metadata, outcome, logPath };
      try {
        logPath = await artifacts.writeRunLog(
          input.vaultRoot,
          date,
          metadata,
          formatRunLog(finalAgentResult, failureReason),
        );
        metadata = { ...metadata, logPath };
      } catch {
        // The final issue log below records the metadata failure when log rewrite is unavailable.
      }
      await writeFinalIssueState(issueBeforeFinalState);
    }
```

주의:

- 위 snippet은 전체 코드가 아니라 ordering 의도다.
- `metadata.outcome`이 `outcome` 변경 후 stale되지 않도록 `metadata = { ...metadata, outcome, logPath }`를 명시한다.
- `metadataPath` default 값은 기존 `artifactPaths.metadataPath`를 유지한다.
- 기존 테스트 `moves RUNNING to FAILED when metadata writing fails while returning expected metadata path`가 계속 PASS해야 한다.
- 해당 기존 테스트에 `expect(updatedIssue).not.toContain('run -> REVIEW')`를 추가해 stale issue log가 남지 않음을 보장한다.

- [ ] **Step 4: GREEN 확인**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/executor/run-issue.test.ts
```

Expected:

- `run-issue.test.ts` 전체 PASS.

- [ ] **Step 5: 관련 regression 확인**

Run:

```bash
pnpm --filter @kanban-task-engine/core test -- tests/executor/run-issue.test.ts tests/executor/run-artifacts.test.ts tests/executor/claude-code-executor.test.ts
```

Expected:

- 모든 테스트 PASS.

## Task 2: `kanban run` parser에 agent source contract 추가

**사용 plugin/skill:** `superpowers:test-driven-development`, `code-simplifier`, `superpowers:subagent-driven-development`

**Files:**
- Modify: `packages/cli/tests/run-args.test.ts`
- Modify: `packages/cli/src/commands/run.ts`

- [ ] **Step 1: 실패하는 parser contract 테스트 추가**

`packages/cli/tests/run-args.test.ts`에서 `parseRunArgs()` 기대값에 `cliAgent`를 명시한다. `cliAgent`는 “CLI `--agent` override가 있었는가”만 나타낸다. default backend와 issue frontmatter executor 처리는 `resolveRunBackend()`가 계속 담당한다.

변경할 기대값 예시:

```ts
  it('defaults execute backend to claude-code', () => {
    expect(parseRunArgs(['VC-001', '--execute'])).toEqual({
      ok: true,
      mode: {
        kind: 'execute',
        issueId: 'VC-001',
        backend: 'claude-code',
        cliAgent: undefined,
        mockFail: false,
      },
    });
  });

  it('parses --execute --agent codex', () => {
    expect(parseRunArgs(['VC-001', '--execute', '--agent', 'codex'])).toEqual({
      ok: true,
      mode: {
        kind: 'execute',
        issueId: 'VC-001',
        backend: 'codex',
        cliAgent: 'codex',
        mockFail: false,
      },
    });
  });
```

`--mock-executor` 기대값은 다음처럼 둔다.

```ts
cliAgent: undefined
```

추가할 explicit CLI source 테스트:

```ts
  it('preserves explicit claude-code CLI source', () => {
    expect(parseRunArgs(['VC-001', '--execute', '--agent', 'claude-code'])).toEqual({
      ok: true,
      mode: {
        kind: 'execute',
        issueId: 'VC-001',
        backend: 'claude-code',
        cliAgent: 'claude-code',
        mockFail: false,
      },
    });
  });
```

- [ ] **Step 2: RED 확인**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- tests/run-args.test.ts
```

Expected:

- parser result에 `cliAgent`가 없어서 FAIL한다.

- [ ] **Step 3: backend precedence helper 회귀 테스트 추가**

`packages/cli/tests/run-args.test.ts`에 raw argv 없이 동작하는 순수 helper 테스트를 추가한다. real `--execute` CLI path는 `createNodeGitRunner()`와 real agent runner를 생성하므로 이 finding의 deterministic unit test로 쓰지 않는다.

추가할 import:

```ts
import { parseRunArgs, resolveExecuteBackend, resolveRunBackend } from '../src/commands/run';
```

추가할 테스트 1:

```ts
  it('resolves execute backend from issue executor when CLI agent is absent', () => {
    const parsed = parseRunArgs(['VC-001', '--execute']);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.mode.kind !== 'execute') return;

    expect(resolveExecuteBackend(parsed.mode, { executor: 'codex' })).toEqual({
      ok: true,
      backend: 'codex',
    });
  });
```

추가할 테스트 2:

```ts
  it('resolves execute backend from CLI agent before issue executor', () => {
    const parsed = parseRunArgs(['VC-001', '--execute', '--agent', 'claude-code']);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.mode.kind !== 'execute') return;

    expect(resolveExecuteBackend(parsed.mode, { executor: 'codex' })).toEqual({
      ok: true,
      backend: 'claude-code',
    });
  });
```

주의:

- `resolveExecuteBackend(mode, issue)`는 raw argv를 받지 않아야 한다.
- `commandRun()`은 이 helper를 호출해야 한다.

- [ ] **Step 4: CLI-level RED 확인**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- tests/index.test.ts tests/run-args.test.ts
! rg "args\\.includes\\('--agent'\\)" packages/cli/src/commands/run.ts
```

Expected:

- parser contract 또는 backend precedence test가 FAIL한다.
- static grep은 현재 `args.includes('--agent')` match 때문에 FAIL해야 한다. 이 RED를 확인한 뒤 구현한다.

- [ ] **Step 5: 최소 구현**

`packages/cli/src/commands/run.ts`에서 type과 parser를 수정한다.

구현 규칙:

- `RunMode` execute variant에 `cliAgent?: Exclude<AgentBackend, 'mock'>`를 추가한다.
- `parseRunArgs()`에서 `--agent`가 있었으면 `cliAgent`에 해당 backend를 담고, 없으면 `undefined`.
- `commandRun()`의 `resolveRunBackend()` 호출에서 `args.includes('--agent')`를 제거한다.
- mock backend는 `resolveRunBackend()`를 타지 않는 기존 구조를 유지한다.
- 필요하면 순수 helper `resolveExecuteBackend(mode, issue)`를 추가한다. 이 helper는 raw argv를 받지 않는다.

권장 코드 shape:

```ts
export type CliAgentBackend = Exclude<AgentBackend, 'mock'>;

export type RunMode =
  | { kind: 'inspect'; issueId: string }
  | { kind: 'execute'; issueId: string; backend: AgentBackend; cliAgent?: CliAgentBackend; mockFail: boolean };
```

```ts
export function resolveExecuteBackend(
  mode: Extract<RunMode, { kind: 'execute' }>,
  issue: { executor?: string },
): ResolveRunBackendResult {
  if (mode.backend === 'mock') {
    return { ok: true, backend: 'mock' };
  }
  return resolveRunBackend({
    cliAgent: mode.cliAgent,
    issueExecutor: issue.executor,
  });
}
```

```ts
      : resolveRunBackend({
        cliAgent: mode.cliAgent,
        issueExecutor: issue.executor,
      });
```

최종 구현에서는 위 direct `resolveRunBackend()` 호출 대신 `resolveExecuteBackend(mode, issue)`를 사용한다.

```ts
      backend: mockExecutor ? 'mock' : agent ?? 'claude-code',
      cliAgent: agent,
      mockFail,
```

- [ ] **Step 6: GREEN 확인**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- tests/run-args.test.ts
```

Expected:

- `run-args.test.ts` PASS.

- [ ] **Step 7: CLI regression 및 static heuristic 제거 확인**

Run:

```bash
pnpm --filter @kanban-task-engine/cli test -- tests/run-args.test.ts tests/index.test.ts
! rg "args\\.includes\\('--agent'\\)" packages/cli/src/commands/run.ts
```

Expected:

- CLI tests PASS.
- `rg` 명령은 match 없이 exit 1이어야 하며, 앞의 `!` 때문에 shell 전체는 exit 0이어야 한다.

## Task 3: 통합 검증 및 로그 갱신

**사용 plugin/skill:** `superpowers:verification-before-completion`, `superpowers:writing-skills`

**Files:**
- Modify: `codex-eval-loop.md`

- [ ] **Step 1: 전체 검증**

Run:

```bash
pnpm -r build
pnpm -r test
pnpm eval:superpowers:full
git diff --check
! rg "args\\.includes\\('--agent'\\)" packages/cli/src/commands/run.ts
```

Expected:

- 모든 명령 exit 0.
- `pnpm -r test`는 전체 테스트 수가 기존 315개보다 같거나 증가한다.
- `pnpm eval:superpowers:full`은 `Global overall: 100%`, `AgentRunner + Codex Target: 100%`, `Test gate: pass`를 출력한다.

- [ ] **Step 2: 작업 로그 추가**

검증이 통과한 뒤에만 `codex-eval-loop.md`에 다음 섹션을 추가한다. 통과하지 않은 명령은 PASS로 쓰지 않고 실제 실패를 기록한다.

```md
### Iteration 20 - Final Review Remediation

- 대상: `AgentRunner + Codex Target`.
- 병목: final issue write 실패 시 `REVIEW` metadata artifact가 먼저 publish될 수 있었고, CLI agent source가 raw argv heuristic에 묶여 있었다.
- 변경: `runIssueWithAgent()` metadata publish를 final issue write 이후로 미뤘고, `parseRunArgs()`에 `cliAgent` contract를 추가했다.
- RED: `run-issue.test.ts` metadata absence assertion, `run-args.test.ts` `cliAgent` expectation, CLI backend precedence/static heuristic check.
- GREEN: targeted core/CLI tests 통과.
- 회귀: `pnpm -r build`, `pnpm -r test`, `pnpm eval:superpowers:full`, `git diff --check`, raw argv heuristic `rg` check 통과.
```

- [ ] **Step 3: 로그 갱신 후 smoke 검증**

Run:

```bash
pnpm eval:superpowers
git diff --check
```

Expected:

- 모든 명령 exit 0.

- [ ] **Step 4: skill 승격 여부 확인**

이번 변경은 기존 AgentRunner remediation plan의 후속 slice이므로 새 skill은 만들지 않는다. 다만 같은 유형의 split-brain review가 반복되면 `superpowers:writing-skills`로 “artifact publication ordering review” skill 생성을 별도 이슈로 분리한다.

## 3. Subagent 실행 계획

`superpowers:subagent-driven-development` 기준으로 다음 순서로 진행한다.

1. Task 1 implementer subagent: `run-issue.test.ts` RED 추가, `run-issue.ts` GREEN 구현.
2. Task 1 spec reviewer subagent: P1 finding이 닫혔는지 확인.
3. Task 1 code quality reviewer subagent: ordering이 과도하게 복잡해지지 않았는지 확인.
4. Task 2 implementer subagent: `run-args.test.ts` RED 추가, static RED 확인, `run.ts` GREEN 구현.
5. Task 2 spec reviewer subagent: raw argv heuristic 제거와 parser contract 충족 확인.
6. Task 2 code quality reviewer subagent: `code-simplifier` 관점에서 type/readability 확인.
7. Final reviewer subagent: 전체 diff에서 P0/P1 blocker 재검토.

각 reviewer가 issue를 내면 같은 task implementer가 수정하고, 같은 reviewer의 re-review를 통과한 뒤에만 다음 task로 넘어간다.
Task 3은 subagent 구현 대상이 아니라 controller가 fresh verification을 실행한 뒤 실제 결과만 `codex-eval-loop.md`에 기록하는 단계다.

## 4. 완료 기준

- P1 metadata split-brain regression test가 RED -> GREEN으로 확인된다.
- P2 parser contract/backend precedence/static heuristic regression이 RED -> GREEN으로 확인된다.
- `args.includes('--agent')`가 `packages/cli/src/commands/run.ts`에서 제거된다.
- `writeRunMetadata()`는 `REVIEW` final issue write 성공 전에는 호출되지 않는다.
- 기존 metadata write failure 계약이 유지된다. `writeRunMetadata()` 실패 시 issue는 `FAILED`, 반환 `metadataPath`는 기본 path, metadata file은 없어도 된다.
- `pnpm -r build`, `pnpm -r test`, `pnpm eval:superpowers:full`, `git diff --check`가 fresh로 통과한다.
- `codex-eval-loop.md`에 iteration 결과가 한국어로 기록된다.
