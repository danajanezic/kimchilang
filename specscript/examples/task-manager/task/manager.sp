## spec

# TaskManager

**intent:** Core task operations with permission checking and persistent storage
**reason:** Orchestrates task lifecycle through the storage and permission layers

### depends

- storage.memory :: createStore, get, put, remove, listAll
- task.model :: createTask, transition, Task, TaskError
- user.model :: User
- user.permissions :: canPerform, canModifyTask

### requires

- Create a task and store it, checking CreateTask permission first
- Assign a task to a user by ID, checking AssignTask permission
- Transition a task's status, checking that the user can modify the task
- Delete a task, checking DeleteTask permission
- Get a single task by ID
- List all tasks in the store
- All operations return the updated store alongside the result
- Permission denials return the denial reason, not a thrown error

### types

- ManagerResult :: Success { store: Store, task: Task } | PermissionDenied { reason: String } | TaskNotFound { id: String } | InvalidOperation { error: TaskError }

### expose initManager :: () -> Store

**intent:** Create a fresh task manager with an empty store

### expose addTask :: (Store, User, String, String, Priority, String) -> ManagerResult

**intent:** Create and store a new task if the user has permission

### expose assignTask :: (Store, User, String, String) -> ManagerResult

**intent:** Assign a task to a user ID if the user has permission

### expose updateStatus :: (Store, User, String, Status, String) -> ManagerResult

**intent:** Transition a task's status if the user can modify it

### expose deleteTask :: (Store, User, String) -> ManagerResult

**intent:** Remove a task if the user has DeleteTask permission

### expose getTask :: (Store, String) -> Task | null

**intent:** Retrieve a single task by ID

### expose getAllTasks :: (Store) -> [Task]

**intent:** List all tasks in the store

## test

<!-- spec-hash: sha256:876dd6bf01b601cd450ef46d4d8767ba5b7beca2f038158fe77352c33c446d87 -->

```
# Helper to create test users
fn adminUser() {
  return { id: "admin-1", name: "Admin", email: "admin@test.com", role: "Admin" }
}

fn memberUser() {
  return { id: "member-1", name: "Member", email: "member@test.com", role: "Member" }
}

fn viewerUser() {
  return { id: "viewer-1", name: "Viewer", email: "viewer@test.com", role: "Viewer" }
}

test "initManager returns an empty store" {
  dec store = initManager()
  expect(getAllTasks(store)).toEqual([])
}

test "addTask creates and stores a task when user has permission" {
  dec store = initManager()
  dec result = addTask(store, adminUser(), "Fix bug", "It is broken", "High", "2025-01-15T10:00:00Z")
  expect(result.type).toBe("Success")
  expect(result.task.title).toBe("Fix bug")
  expect(result.task.description).toBe("It is broken")
  expect(result.task.priority).toBe("High")
  expect(result.task.status).toBe("Open")
  expect(getAllTasks(result.store)).toHaveLength(1)
}

test "addTask returns PermissionDenied for viewer" {
  dec store = initManager()
  dec result = addTask(store, viewerUser(), "Task", "desc", "Low", "2025-01-15T10:00:00Z")
  expect(result.type).toBe("PermissionDenied")
  expect(result.reason).toBeTruthy()
}

test "addTask returns InvalidOperation for invalid title" {
  dec store = initManager()
  dec result = addTask(store, adminUser(), "", "desc", "Low", "2025-01-15T10:00:00Z")
  expect(result.type).toBe("InvalidOperation")
  expect(result.error).toBeTruthy()
}

test "addTask returns InvalidOperation for invalid priority" {
  dec store = initManager()
  dec result = addTask(store, adminUser(), "Task", "desc", "SuperUrgent", "2025-01-15T10:00:00Z")
  expect(result.type).toBe("InvalidOperation")
  expect(result.error).toBeTruthy()
}

test "addTask returns updated store alongside result" {
  dec store = initManager()
  dec r1 = addTask(store, adminUser(), "Task 1", "", "Low", "2025-01-01T00:00:00Z")
  dec r2 = addTask(r1.store, adminUser(), "Task 2", "", "High", "2025-01-02T00:00:00Z")
  expect(getAllTasks(r2.store)).toHaveLength(2)
}

test "assignTask assigns a task to a user ID" {
  dec store = initManager()
  dec r1 = addTask(store, adminUser(), "Task", "desc", "Medium", "2025-01-15T10:00:00Z")
  dec result = assignTask(r1.store, adminUser(), r1.task.id, "user-42")
  expect(result.type).toBe("Success")
  expect(result.task.assigneeId).toBe("user-42")
}

test "assignTask returns PermissionDenied for viewer" {
  dec store = initManager()
  dec r1 = addTask(store, adminUser(), "Task", "desc", "Medium", "2025-01-15T10:00:00Z")
  dec result = assignTask(r1.store, viewerUser(), r1.task.id, "user-42")
  expect(result.type).toBe("PermissionDenied")
}

test "assignTask returns TaskNotFound for missing task" {
  dec store = initManager()
  dec result = assignTask(store, adminUser(), "nonexistent", "user-42")
  expect(result.type).toBe("TaskNotFound")
  expect(result.id).toBe("nonexistent")
}

test "updateStatus transitions a task status" {
  dec store = initManager()
  dec r1 = addTask(store, adminUser(), "Task", "desc", "High", "2025-01-15T10:00:00Z")
  dec result = updateStatus(r1.store, adminUser(), r1.task.id, "InProgress", "2025-01-16T10:00:00Z")
  expect(result.type).toBe("Success")
  expect(result.task.status).toBe("InProgress")
}

test "updateStatus checks canModifyTask permission" {
  dec store = initManager()
  dec r1 = addTask(store, adminUser(), "Task", "desc", "High", "2025-01-15T10:00:00Z")
  dec result = updateStatus(r1.store, viewerUser(), r1.task.id, "InProgress", "2025-01-16T10:00:00Z")
  expect(result.type).toBe("PermissionDenied")
}

test "updateStatus returns TaskNotFound for missing task" {
  dec store = initManager()
  dec result = updateStatus(store, adminUser(), "nonexistent", "InProgress", "2025-01-16T10:00:00Z")
  expect(result.type).toBe("TaskNotFound")
}

test "updateStatus returns InvalidOperation for invalid transition" {
  dec store = initManager()
  dec r1 = addTask(store, adminUser(), "Task", "desc", "High", "2025-01-15T10:00:00Z")
  dec result = updateStatus(r1.store, adminUser(), r1.task.id, "Done", "2025-01-16T10:00:00Z")
  expect(result.type).toBe("InvalidOperation")
}

test "deleteTask removes a task from the store" {
  dec store = initManager()
  dec r1 = addTask(store, adminUser(), "Task", "desc", "Low", "2025-01-15T10:00:00Z")
  dec result = deleteTask(r1.store, adminUser(), r1.task.id)
  expect(result.type).toBe("Success")
  expect(getAllTasks(result.store)).toHaveLength(0)
}

test "deleteTask returns PermissionDenied for member" {
  dec store = initManager()
  dec r1 = addTask(store, adminUser(), "Task", "desc", "Low", "2025-01-15T10:00:00Z")
  dec result = deleteTask(r1.store, memberUser(), r1.task.id)
  expect(result.type).toBe("PermissionDenied")
}

test "deleteTask returns TaskNotFound for missing task" {
  dec store = initManager()
  dec result = deleteTask(store, adminUser(), "nonexistent")
  expect(result.type).toBe("TaskNotFound")
  expect(result.id).toBe("nonexistent")
}

test "getTask returns a task by ID" {
  dec store = initManager()
  dec r1 = addTask(store, adminUser(), "Task", "desc", "Medium", "2025-01-15T10:00:00Z")
  dec task = getTask(r1.store, r1.task.id)
  expect(task.title).toBe("Task")
}

test "getTask returns null for missing ID" {
  dec store = initManager()
  dec task = getTask(store, "nonexistent")
  expect(task).toBeNull()
}

test "getAllTasks returns all tasks in the store" {
  dec store = initManager()
  dec r1 = addTask(store, adminUser(), "Task 1", "", "Low", "2025-01-01T00:00:00Z")
  dec r2 = addTask(r1.store, adminUser(), "Task 2", "", "High", "2025-01-02T00:00:00Z")
  dec r3 = addTask(r2.store, adminUser(), "Task 3", "", "Medium", "2025-01-03T00:00:00Z")
  dec tasks = getAllTasks(r3.store)
  expect(tasks).toHaveLength(3)
}

test "getAllTasks returns empty array for empty store" {
  dec store = initManager()
  expect(getAllTasks(store)).toEqual([])
}

test "permission denial returns reason not thrown error" {
  dec store = initManager()
  dec result = addTask(store, viewerUser(), "Task", "desc", "Low", "2025-01-15T10:00:00Z")
  expect(result.type).toBe("PermissionDenied")
  expect(result.reason).toBeTruthy()
}
```

