# Codex 평가 루프

이 문서는 `kanban-task-engine`의 Superpowers 구현 루프와 `AgentRunner`/`Codex` 실행 대상 보강 작업을 추적하는 실행 로그다. 자연어는 한국어로 유지하고, 명령어·파일 경로·API 이름은 원문을 유지한다.

## 하네스 범위

`pnpm eval:superpowers`는 이 저장소에 점수화된 eval 또는 LLM judge 명령이 없어서 추가한 경량 결정론적 하네스다. 현재 하네스는 다음 구현 영역의 정적 acceptance 신호를 측정한다.

1. `Spec Reconciliation`
2. `Schema Migration`
3. `Automation Runtime`
4. `Boards, Work Adapter, Cleanup`
5. `Worktree Execution + CLI`
6. `AgentRunner + Codex Target`

이 하네스는 Vitest나 TypeScript 빌드를 대신하지 않는다. 결정론적 검증은 계속 `pnpm -r build`, `pnpm -r test`, 관련 패키지별 Vitest 명령으로 수행한다. LLM judge는 repo-local 명령이나 인증 정보가 없어서 현재 `n/a`로 기록한다.

## 기준선

### 2026-04-24 초기 기준선

- 프로젝트 내 `AGENTS.md`는 발견되지 않았다. 이후 사용자가 제공한 전역 정책을 따른다.
- 의존 순서: `Spec Reconciliation -> Schema Migration -> Worktree Execution + CLI`.
- `Automation Runtime`, `Boards, Work Adapter, Cleanup`은 이미 구현된 통합 커버리지로 사용했다.
- `LLM judge`는 repo-local 명령과 credential이 없어 실행 불가였다.

| 항목 | 명령 | 결과 |
| --- | --- | --- |
| 전체 빌드 | `pnpm -r build` | PASS |
| 전체 테스트 | `pnpm -r test` | PASS, 177 tests |
| Schema local | `pnpm --filter @kanban-task-engine/schema test -- tests/issue-schema.test.ts` | PASS |
| Core mapping local | `pnpm --filter @kanban-task-engine/core test -- tests/mapper.test.ts` | PASS |
| Runtime local | `pnpm --filter @kanban-task-engine/core test -- tests/module-runner.test.ts tests/recipe-loader.test.ts tests/home-execution-flow.test.ts tests/audit-log-module.test.ts tests/git-checkpoint-module.test.ts` | PASS |
| Board local | `pnpm --filter @kanban-task-engine/core test -- tests/board-generator.test.ts` | PASS |
| Jira local | `pnpm --filter @kanban-task-engine/adapter-jira test` | PASS |
| LLM judge | 없음 | BLOCKED |

초기 하네스 점수:

| 지표 | 점수 |
| --- | ---: |
| Global overall | 65% |
| Deterministic score | 71% |
| Plan progress score | 40% |
| LLM judge average | n/a |

## AgentRunner/Codex 근거 확인

- Context7로 Node.js `child_process.spawn` 문서 조회를 시도했지만 `monthly quota exceeded`로 사용할 수 없었다.
- OpenAI Codex CLI 공식 문서 기준으로 `codex exec`는 scripted/CI-style non-interactive 실행에 맞는 진입점이다.
- Codex runner 설계에는 `--json`, `-C`, `--sandbox`, `-c key=value`, `--output-last-message`, stdin prompt `-`가 필요하다.
- Node.js 공식 문서 기준으로 `child_process.spawn(command, args, options)`는 args array를 지원하고, `shell` 기본값은 `false`이며, `detached: true`는 non-Windows에서 새 process group/session을 만들 수 있다.

## 반복 로그

### Iteration 1 - Spec Reconciliation

- 대상: `Spec Reconciliation`.
- 병목: authoritative Markdown issue schema에 deprecated Work/Jira 필드가 남아 있었다.
- 변경: `syncTarget`, `jiraProject`, schema-level `jiraKey`를 §8 frontmatter 예시와 optional field 목록에서 제거했다.
- eval 명령: `pnpm eval:superpowers`.
- 점수: Spec 75% -> 100%, global overall 65% -> 69%.
- 산출물 확인: Markdown spec §8을 직접 확인했다.
- 회귀: 코드 동작 변경 없음.

### Iteration 2 - Schema Migration

