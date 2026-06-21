# Project: Architecture Defect Remediation

## Architecture
- `packages/core/src/executor/run-issue.ts`: Executor layer running agent workflows.
- `packages/core/src/runtime/workflow-engine.ts`: Business logic & policy guard orchestrating transitions.
- `packages/core/src/store/markdown-store.ts`: Pure filesystem interface and data persistence.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| 1 | R1: Executor's WorkflowEngine Integration | Refactor `run-issue.ts` to transition via `WorkflowEngine` rather than bypass | None | PLANNED |
| 2 | R2: MarkdownStore's Decoupling | Remove `policyEngine` from `markdown-store.ts` and use callback options | None | PLANNED |
| 3 | E2E & Validation | Run tests and CLI check | M1, M2 | PLANNED |

## Interface Contracts

### WorkflowEngine.transition Extension
- Input: `WorkflowTransitionInput` will be extended with:
  ```typescript
  frontmatterPatch?: Record<string, unknown>;
  customLogEntry?: string;
  ```
- behavior:
  - If `frontmatterPatch` is provided, merge it into new frontmatter.
  - If `customLogEntry` is provided, append it instead of standard transition log.

### MarkdownStore Decoupling
- Remove `PolicyEngine` dependency.
- Change `policyEngine` option to generic option callbacks:
  ```typescript
  onTransition?: (task: CanonicalTaskModel, transition: StateTransition) => Promise<void>;
  onParseError?: (error: Error, filePath: string) => void;
  ```

## Code Layout
- `packages/core/src/executor/run-issue.ts`
- `packages/core/src/runtime/workflow-engine.ts`
- `packages/core/src/store/markdown-store.ts`
- `packages/core/tests/` (unit and integration tests)
