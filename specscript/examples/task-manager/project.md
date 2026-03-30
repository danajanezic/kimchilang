# TaskManager

**intent:** A collaborative task management system with user assignments, priorities, and filtering
**reason:** Demonstrate multi-module SpecScript projects with cross-module dependencies

## config

- target: javascript
- runtime: node
- strict: true

## requires

- All data must be immutable — no in-place mutation
- All IDs must be generated deterministically from content for testability
- Errors must be returned as typed results, never thrown exceptions
- All dates must be ISO 8601 strings

## modules

- storage.memory :: In-memory key-value store with query support
- user.model :: User data types and constructors
- user.permissions :: Role-based permission checking
- task.model :: Task data types, status transitions, and constructors
- task.manager :: Core task operations (create, assign, complete, delete)
- task.filter :: Query and filter tasks by status, assignee, priority, date range