- 대상: `Schema Migration`.
- 병목: code가 deprecated Work/Jira field와 legacy `issueType` fallback을 계속 허용했다.
- 변경: `IssueFrontmatter`에서 deprecated field 제거, validation error 추가, mapper fallback 제거, write-back 허용 필드 보강.
- eval 명령: `pnpm --filter @kanban-task-engine/schema test`, `pnpm --filter @kanban-task-engine/core test`, `pnpm --filter @kanban-task-engine/adapter-firebase test`, `pnpm eval:superpowers`, `pnpm -r build`, `pnpm -r test`.
- 점수: Schema 67% -> 100%, global overall 69% -> 74%.
- 회귀: 전체 build/test 통과.

### Iteration 3 - Worktree/CLI Registry Foundation

- 대상: `Worktree Execution + CLI`.
- 병목: CLI/executor 계층에 registry parser와 sequence allocator가 없었다.
- 변경: `packages/core/src/store/registry.ts`, `packages/core/src/store/sequence.ts`, tests, exports 추가.
- eval 명령: `pnpm --filter @kanban-task-engine/core test`, `pnpm --filter @kanban-task-engine/core build`, `pnpm eval:superpowers`.
- 점수: Worktree/CLI 13% -> 38%, global overall 74% -> 78%.
- 회귀: core build/test 통과.

### Iteration 4 - Executor Primitives

- 대상: `Worktree Execution + CLI`.
- 병목: git/worktree/lock/run artifact contract가 없었다.
- 변경: mockable git helper, worktree helper, execution lock, run artifact writer, tests, `execa` dependency를 추가했다.
- eval 명령: `pnpm --filter @kanban-task-engine/core test`, `pnpm --filter @kanban-task-engine/core build`, `pnpm eval:superpowers`.
- 점수: Worktree/CLI 38% -> 75%, deterministic 95%.
- 회귀: core build/test 통과.

### Iteration 5 - CLI Package

- 대상: `Worktree Execution + CLI`.
- 병목: `packages/cli`와 command module이 없었다.
- 변경: `run`, `next`, `approve`, `abort`, `retry`, `sync`, `board` command를 가진 최소 CLI 패키지를 추가했다.
- eval 명령: `pnpm --filter @kanban-task-engine/cli test`, `pnpm --filter @kanban-task-engine/cli build`, `pnpm eval:superpowers`, `pnpm -r build`, `pnpm -r test`, `node packages/cli/dist/bin.js --help`.
- 점수: Worktree/CLI 75% -> 100%, global overall 100%.
- 산출물 확인: built CLI help와 `packages/cli/dist`를 직접 확인했다.
- 회귀: ESM import 문제를 dist 실행으로 발견해 수정했다.

### Iteration 6 - Vault-Backed CLI

- 대상: `Worktree Execution + CLI`.
- 병목: CLI command가 placeholder만 반환했다.
- 변경: `KANBAN_HOME`, `registry.yaml`, issue Markdown을 읽는 `packages/cli/src/vault.ts`를 추가하고 `next`, `run`, `sync`, `board`를 vault-backed로 연결했다.
- eval 명령: `pnpm --filter @kanban-task-engine/cli test`, `pnpm --filter @kanban-task-engine/cli build`, built CLI fixture 실행, `pnpm -r build`, `pnpm -r test`, `pnpm eval:superpowers`.
- 점수: Worktree/CLI 100% 유지, 정적 check 8/8 -> 10/10.
- 산출물 확인: temporary vault에서 built CLI `next`, `sync`, `run`, `board` 출력 확인.

### Iteration 7 - Mock Executor Lifecycle

- 대상: `Worktree Execution + CLI`.
- 병목: `kanban run`이 state transition과 run artifact를 만들지 않았다.
- 변경: injectable `GitRunner`/`ClaudeRunner` 기반 mock executor lifecycle을 추가했다. `READY -> RUNNING -> REVIEW/FAILED`, prompt, log, metadata, event artifact를 검증했다.
- eval 명령: core executor test, core build, CLI test/build, direct built CLI `run VC-001 --mock-executor`, `pnpm -r build`, `pnpm -r test`, `pnpm eval:superpowers`.
- 점수: Worktree/CLI 100% 유지, 정적 check 10/10 -> 11/11.
- 산출물 확인: temporary vault에서 issue status가 `REVIEW`로 바뀌고 `run-1.log`, `run-1.json`이 생성됨을 확인했다.

