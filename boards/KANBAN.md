---
type: kanban
title: Mission Control
---

# 🎯 Mission Control

전체 워크스페이스 티켓 현황 대시보드입니다.

## Workspace 선택

- [[openclaw/SPACE-KANBAN|openclaw]]
- [[vibe-coding/SPACE-KANBAN|vibe-coding]]
- [[stocks/SPACE-KANBAN|stocks]]
- [[web/SPACE-KANBAN|web]]
- [[personal/SPACE-KANBAN|personal]]

---

## 📊 전체 현황

#+BEGIN_QUERY
{:title "Status Summary (All Workspaces)"
 :query [:find (count ?t) ?s
         :where
         [?t :block/properties ?p]
         [(get ?p :status) ?s]]
 :result-transform (fn [rows] (map (fn [[c s]] [s c]) rows))}
#+END_QUERY
