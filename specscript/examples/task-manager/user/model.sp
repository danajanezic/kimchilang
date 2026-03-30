## spec

# UserModel

**intent:** Define user data types and constructors
**reason:** Consistent user representation across all modules

### requires

- Users have an id, name, email, and role
- Roles are Admin, Member, or Viewer
- Admin can do everything, Member can create and manage own tasks, Viewer is read-only
- User IDs are derived from email (lowercase, hashed)
- Validate that email contains @ and name is non-empty

### types

- User :: { id: String, name: String, email: String, role: Role }
- Role :: Admin | Member | Viewer
- UserError :: InvalidEmail { email: String } | InvalidName

### expose createUser :: (String, String, Role) -> User | UserError

**intent:** Create a user from name, email, and role with validation

### expose userId :: (String) -> String

**intent:** Generate a deterministic user ID from an email address
