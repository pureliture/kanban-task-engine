#!/usr/bin/env bash
# probe-acli-transitions.sh — M4 / P0-2·P0-3 read-only probe
#
# safe tenant에서 read 계정으로만 Jira transition·Confluence space.key를 실측한다.
# write/create/edit/delete는 절대 수행하지 않는다 (acli read 모드 BLOCKED_COMMANDS).
#
# 안전장치:
#   - 기본 비활성: PROBE_CONFIRM=yes 가 없으면 아무 호출도 하지 않고 종료.
#   - read 계정만 사용 (ATLASSIAN_READ_*). write 계정 미참조.
#   - acli-gateway.sh의 read 모드를 경유 (verb 차단 검증 포함).
#
# 사용:
#   ACLI_GATEWAY=~/Projects/routine-harness/.acli/acli-gateway.sh \
#   JIRA_KEY=WORK-1 SPACE_KEY=WORK PROBE_CONFIRM=yes \
#   bash scripts/probe-acli-transitions.sh

set -euo pipefail

ACLI_GATEWAY="${ACLI_GATEWAY:-$HOME/Projects/routine-harness/.acli/acli-gateway.sh}"
JIRA_KEY="${JIRA_KEY:-}"
SPACE_KEY="${SPACE_KEY:-}"

if [[ "${PROBE_CONFIRM:-}" != "yes" ]]; then
  cat <<'EOF'
[probe-acli-transitions] 비활성 상태 (안전 기본값).
  실행하려면: PROBE_CONFIRM=yes + JIRA_KEY=<key> [SPACE_KEY=<key>] 를 설정.
  read-only probe만 수행하며 어떤 write도 하지 않습니다.
  ✋ tenant 접근은 사용자 명시 승인 하에만 (M4 human-gate).
EOF
  exit 0
fi

if [[ ! -x "$ACLI_GATEWAY" ]]; then
  echo "✗ acli-gateway 없음/실행불가: $ACLI_GATEWAY" >&2
  exit 2
fi

echo "[probe] acli-gateway: $ACLI_GATEWAY (read 모드만)"

# 1) Jira transition 동적조회 가능성 — read 모드에서 view --json의 availableTransitions 파싱 시도.
if [[ -n "$JIRA_KEY" ]]; then
  echo "--- Jira transitions probe (read): $JIRA_KEY ---"
  # acli read 모드는 transition verb를 차단하므로 workitem view --json 경유.
  "$ACLI_GATEWAY" read jira workitem view "$JIRA_KEY" --json \
    || echo "⚠ workitem view 실패/미지원 — 출력 포맷·권한 확인 필요 (M4 finding)"
else
  echo "(JIRA_KEY 미설정 → Jira probe 생략)"
fi

# 2) Confluence space.key 실값 확인 (placeholder 해소).
if [[ -n "$SPACE_KEY" ]]; then
  echo "--- Confluence space probe (read): $SPACE_KEY ---"
  "$ACLI_GATEWAY" read confluence space view "$SPACE_KEY" \
    || echo "⚠ space view 실패/미지원 — REST read recipe 필요 여부 확인 (M4 finding)"
else
  echo "(SPACE_KEY 미설정 → Confluence probe 생략)"
fi

echo "[probe] 완료. 결과를 milestones.md M4 finding으로 기록할 것."
