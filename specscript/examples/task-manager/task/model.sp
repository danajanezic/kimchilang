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

## test

<!-- spec-hash: sha256:0629643fd1a31dd7a62e12cf25172c5f660f9195c14157a243e148c2eb78060e -->

```
test "taskId generates deterministic ID from title and createdAt" {
  dec id1 = taskId("My Task", "2024-01-01T00:00:00Z")
  dec id2 = taskId("My Task", "2024-01-01T00:00:00Z")
  expect(id1).toBe(id2)
}

test "taskId generates different IDs for different titles" {
  dec id1 = taskId("Task A", "2024-01-01T00:00:00Z")
  dec id2 = taskId("Task B", "2024-01-01T00:00:00Z")
  expect(id1 != id2).toBeTruthy()
}

test "taskId generates different IDs for different timestamps" {
  dec id1 = taskId("Task", "2024-01-01T00:00:00Z")
  dec id2 = taskId("Task", "2024-01-02T00:00:00Z")
  expect(id1 != id2).toBeTruthy()
}

test "createTask returns a valid task with correct fields" {
  dec result = createTask("Buy groceries", "Milk and eggs", Priority.Medium, "2024-01-01T00:00:00Z")
  expect(result.title).toBe("Buy groceries")
  expect(result.description).toBe("Milk and eggs")
  expect(result.status).toBe(Status.Open)
  expect(result.priority).toBe(Priority.Medium)
  expect(result.assigneeId).toBeNull()
  expect(result.createdAt).toBe("2024-01-01T00:00:00Z")
  expect(result.completedAt).toBeNull()
}

test "createTask sets id from taskId function" {
  dec result = createTask("Buy groceries", "", Priority.Low, "2024-01-01T00:00:00Z")
  dec expectedId = taskId("Buy groceries", "2024-01-01T00:00:00Z")
  expect(result.id).toBe(expectedId)
}

test "createTask defaults description to empty string" {
  dec result = createTask("A task", "", Priority.High, "2024-01-01T00:00:00Z")
  expect(result.description).toBe("")
}

test "createTask rejects empty title" {
  dec result = createTask("", "desc", Priority.Low, "2024-01-01T00:00:00Z")
  expect(result.reason).toContain("empty")
}

test "createTask rejects title over 200 characters" {
  dec longTitle = "a".repeat(201)
  dec result = createTask(longTitle, "desc", Priority.Low, "2024-01-01T00:00:00Z")
  expect(result.reason).toContain("200")
}

test "createTask rejects title exactly 200 characters" {
  dec title200 = "a".repeat(200)
  dec result = createTask(title200, "desc", Priority.Low, "2024-01-01T00:00:00Z")
  expect(result.reason).toContain("200")
}

test "createTask accepts title of 199 characters" {
  dec title199 = "a".repeat(199)
  dec result = createTask(title199, "desc", Priority.Low, "2024-01-01T00:00:00Z")
  expect(result.title).toBe(title199)
}

test "transition from Open to InProgress succeeds" {
  dec task = createTask("Task", "", Priority.Medium, "2024-01-01T00:00:00Z")
  dec result = transition(task, Status.InProgress, "2024-01-02T00:00:00Z")
  expect(result.status).toBe(Status.InProgress)
  expect(result.completedAt).toBeNull()
}

test "transition from InProgress to Done succeeds and sets completedAt" {
  dec task = createTask("Task", "", Priority.Medium, "2024-01-01T00:00:00Z")
  dec inProgress = transition(task, Status.InProgress, "2024-01-02T00:00:00Z")
  dec done = transition(inProgress, Status.Done, "2024-01-03T00:00:00Z")
  expect(done.status).toBe(Status.Done)
  expect(done.completedAt).toBe("2024-01-03T00:00:00Z")
}

test "transition from Open to Done is rejected (no skipping)" {
  dec task = createTask("Task", "", Priority.Medium, "2024-01-01T00:00:00Z")
  dec result = transition(task, Status.Done, "2024-01-02T00:00:00Z")
  expect(result.from).toBe(Status.Open)
  expect(result.to).toBe(Status.Done)
}

test "transition from Done to InProgress is rejected (no going backwards)" {
  dec task = createTask("Task", "", Priority.Medium, "2024-01-01T00:00:00Z")
  dec inProgress = transition(task, Status.InProgress, "2024-01-02T00:00:00Z")
  dec done = transition(inProgress, Status.Done, "2024-01-03T00:00:00Z")
  dec result = transition(done, Status.InProgress, "2024-01-04T00:00:00Z")
  expect(result.from).toBe(Status.Done)
  expect(result.to).toBe(Status.InProgress)
}

test "transition from Done to Open is rejected (no going backwards)" {
  dec task = createTask("Task", "", Priority.Medium, "2024-01-01T00:00:00Z")
  dec inProgress = transition(task, Status.InProgress, "2024-01-02T00:00:00Z")
  dec done = transition(inProgress, Status.Done, "2024-01-03T00:00:00Z")
  dec result = transition(done, Status.Open, "2024-01-04T00:00:00Z")
  expect(result.from).toBe(Status.Done)
  expect(result.to).toBe(Status.Open)
}

test "transition from InProgress to Open is rejected (no going backwards)" {
  dec task = createTask("Task", "", Priority.Medium, "2024-01-01T00:00:00Z")
  dec inProgress = transition(task, Status.InProgress, "2024-01-02T00:00:00Z")
  dec result = transition(inProgress, Status.Open, "2024-01-03T00:00:00Z")
  expect(result.from).toBe(Status.InProgress)
  expect(result.to).toBe(Status.Open)
}

test "transition to same status is rejected" {
  dec task = createTask("Task", "", Priority.Medium, "2024-01-01T00:00:00Z")
  dec result = transition(task, Status.Open, "2024-01-02T00:00:00Z")
  expect(result.from).toBe(Status.Open)
  expect(result.to).toBe(Status.Open)
}

test "transition preserves all other task fields" {
  dec task = createTask("My Task", "A description", Priority.Critical, "2024-01-01T00:00:00Z")
  dec result = transition(task, Status.InProgress, "2024-01-02T00:00:00Z")
  expect(result.id).toBe(task.id)
  expect(result.title).toBe("My Task")
  expect(result.description).toBe("A description")
  expect(result.priority).toBe(Priority.Critical)
  expect(result.assigneeId).toBeNull()
  expect(result.createdAt).toBe("2024-01-01T00:00:00Z")
}
```

