## spec

# Permissions

**intent:** Role-based permission checking for task operations
**reason:** Enforce access control without scattering auth logic across modules

### depends

- user.model :: User

### requires

- Admin can create, assign, complete, delete, and view any task
- Member can create tasks, assign to self, complete own tasks, and view all tasks
- Member cannot delete tasks or assign tasks to others
- Viewer can only view tasks
- Return a clear denial reason when permission is rejected

### types

- Permission :: CreateTask | AssignTask | CompleteTask | DeleteTask | ViewTask
- PermissionResult :: Allowed | Denied { reason: String }

### expose canPerform :: (User, Permission) -> PermissionResult

**intent:** Check if a user has permission to perform an action

### expose canModifyTask :: (User, Task) -> PermissionResult

**intent:** Check if a user can modify a specific task (must be admin or task owner)