## impl

<!-- spec-hash: sha256:876dd6bf01b601cd450ef46d4d8767ba5b7beca2f038158fe77352c33c446d87 -->

```
enum ManagerResult { Success, PermissionDenied, TaskNotFound, InvalidOperation }

expose fn initManager() {
  return createStore()
}

expose fn addTask(store, user, title, description, priority, createdAt) {
  dec perm = canPerform(user, "CreateTask")
  if perm.type == "Denied" {
    return PermissionDenied { reason: perm.reason }
  }
  dec result = createTask(title, description, priority, createdAt)
  if result.id == null {
    return InvalidOperation { error: result }
  }
  dec newStore = put(store, result.id, result)
  return Success { store: newStore, task: result }
}

expose fn assignTask(store, user, taskId, assigneeId) {
  dec perm = canPerform(user, "AssignTask")
  if perm.type == "Denied" {
    return PermissionDenied { reason: perm.reason }
  }
  dec found = get(store, taskId)
  if found.type == "NotFound" {
    return TaskNotFound { id: taskId }
  }
  dec task = found.value
  dec updated = { ...task, assigneeId: assigneeId }
  dec newStore = put(store, taskId, updated)
  return Success { store: newStore, task: updated }
}

expose fn updateStatus(store, user, taskId, status, timestamp) {
  dec found = get(store, taskId)
  if found.type == "NotFound" {
    return TaskNotFound { id: taskId }
  }
  dec task = found.value
  dec perm = canModifyTask(user, task)
  if perm.type == "Denied" {
    return PermissionDenied { reason: perm.reason }
  }
  dec result = transition(task, status, timestamp)
  if result.type == "InvalidTransition" {
    return InvalidOperation { error: result }
  }
  dec newStore = put(store, taskId, result)
  return Success { store: newStore, task: result }
}

expose fn deleteTask(store, user, taskId) {
  dec perm = canPerform(user, "DeleteTask")
  if perm.type == "Denied" {
    return PermissionDenied { reason: perm.reason }
  }
  dec found = get(store, taskId)
  if found.type == "NotFound" {
    return TaskNotFound { id: taskId }
  }
  dec task = found.value
  dec newStore = remove(store, taskId)
  return Success { store: newStore, task: task }
}

expose fn getTask(store, taskId) {
  dec found = get(store, taskId)
  if found.type == "NotFound" {
    return null
  }
  return found.value
}

expose fn getAllTasks(store) {
  return listAll(store)
}
```