### Iteration 8 - Explicit Real Run Path

- 대상: `Worktree Execution + CLI`.
- 병목: 실제 git/Claude 실행 경로가 없었다.
- 변경: `kanban run <id> --execute`를 `createNodeGitRunner()`와 `createClaudeCliRunner()`로 연결했다. 기본 실행은 inspect-only로 유지했다.
- eval 명령: core build, CLI build, `pnpm -r build`, `pnpm -r test`, `pnpm eval:superpowers`.
- 점수: Worktree/CLI 100% 유지, 정적 check 11/11 -> 12/12.
- 회귀: real `--execute`는 실제 target git repo와 authenticated `claude` CLI가 필요하므로 환경 의존으로 남겼다.

### Iteration 9 - Real Git Lifecycle

- 대상: `Worktree Execution + CLI`.
- 병목: `approve`, `abort --discard`, `retry`가 mock-git 전용이었다.
- 변경: real git lifecycle helper와 CLI wiring을 추가했다. `approve`는 ff-only merge 후 cleanup, `abort --discard`는 이미 upstream에 포함된 branch만 제거, `retry`는 강제 cleanup 후 `READY`로 되돌린다.
- eval 명령: core build, CLI test, `pnpm -r build`, `pnpm -r test`, `pnpm eval:superpowers`.
- 점수: Worktree/CLI 100% 유지, 정적 check 12/12 -> 13/13.
- 산출물 확인: temporary real git repo/vault에서 `approve VC-001`가 `DONE`에 도달하고 branch/worktree cleanup 및 file merge를 확인했다.

### Iteration 10 - AgentRunner/Codex Eval Gate

- 대상: `AgentRunner + Codex Target`.
- 병목: 기존 eval이 AgentRunner/Codex coverage 없이도 100%로 종료될 수 있었다.
- 변경: required `agent-runner-codex` eval group을 추가하고 required check 실패 시 non-zero exit이 되게 했다.
- eval 명령: `pnpm --silent eval:superpowers --json`, `pnpm eval:superpowers --json`, `pnpm -r build`.
- 점수: false-positive global 100% -> required group 0/11, global overall 83%, exit 1.
- 산출물 확인: JSON eval output에서 `required: true`와 exit 1을 확인했다.

### Iteration 11 - Legacy Claude API Guard

- 대상: `AgentRunner + Codex Target`.
- 병목: `AgentRunner` 도입이 기존 `ClaudeRunner.run(promptPath, cwd)` public API를 깨뜨릴 위험이 있었다.
- 변경: `AgentRunner`, `LegacyClaudeRunner`, `adaptClaudeRunnerToAgent()`를 추가하고 `createClaudeCliRunner()`는 legacy two-argument runner를 유지했다.
- eval 명령: `pnpm --filter @kanban-task-engine/core test -- tests/executor/claude-code-executor.test.ts`, core build, JSON eval.
- 점수: AgentRunner/Codex 0/11 -> 1/11, global overall 85%.
- 회귀: 없음.

### Iteration 12 - Safe Agent Process

- 대상: `AgentRunner + Codex Target`.
- 병목: Codex/Claude 실행에 shell injection, env leakage, zombie child, stdin race 위험이 있었다.
- 변경: `spawnAgentProcess()`와 `buildAgentEnv()`를 추가했다. `shell: false`, args array, env allowlist, process group timeout kill, command redaction, stdin error handling을 테스트했다.
- eval 명령: `pnpm --filter @kanban-task-engine/core test -- tests/executor/agent-process.test.ts`, core build, JSON eval.
- 점수: AgentRunner/Codex 1/11 -> 2/11.
- 회귀: stdin `EPIPE` 위험을 추가 테스트로 보강했다.

### Iteration 13 - Redaction And Artifact Split

- 대상: `AgentRunner + Codex Target`.
- 병목: runner output과 metadata에 raw/redacted artifact boundary가 필요했다.
- 변경: `redactSecrets()`, `.ndjson`, `.log`, `.last-message.md`, `.json` artifact 분리, metadata recursive redaction, issue markdown run-log summary redaction을 추가했다.
- eval 명령: redaction/run-artifacts/agent-process/claude executor focused tests, core build, JSON eval.
- 점수: AgentRunner/Codex 2/11 -> 4/11, global overall 89%.
- 회귀: issue markdown `## 로그` secret leak 가능성을 회귀 테스트로 닫았다.