## impl

<!-- spec-hash: sha256:0629643fd1a31dd7a62e12cf25172c5f660f9195c14157a243e148c2eb78060e -->

```
enum Status { Open, InProgress, Done }

enum Priority { Critical, High, Medium, Low }

enum TaskError { InvalidTitle, InvalidTransition }

fn taskId(title, createdAt) {
  dec combined = title + ":" + createdAt
  dec hash = 0
  for ch in combined {
    hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0
  }
  return "task_" + Math.abs(hash).toString(36)
}

fn createTask(title, description, priority, createdAt) {
  if title.length == 0 {
    return TaskError.InvalidTitle { reason: "Title must not be empty" }
  }
  if title.length >= 200 {
    return TaskError.InvalidTitle { reason: "Title must be under 200 characters" }
  }
  dec id = taskId(title, createdAt)
  return {
    id: id,
    title: title,
    description: description,
    status: Status.Open,
    priority: priority,
    assigneeId: null,
    createdAt: createdAt,
    completedAt: null
  }
}

fn isValidTransition(from, to) {
  if from == Status.Open and to == Status.InProgress {
    return true
  }
  if from == Status.InProgress and to == Status.Done {
    return true
  }
  return false
}

fn transition(task, newStatus, timestamp) {
  if not isValidTransition(task.status, newStatus) {
    return TaskError.InvalidTransition { from: task.status, to: newStatus }
  }
  dec completedAt = if newStatus == Status.Done { timestamp } else { null }
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: newStatus,
    priority: task.priority,
    assigneeId: task.assigneeId,
    createdAt: task.createdAt,
    completedAt: completedAt
  }
}

expose createTask
expose transition
expose taskId
expose Status
expose Priority
expose TaskError
```
