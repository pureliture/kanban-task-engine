#!/usr/bin/env bash
# publish-github-projects.sh — kanban .md → GitHub Projects v2 칸반 발행 (Jira 대체 테스트)
#
# Confluence 스킵, Jira 대신 GitHub Projects 칸반으로 발행 검증. 기존 본인 project
# (AI-Harness-Construct)에 draft item 카드로 생성 → 공개 repo issue 오염 0,
# 되돌리기는 카드 삭제로 간단.
#
# 안전: 기본 dryRun. 실제 발행은 --no-dry-run.
# 사용: bash scripts/publish-github-projects.sh [--no-dry-run]

set -euo pipefail

OWNER=pureliture
PROJECT_NUMBER=3
PROJECT_ID=PVT_kwHOA6302M4BT5fA
STATUS_FIELD_ID=PVTSSF_lAHOA6302M4BT5fAzhBFN48
DIR=/Users/ddalkak/.openclaw/workspace-kanban/kanban/issues/vibe-coding/kanban-task-engine
FILES=(VBC-board-sync-002.md VBC-home-recipe-003.md VBC-obsidian-kanban-board-001.md)

# AI-Harness-Construct Status 옵션 실측(optionId). Blocked 옵션 부재 → FAILED 는 In Review 폴백.
declare -A OPT=( [Backlog]=a490720c [Ready]=8fc165d1 ["In Progress"]=68368c4f ["In Review"]=961ca78f [Done]=b36b62fa )
status_to_opt() {
  case "$1" in
    TODO) echo Backlog ;;
    READY) echo Ready ;;
    RUNNING) echo "In Progress" ;;
    REVIEW) echo "In Review" ;;
    DONE) echo Done ;;
    FAILED) echo "In Review" ;;
    *) echo Backlog ;;
  esac
}

fm() { grep "^$2:" "$1" | head -1 | sed "s/^$2:[[:space:]]*//"; }

DRY=1
[[ "${1:-}" == "--no-dry-run" ]] && DRY=0
[[ $DRY -eq 1 ]] && echo "=== dryRun (실제 발행 없음). 실행: --no-dry-run ===" || echo "=== LIVE 발행 → $OWNER project #$PROJECT_NUMBER ==="

for f in "${FILES[@]}"; do
  file="$DIR/$f"
  title=$(fm "$file" title)
  status=$(fm "$file" status)
  kid=$(fm "$file" id)
  prio=$(fm "$file" priority)
  optname=$(status_to_opt "$status")
  optid=${OPT[$optname]}
  # body 패턴은 adapter-github canonicalToGithubDraft / parseKanbanIdFromBody 와 통일(kanban-id:)
  body="kanban-id: $kid | type: task | priority: $prio | status: $status->$optname | atlassian-porting M-github"
  echo "▸ $kid | $status → $optname ($optid)"
  if [[ $DRY -eq 1 ]]; then
    echo "   [dryRun] draft title='$title'"
    continue
  fi
  itemid=$(gh project item-create "$PROJECT_NUMBER" --owner "$OWNER" --title "$title" --body "$body" --format json --jq '.id')
  gh project item-edit --id "$itemid" --field-id "$STATUS_FIELD_ID" --project-id "$PROJECT_ID" --single-select-option-id "$optid" >/dev/null
  echo "   created draft + status set: item=$itemid"
done
echo "완료."