### Iteration 14 - Generic Run Lifecycle And Checkpoint

- 대상: `AgentRunner + Codex Target`.
- 병목: agent exit 0만으로 `REVIEW`를 쓰면 file change와 checkpoint commit 성공이 증명되지 않았다.
- 변경: `runIssueWithAgent()`, `revParse()`, `addAll()`, explicit-author `commitAll()`을 추가했다. 성공 조건은 file changes, `git add`, checkpoint commit, `HEAD` advancement로 강화했다.
- eval 명령: `run-issue`, `git`, `claude-code-executor`, CLI focused tests, core build, JSON eval.
- 점수: AgentRunner/Codex 4/11 -> 6/11, global overall 93%.
- 회귀: mock git runner가 새 checkpoint contract를 만족하도록 수정했다.

### Iteration 15 - Run Command Parser

- 대상: `AgentRunner + Codex Target`.
- 병목: `kanban run`이 boolean flag set만 사용해서 `--agent codex`와 conflict를 안전하게 처리하지 못했다.
- 변경: `parseRunArgs()`를 추가하고 inspect/execute mode, backend selection, `--agent` value, conflict를 parser 단계에서 검증했다.
- eval 명령: `pnpm --filter @kanban-task-engine/cli test -- tests/run-args.test.ts`, CLI test/build, JSON eval.
- 점수: AgentRunner/Codex 6/11 -> 7/11, global overall 94%.
- 회귀: 없음.

### Iteration 16 - Execution Target And Approve Safety

- 대상: `AgentRunner + Codex Target`.
- 병목: `run --execute`와 git lifecycle에 shared execution target contract가 필요했고, `approve`가 stale target을 merge할 위험이 있었다.
- 변경: `resolveExecutionTarget()`을 추가하고 `working_dir`, `merge_into`, default branch fallback을 검증했다. `approve`는 fetch, checkout, fast-forward target update 후 kanban branch를 merge한다.
- eval 명령: execution-target focused test, CLI test/build, `pnpm -r build`, JSON eval.
- 점수: AgentRunner/Codex 7/11 -> 8/11, global overall 96%.
- 회귀: `--mock-executor` default branch lookup 누락을 fixture로 찾아 수정했다.

### Iteration 17 - Codex Runner And Recovery

- 대상: `AgentRunner + Codex Target`.
- 병목: `kanban run <id> --execute --agent codex`가 실제 Codex backend로 dispatch되지 않았고 stale `RUNNING` recovery가 없었다.
- 변경: `createCodexCliRunner()`를 추가하고 `codex exec - -C <cwd> --sandbox workspace-write -c approval_policy=never --json --color never --ephemeral --output-last-message <path>` 형태로 실행한다. `recover-run <id>`도 추가했다.
- eval 명령: codex-runner/prompt-assembler/run-issue focused tests, CLI tests, `pnpm -r build`, `pnpm -r test`, `pnpm eval:superpowers`.
- 점수: AgentRunner/Codex 8/11 -> 11/11, global overall 100%.
- 산출물 확인: fake `codex` executable smoke로 `outcome: REVIEW`, `.ndjson`, `.log`, `.last-message.md`, `.json`, event JSONL, checkpoint commit을 확인했다.

### Iteration 18 - Timeout Race Hardening

- 대상: `AgentRunner + Codex Target`.
- 병목: timeout handling이 child/process group 종료 전에 execution lock을 풀 수 있었다.
- 변경: timeout flow를 `SIGTERM -> grace -> SIGKILL -> close` 상태 머신으로 강화했다. close-before-grace, stdin-error-after-timeout, child-error-after-timeout regression test를 추가했다.
- eval 명령: agent-process focused test, AgentRunner/Codex focused tests, CLI focused tests, `pnpm -r build`, `pnpm -r test`, `pnpm eval:superpowers`, fake Codex artifact smoke.
- 점수: global overall 100%, AgentRunner/Codex 11/11 유지.
- 산출물 확인: fake Codex smoke root에서 redacted artifacts와 checkpoint output을 직접 확인했다.

### Iteration 19 - Review Remediation Hardening

