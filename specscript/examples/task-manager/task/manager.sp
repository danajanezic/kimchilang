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
