## spec

# TaskModel

**intent:** Define task data types, status transitions, and constructors
**reason:** Central task representation with enforced lifecycle rules

### requires

- Tasks have id, title, description, status, priority, assigneeId, createdAt, and completedAt
- Status lifecycle: Open -> InProgress -> Done (no skipping, no going backwards)
- Priority levels: Critical, High, Medium, Low
- Task ID is derived from title + createdAt (deterministic)
- Title must be non-empty and under 200 characters
- Description is optional, defaults to empty string
- completedAt is null until status becomes Done
- Transitioning to Done sets completedAt to the provided timestamp

### types

- Task :: { id: String, title: String, description: String, status: Status, priority: Priority, assigneeId: String | null, createdAt: String, completedAt: String | null }
- Status :: Open | InProgress | Done
- Priority :: Critical | High | Medium | Low
- TaskError :: InvalidTitle { reason: String } | InvalidTransition { from: Status, to: Status }

### expose createTask :: (String, String, Priority, String) -> Task | TaskError

**intent:** Create a new task from title, description, priority, and createdAt timestamp

### expose transition :: (Task, Status, String) -> Task | TaskError

**intent:** Move a task to a new status with a timestamp, enforcing lifecycle rules

### expose taskId :: (String, String) -> String

**intent:** Generate a deterministic task ID from title and createdAt
