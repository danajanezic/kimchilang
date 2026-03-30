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