- 대상: `AgentRunner + Codex Target`.
- 병목: 다중 리뷰에서 CLI unknown flag, safe Claude backend, stdin error race, redaction coverage, event redaction, final issue write ordering, pid-aware recovery, idempotent cleanup, Codex config quoting 문제가 추가로 발견됐다.
- 변경:
  - `approve`, `abort`, `retry`가 unknown option과 extra positional argument를 mutation 전에 거부하도록 parser를 추가했다.
  - `createClaudeCliRunner()`가 직접 `child_process.spawn`을 호출하지 않고 `spawnAgentProcess()`를 사용하도록 바꿨다.
  - non-timeout stdin error는 즉시 resolve하지 않고 child close까지 기다리게 했다.
  - env allowlist에 `LANG`, `LC_ALL`, `LC_CTYPE`, `TERM`, `TZ`, `LOGNAME`을 추가했다.
  - `redactSecrets()`가 Bearer/JWT/generic secret/provider token/PEM private key를 처리하도록 확장했다.
  - `appendRunEvent()`도 recursive redaction을 거치게 했다.
  - final issue write가 실패하면 `REVIEW` event를 먼저 남기지 않도록 `runIssueWithAgent()`의 final state/event 순서를 바꿨다.
  - `recover-run`이 `process.kill(pid, 0)`으로 recorded pid liveness를 확인하도록 바꿨다.
  - `cleanupKanbanWorktree()`와 `abort --discard`를 worktree/branch가 이미 사라진 경우에도 멱등적으로 동작하게 했다.
  - Codex config 인자를 `approval_policy="never"`에서 `approval_policy=never`로 수정했고, 빈/누락 prompt를 spawn 전에 실패 결과로 반환하게 했다.
  - `scripts/eval-superpowers.ts`의 `agent-runner-codex` required group을 21개 check로 강화했다.
- eval 명령:
  - `pnpm --filter @kanban-task-engine/core test -- tests/executor/run-issue.test.ts`
  - `pnpm --filter @kanban-task-engine/core test -- tests/executor/agent-process.test.ts tests/executor/claude-code-executor.test.ts tests/executor/redaction.test.ts tests/executor/run-artifacts.test.ts tests/executor/worktree.test.ts tests/executor/run-issue.test.ts`
  - `pnpm --filter @kanban-task-engine/core test -- tests/executor/agent-process.test.ts tests/executor/codex-runner.test.ts tests/executor/redaction.test.ts`
  - `pnpm --filter @kanban-task-engine/core build`
  - `pnpm --filter @kanban-task-engine/cli test -- tests/index.test.ts tests/run-args.test.ts`
  - `pnpm --silent eval:superpowers --json`
  - `pnpm -r build`
  - `pnpm -r test`
  - `pnpm eval:superpowers`
  - fake Codex artifact smoke
- 점수: AgentRunner/Codex required group 11/11 -> 21/21, global overall 100% 유지.
- 산출물 확인:
  - eval JSON에서 required group 21/21과 exit 0을 확인했다.
  - fake Codex smoke root `/var/folders/hl/dnj2cl9151g8_bk7c59w_7200000gp/T/kanban-codex-smoke-AqSPFJ`를 직접 열어 `run-1.json`, `run-1.log`, `run-1.ndjson`, `run-1.last-message.md`, `events/2026-04-30.jsonl`, issue markdown log, checkpoint commit을 확인했다.
- 회귀: focused tests, 전체 build, 전체 test, eval, fake Codex smoke 기준 회귀 없음.

## Manual Dogfood Gate

### Codex 성공 게이트

```bash
kanban run <real-issue-id> --execute --agent codex
kanban approve <real-issue-id>
```

필수 증거:

- issue status history가 `READY -> RUNNING -> REVIEW -> DONE`을 보여야 한다.
- metadata에 `backend: codex`, `baseCommit`, `headCommit`, exit code, artifact path가 기록되어야 한다.
- `runs/<date>/<issue-id>/run-<n>.ndjson`, `.log`, `.last-message.md`, `.json`이 존재해야 한다.
- target repo에 engine이 만든 checkpoint commit이 있어야 한다.
- `approve`가 merge target을 refresh하고 ff-only merge 후 worktree/branch를 제거해야 한다.

현재 상태: `PENDING`. 이 환경에서 authenticated real `codex` runtime availability가 확립되지 않았다.

### Codex 실패 게이트

```bash
kanban run <failing-issue-id> --execute --agent codex
kanban recover-run <failing-issue-id> --reason "dogfood failure recovery"
```

