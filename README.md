# kanban-task-engine

Environment-independent task synchronization and automation engine. Markdown issue files are the source of truth.

## What is this?

kanban-task-engine는 환경에 의존하지 않는 작업 동기화 및 자동화 엔진입니다. Markdown 이슈 파일을 사람이 읽을 수 있는 source of truth로 취급하고, 이를 canonical JSON으로 변환하여 다양한 외부 시스템과 통신합니다.

엔진 저장소 자체에는 실제 이슈 상태(live state)가 없습니다. 실제 상태는 별도의 Vault 저장소에 살아있으며, 엔진은 오직 로직과 규칙만 담당합니다.

## Architecture Overview

![Architecture Overview](docs/design/kanban-task-engine-one-page.svg)

<details>
<summary>Architecture Detail (Text Version)</summary>

- **Vault** (별도 Git 저장소): Markdown Issues (.md + YAML frontmatter), Boards & Templates, Recipes (.yaml)
- **Engine** (이 저장소): packages/core (Runtime, State Machine, Policy, Store, Executor), packages/schema (Frontmatter schema, Canonical JSON model), Adapters (openclaw, claude-code, jira, cli, github, firebase)
- **External Systems / Interfaces**: OpenClaw, Jira, GitHub, Firebase, CLI
- **데이터 흐름**: Vault Markdown → Engine Parser → Canonical JSON → Adapter → External System
- **모드**: recipe의 modules + policy 조합으로 결정되는 emergent property. 코드에 hardcoded switch 없음.
- **Canonical JSON**: 내부 contract. 사람이 직접 편집하는 surface가 아님.
</details>

## How it works

### Issue Lifecycle
이슈는 템플릿에서 생성되어 DRAFT → OPEN → IN_PROGRESS → DONE (또는 FAILED) 상태를 거칩니다. 각 상태 전이는 Markdown 파일의 YAML frontmatter를 통해 기록됩니다.

### Recipe → Execution Loop
Recipe YAML (`mode` label + `modules` + `policy`)를 통해 실행 환경이 구성됩니다. `claude-code-executor`는 별도의 worktree에서 작업을 수행하며, READY → RUNNING → REVIEW → DONE 상태 전이를 따릅니다.

### Work Scenario: Jira Export
Vault의 Markdown 이슈를 Engine이 파싱하고, `adapter-jira`를 통해 Jira API로 one-way export합니다. 기업 환경에서 별도의 Work Vault와 함께 사용됩니다.

## Key Concepts

| 개념 | 설명 |
|---|---|
| Markdown = SoT | `.md` 파일이 canonical JSON보다 상위의 source of truth |
| Vault ↔ Engine 분리 | Engine repo에는 live issue state 없음. 상태는 Vault에 |
| 모드는 emergent | recipe YAML의 module + policy 조합이 "모드"를 결정 |
| Canonical JSON | 내부 contract. engine과 adapter 간 데이터 교환 형식 |
| Worktree 기반 실행 | `claude-code-executor`가 별도 worktree에서 안전하게 작업 |

## Project Structure

```
packages/
├── core/          # Runtime, State Machine, Policy, Store, Executor
├── schema/        # Frontmatter schema, Canonical JSON model
├── adapter-claude-code/
├── adapter-cli/
├── adapter-firebase/
├── adapter-github/
├── adapter-jira/
└── adapter-openclaw/
```

## Getting Started

```bash
# Clone
git clone <repo-url>
cd kanban-task-engine

# Install dependencies
# (프로젝트별 설치 방법 — package manager에 따라 다름)

# CLI 사용
kanban run --recipe <recipe-name>
kanban sync
```

## Documentation

- [Architecture Design Spec](docs/superpowers/specs/2026-04-23-kanban-control-plane-design.md)
- [Runtime Overview](docs/kanban-runtime.md)
- [Design Assets](docs/design/)

---

*Generated on 2026-05-02. See [docs/design/](docs/design/) for diagram source and modification guide.*
