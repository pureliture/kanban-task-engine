---
# === 필수 ===
id: TICKET-ID
status: Backlog
priority: Medium
issueType: Task
workspace: {{workspace}}

# === Jira 호환 ===
summary: "요약을 입력하세요"
assignee: 
reporter: 
labels: []

# === 분류 ===
project: 
components: []
sprint: 
storyPoints: 

# === Jira 동기화 (선택) ===
jira:
  issueType: "Task"
  customFields: {}

# === 자동화 ===
automation:
  workspace: {{workspace}}
  project: {{project}}
  useAcp: true
  triggerOnStatus: [In Progress]

# === 메타데이터 ===
created: {{created}}
updated: {{updated}}
completed:
---

# {{summary}}

#{labels...}

## 작업 내용

프롬프트 내용을 여기에 작성하세요.

## 체크리스트

- [ ] 항목 1
- [ ] 항목 2
