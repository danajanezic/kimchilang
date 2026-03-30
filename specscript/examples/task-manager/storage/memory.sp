## spec

# MemoryStore

**intent:** In-memory key-value store with query support
**reason:** Provides persistence layer without external dependencies

### requires

- Store, retrieve, update, and delete records by key
- Return a new store instance on every mutation (immutable)
- Query records by predicate function
- List all records as an array
- Return null for missing keys instead of throwing

### types

- Store :: { data: { [key]: value } }
- Result :: Found { value } | NotFound

### expose createStore :: () -> Store

**intent:** Create an empty store

### expose get :: (Store, String) -> Result

**intent:** Retrieve a record by key

### expose put :: (Store, String, Any) -> Store

**intent:** Add or update a record, returning new store

### expose remove :: (Store, String) -> Store

**intent:** Remove a record by key, returning new store

### expose query :: (Store, Function) -> [Any]

**intent:** Return all records matching a predicate function

### expose listAll :: (Store) -> [Any]

**intent:** Return all records as an array