필수 증거:

- agent failure, timeout, 또는 no-change 성공 중 하나를 의도적으로 발생시킨다.
- 최종 issue state는 `FAILED`여야 하며 `REVIEW`가 아니어야 한다.
- raw `.ndjson`과 redacted `.log`, `.last-message.md`, `.json`이 분리되어야 한다.
- log, metadata, event JSONL, issue markdown에 plaintext secret이 없어야 한다.
- `recover-run`은 worktree/branch를 보존하고 artifact path와 `kanban retry <id>` 또는 `kanban abort <id> --discard` 안내를 출력해야 한다.

현재 상태: `PENDING`. fake Codex smoke는 dispatch, artifact, redaction, checkpoint, failure convergence를 결정론적으로 검증하지만 live negative gate를 대체하지 않는다.

### Legacy Claude 게이트

```bash
kanban run <legacy-issue-id> --execute
kanban approve <legacy-issue-id>
```

필수 증거:

- `--agent` 생략 시 backend가 `claude-code`여야 한다.
- issue status history가 `READY -> RUNNING -> REVIEW -> DONE`을 보여야 한다.
- metadata와 event JSONL에 `backend: claude-code`가 기록되어야 한다.
- `approve`가 `DONE`에 도달하고 worktree/branch를 정리해야 한다.

현재 상태: `PENDING`. 이 환경에서 live Claude CLI/auth/runtime availability가 확립되지 않았다.

## 현재 최고 점수

| 지표 | 점수 |
| --- | ---: |
| Global overall | 100% |
| Deterministic score | 100% |
| Plan progress score | 50% |
| LLM judge average | n/a |

| 영역 | 점수 | Plan progress |
| --- | ---: | ---: |
| Spec Reconciliation | 100% | 0% |
| Schema Migration | 100% | 0% |
| Automation Runtime | 100% | 100% |
| Boards, Work Adapter, Cleanup | 100% | 100% |
| Worktree Execution + CLI | 100% | 2% |
| AgentRunner + Codex Target | 100% | 100% |

## 결정론적 확인

- `pnpm --filter @kanban-task-engine/core test -- tests/executor/run-issue.test.ts`: PASS, 199 core tests
- `pnpm --filter @kanban-task-engine/core test -- tests/executor/agent-process.test.ts tests/executor/claude-code-executor.test.ts tests/executor/redaction.test.ts tests/executor/run-artifacts.test.ts tests/executor/worktree.test.ts tests/executor/run-issue.test.ts`: PASS, 199 core tests
- `pnpm --filter @kanban-task-engine/core test -- tests/executor/agent-process.test.ts tests/executor/codex-runner.test.ts tests/executor/redaction.test.ts`: PASS, 202 core tests
- `pnpm --filter @kanban-task-engine/core test -- tests/executor/agent-process.test.ts tests/executor/codex-runner.test.ts tests/executor/claude-code-executor.test.ts tests/executor/redaction.test.ts tests/executor/run-artifacts.test.ts tests/executor/worktree.test.ts tests/executor/run-issue.test.ts`: PASS, 203 core tests
- `pnpm --filter @kanban-task-engine/core build`: PASS
- `pnpm --filter @kanban-task-engine/cli test -- tests/index.test.ts tests/run-args.test.ts`: PASS, 45 CLI tests
- `pnpm --silent eval:superpowers --json`: PASS, global overall 100%, AgentRunner/Codex 21/21
- `pnpm -r build`: PASS
- `pnpm -r test`: PASS, 313 tests
- `pnpm eval:superpowers`: PASS, global overall 100%, AgentRunner/Codex 21/21
- fake Codex artifact smoke: PASS, `READY -> RUNNING -> REVIEW`, backend `codex`, checkpoint `4bfa9cf -> b7a2c0a`, `.ndjson`/`.log`/`.last-message.md` redaction 확인

## 알려진 blocker / 비적용 점수

- LLM judge: `n/a`. repo-local LLM judge command 또는 credential이 없다.
- real Codex dogfood: 이 환경에서 authenticated real `codex` binary로 실행하지 않았다.
- real Claude dogfood: 이 환경에서 authenticated real `claude` CLI로 실행하지 않았다.
- `pnpm -r lint`: workspace에 lint script는 있으나 `eslint`가 설치/구성되어 있지 않아 별도 setup 전에는 blocker로 남는다.
