---
type: kanban
workspace: openclaw
---

# 📋 openclaw Kanban

## 📊 현황

#+BEGIN_QUERY
{:title "Status Summary"
 :query [:find (count ?t) ?s
         :where
         [?t :block/properties ?p]
         [(get ?p :workspace) "openclaw"]
         [(get ?p :status) ?s]]
 :result-transform (fn [rows] (map (fn [[c s]] [s c]) rows))}
#+END_QUERY

---

# 📋 Backlog

#+BEGIN_QUERY
{:title "Backlog Tasks"
 :query [:find ?t ?id ?summary ?prio
         :where
         [?t :block/properties ?p]
         [(get ?p :workspace) "openclaw"]
         [(get ?p :status) "Backlog"]
         [(get ?p :id) ?id]
         [(get ?p :summary) ?summary]
         [(get ?p :priority) ?prio]]
 :result-transform (fn [rows]
   (sort-by (fn [[_ _ _ prio]]
     (case prio
       "Blocker" 0 "Critical" 1 "High" 2
       "Medium" 3 "Low" 4 "Trivial" 5))
     rows))}
#+END_QUERY

---

# 🚧 In Progress

#+BEGIN_QUERY
{:title "In Progress Tasks"
 :query [:find ?t ?id ?summary ?prio
         :where
         [?t :block/properties ?p]
         [(get ?p :workspace) "openclaw"]
         [(get ?p :status) "In Progress"]
         [(get ?p :id) ?id]
         [(get ?p :summary) ?summary]
         [(get ?p :priority) ?prio]]}
#+END_QUERY

---

# 👀 In Review

#+BEGIN_QUERY
{:title "In Review Tasks"
 :query [:find ?t ?id ?summary
         :where
         [?t :block/properties ?p]
         [(get ?p :workspace) "openclaw"]
         [(get ?p :status) "In Review"]
         [(get ?p :id) ?id]
         [(get ?p :summary) ?summary]]}
#+END_QUERY

---

# ✅ Done

#+BEGIN_QUERY
{:title "Completed Tasks"
 :query [:find ?t ?id ?summary
         :where
         [?t :block/properties ?p]
         [(get ?p :workspace) "openclaw"]
         [(get ?p :status) "Done"]
         [(get ?p :id) ?id]
         [(get ?p :summary) ?summary]]}
#+END_QUERY
