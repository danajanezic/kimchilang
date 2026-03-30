## spec

# TaskFilter

**intent:** Query and filter tasks by various criteria
**reason:** Separates query logic from storage and management concerns

### depends

- storage.memory :: Store, query
- task.model :: Task, Status, Priority

### requires

- Filter tasks by status (exact match)
- Filter tasks by priority (exact match)
- Filter tasks by assignee ID (exact match, including unassigned where assigneeId is null)
- Filter tasks created within a date range (inclusive start and end, ISO 8601 strings)
- Filter tasks by multiple criteria combined (AND logic)
- Sort results by priority (Critical first) then by createdAt (oldest first)
- Return empty array when no tasks match

### types

- FilterCriteria :: { status: Status | null, priority: Priority | null, assigneeId: String | null, dateFrom: String | null, dateTo: String | null }

### expose byStatus :: (Store, Status) -> [Task]

**intent:** Return all tasks with a given status

### expose byPriority :: (Store, Priority) -> [Task]

**intent:** Return all tasks with a given priority level

### expose byAssignee :: (Store, String | null) -> [Task]

**intent:** Return all tasks assigned to a user ID, or unassigned tasks if null

### expose byDateRange :: (Store, String, String) -> [Task]

**intent:** Return all tasks created between two dates (inclusive)

### expose filter :: (Store, FilterCriteria) -> [Task]

**intent:** Return tasks matching all non-null criteria, sorted by priority then date

### expose sortByPriority :: ([Task]) -> [Task]

**intent:** Sort tasks by priority (Critical > High > Medium > Low) then by createdAt

## test

<!-- spec-hash: sha256:e01497e4c2ee75e48e7dde43ead55a8ba2fb83ce7b0ff09e9a8b66b4b8cc43b9 -->

```
# Helper to create test tasks in a store
fn setupStore() {
  dec store = createStore()
  dec t1 = { id: "1", title: "Fix bug", description: "", status: "Open", priority: "High", assigneeId: "alice", createdAt: "2025-01-15T10:00:00Z", completedAt: null }
  dec t2 = { id: "2", title: "Add feature", description: "", status: "InProgress", priority: "Critical", assigneeId: "bob", createdAt: "2025-01-10T08:00:00Z", completedAt: null }
  dec t3 = { id: "3", title: "Write docs", description: "", status: "Open", priority: "Low", assigneeId: null, createdAt: "2025-01-20T12:00:00Z", completedAt: null }
  dec t4 = { id: "4", title: "Refactor", description: "", status: "Done", priority: "Medium", assigneeId: "alice", createdAt: "2025-01-12T09:00:00Z", completedAt: "2025-01-18T09:00:00Z" }
  dec s1 = put(store, "1", t1)
  dec s2 = put(s1, "2", t2)
  dec s3 = put(s2, "3", t3)
  dec s4 = put(s3, "4", t4)
  return s4
}

test "byStatus returns tasks matching the given status" {
  dec store = setupStore()
  dec results = byStatus(store, "Open")
  expect(results).toHaveLength(2)
  expect(results[0].status).toBe("Open")
  expect(results[1].status).toBe("Open")
}

test "byStatus returns empty array when no tasks match" {
  dec store = createStore()
  dec results = byStatus(store, "Open")
  expect(results).toEqual([])
}

test "byPriority returns tasks matching the given priority" {
  dec store = setupStore()
  dec results = byPriority(store, "High")
  expect(results).toHaveLength(1)
  expect(results[0].priority).toBe("High")
}

test "byPriority returns tasks matching Low priority" {
  dec store = setupStore()
  dec results = byPriority(store, "Low")
  expect(results).toHaveLength(1)
  expect(results[0].title).toBe("Write docs")
}

test "byPriority returns empty array when no tasks match" {
  dec empty = createStore()
  dec results = byPriority(empty, "High")
  expect(results).toEqual([])
}

test "byAssignee returns tasks assigned to a specific user" {
  dec store = setupStore()
  dec results = byAssignee(store, "alice")
  expect(results).toHaveLength(2)
  expect(results[0].assigneeId).toBe("alice")
  expect(results[1].assigneeId).toBe("alice")
}

test "byAssignee with null returns unassigned tasks" {
  dec store = setupStore()
  dec results = byAssignee(store, null)
  expect(results).toHaveLength(1)
  expect(results[0].assigneeId).toBeNull()
  expect(results[0].title).toBe("Write docs")
}

test "byAssignee returns empty array when no tasks match" {
  dec store = setupStore()
  dec results = byAssignee(store, "nobody")
  expect(results).toEqual([])
}

test "byDateRange returns tasks within inclusive date range" {
  dec store = setupStore()
  dec results = byDateRange(store, "2025-01-10T00:00:00Z", "2025-01-15T23:59:59Z")
  expect(results).toHaveLength(3)
}

test "byDateRange returns empty array when no tasks in range" {
  dec store = setupStore()
  dec results = byDateRange(store, "2024-01-01T00:00:00Z", "2024-12-31T23:59:59Z")
  expect(results).toEqual([])
}

test "byDateRange includes tasks on exact boundary dates" {
  dec store = setupStore()
  dec results = byDateRange(store, "2025-01-15T10:00:00Z", "2025-01-15T10:00:00Z")
  expect(results).toHaveLength(1)
  expect(results[0].title).toBe("Fix bug")
}

test "filter with status criterion only" {
  dec store = setupStore()
  dec criteria = { status: "Open", priority: null, assigneeId: null, dateFrom: null, dateTo: null }
  dec results = filter(store, criteria)
  expect(results).toHaveLength(2)
  expect(results[0].status).toBe("Open")
}

test "filter with multiple criteria uses AND logic" {
  dec store = setupStore()
  dec criteria = { status: "Open", priority: "High", assigneeId: "alice", dateFrom: null, dateTo: null }
  dec results = filter(store, criteria)
  expect(results).toHaveLength(1)
  expect(results[0].title).toBe("Fix bug")
}

test "filter with all null criteria returns all tasks sorted" {
  dec store = setupStore()
  dec criteria = { status: null, priority: null, assigneeId: null, dateFrom: null, dateTo: null }
  dec results = filter(store, criteria)
  expect(results).toHaveLength(4)
}

test "filter results are sorted by priority then createdAt" {
  dec store = setupStore()
  dec criteria = { status: null, priority: null, assigneeId: null, dateFrom: null, dateTo: null }
  dec results = filter(store, criteria)
  expect(results[0].priority).toBe("Critical")
  expect(results[1].priority).toBe("High")
  expect(results[2].priority).toBe("Medium")
  expect(results[3].priority).toBe("Low")
}

test "filter returns empty array when no tasks match combined criteria" {
  dec store = setupStore()
  dec criteria = { status: "Done", priority: "Critical", assigneeId: null, dateFrom: null, dateTo: null }
  dec results = filter(store, criteria)
  expect(results).toEqual([])
}

test "filter with date range criterion" {
  dec store = setupStore()
  dec criteria = { status: null, priority: null, assigneeId: null, dateFrom: "2025-01-10T00:00:00Z", dateTo: "2025-01-12T23:59:59Z" }
  dec results = filter(store, criteria)
  expect(results).toHaveLength(2)
}

test "sortByPriority orders Critical > High > Medium > Low" {
  dec tasks = [
    { id: "1", title: "Low task", priority: "Low", createdAt: "2025-01-01T00:00:00Z" },
    { id: "2", title: "Critical task", priority: "Critical", createdAt: "2025-01-01T00:00:00Z" },
    { id: "3", title: "High task", priority: "High", createdAt: "2025-01-01T00:00:00Z" },
    { id: "4", title: "Medium task", priority: "Medium", createdAt: "2025-01-01T00:00:00Z" }
  ]
  dec sorted = sortByPriority(tasks)
  expect(sorted[0].priority).toBe("Critical")
  expect(sorted[1].priority).toBe("High")
  expect(sorted[2].priority).toBe("Medium")
  expect(sorted[3].priority).toBe("Low")
}

test "sortByPriority uses createdAt as tiebreaker (oldest first)" {
  dec tasks = [
    { id: "1", title: "Newer", priority: "High", createdAt: "2025-01-15T00:00:00Z" },
    { id: "2", title: "Older", priority: "High", createdAt: "2025-01-10T00:00:00Z" }
  ]
  dec sorted = sortByPriority(tasks)
  expect(sorted[0].title).toBe("Older")
  expect(sorted[1].title).toBe("Newer")
}

test "sortByPriority returns empty array for empty input" {
  dec sorted = sortByPriority([])
  expect(sorted).toEqual([])
}
```

