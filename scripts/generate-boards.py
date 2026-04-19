#!/usr/bin/env python3
import os

TEMPLATE = """---
type: kanban
workspace: {workspace}
---

# 📋 {workspace_title} Kanban

## 📊 현황

#+BEGIN_QUERY
{{:title "Status Summary"
 :query [:find (count ?t) ?s
         :where
         [?t :block/properties ?p]
         [(get ?p :workspace) "{workspace}"]
         [(get ?p :status) ?s]]
 :result-transform (fn [rows] (map (fn [[c s]] [s c]) rows))}}
#+END_QUERY

---

# 📋 Backlog

#+BEGIN_QUERY
{{:title "Backlog Tasks"
 :query [:find ?t ?id ?summary ?prio
         :where
         [?t :block/properties ?p]
         [(get ?p :workspace) "{workspace}"]
         [(get ?p :status) "Backlog"]
         [(get ?p :id) ?id]
         [(get ?p :summary) ?summary]
         [(get ?p :priority) ?prio]]
 :result-transform (fn [rows]
   (sort-by (fn [[_ _ _ prio]]
     (case prio
       "Blocker" 0 "Critical" 1 "High" 2
       "Medium" 3 "Low" 4 "Trivial" 5))
     rows))}}
#+END_QUERY

---

# 🚧 In Progress

#+BEGIN_QUERY
{{:title "In Progress Tasks"
 :query [:find ?t ?id ?summary ?prio
         :where
         [?t :block/properties ?p]
         [(get ?p :workspace) "{workspace}"]
         [(get ?p :status) "In Progress"]
         [(get ?p :id) ?id]
         [(get ?p :summary) ?summary]
         [(get ?p :priority) ?prio]]}}
#+END_QUERY

---

# 👀 In Review

#+BEGIN_QUERY
{{:title "In Review Tasks"
 :query [:find ?t ?id ?summary
         :where
         [?t :block/properties ?p]
         [(get ?p :workspace) "{workspace}"]
         [(get ?p :status) "In Review"]
         [(get ?p :id) ?id]
         [(get ?p :summary) ?summary]]}}
#+END_QUERY

---

# ✅ Done

#+BEGIN_QUERY
{{:title "Completed Tasks"
 :query [:find ?t ?id ?summary
         :where
         [?t :block/properties ?p]
         [(get ?p :workspace) "{workspace}"]
         [(get ?p :status) "Done"]
         [(get ?p :id) ?id]
         [(get ?p :summary) ?summary]]}}
#+END_QUERY

---

# 🚫 Blocked

#+BEGIN_QUERY
{{:title "Blocked Tasks"
 :query [:find ?t ?id ?summary
         :where
         [?t :block/properties ?p]
         [(get ?p :workspace) "{workspace}"]
         [(get ?p :status) "Blocked"]
         [(get ?p :id) ?id]
         [(get ?p :summary) ?summary]]}}
#+END_QUERY

---

# ❌ Cancelled

#+BEGIN_QUERY
{{:title "Cancelled Tasks"
 :query [:find ?t ?id ?summary
         :where
         [?t :block/properties ?p]
         [(get ?p :workspace) "{workspace}"]
         [(get ?p :status) "Cancelled"]
         [(get ?p :id) ?id]
         [(get ?p :summary) ?summary]]}}
#+END_QUERY
"""

WORKSPACES = {
    'openclaw': 'OpenClaw',
    'vibe-coding': 'Vibe Coding',
    'stocks': 'Stocks',
    'web': 'Web',
    'personal': 'Personal'
}

def main():
    boards_dir = 'boards'
    for ws, title in WORKSPACES.items():
        dir_path = os.path.join(boards_dir, ws)
        os.makedirs(dir_path, exist_ok=True)

        content = TEMPLATE.format(
            workspace=ws,
            workspace_title=title
        )

        filepath = os.path.join(dir_path, 'SPACE-KANBAN.md')
        with open(filepath, 'w') as f:
            f.write(content)
        print(f'Generated: {filepath}')

if __name__ == '__main__':
    main()