## impl

<!-- spec-hash: sha256:e01497e4c2ee75e48e7dde43ead55a8ba2fb83ce7b0ff09e9a8b66b4b8cc43b9 -->

```
dec priorityOrder = { "Critical": 0, "High": 1, "Medium": 2, "Low": 3 }

expose fn sortByPriority(tasks) {
  return [...tasks] ~> sort((a, b) => {
    dec pa = priorityOrder[a.priority]
    dec pb = priorityOrder[b.priority]
    if pa != pb {
      return pa - pb
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
}

expose fn byStatus(store, status) {
  return query(store, task => task.status == status)
}

expose fn byPriority(store, priority) {
  return query(store, task => task.priority == priority)
}

expose fn byAssignee(store, assigneeId) {
  if assigneeId == null {
    return query(store, task => task.assigneeId == null)
  }
  return query(store, task => task.assigneeId == assigneeId)
}

expose fn byDateRange(store, dateFrom, dateTo) {
  dec from = new Date(dateFrom).getTime()
  dec to = new Date(dateTo).getTime()
  return query(store, task => {
    dec created = new Date(task.createdAt).getTime()
    return created >= from and created <= to
  })
}

expose fn filter(store, criteria) {
  dec results = query(store, task => {
    if criteria.status != null and task.status != criteria.status {
      return false
    }
    if criteria.priority != null and task.priority != criteria.priority {
      return false
    }
    if criteria.assigneeId != null and task.assigneeId != criteria.assigneeId {
      return false
    }
    if criteria.dateFrom != null {
      dec from = new Date(criteria.dateFrom).getTime()
      if new Date(task.createdAt).getTime() < from {
        return false
      }
    }
    if criteria.dateTo != null {
      dec to = new Date(criteria.dateTo).getTime()
      if new Date(task.createdAt).getTime() > to {
        return false
      }
    }
    return true
  })
  return sortByPriority(results)
}
```
