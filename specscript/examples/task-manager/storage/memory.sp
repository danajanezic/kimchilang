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

## test

<!-- spec-hash: sha256:0ac3cd108938ca42cbbcd2901f61a4e7f1c0aa31fbbd9829a2255a37d257dca1 -->

```
test "createStore returns empty store" {
  dec store = createStore()
  expect(store.data).toEqual({})
}

test "put adds a record and returns new store" {
  dec store = createStore()
  dec updated = put(store, "key1", "value1")
  expect(get(updated, "key1")).toEqual(Found { value: "value1" })
}

test "put returns a new store instance (immutable)" {
  dec store = createStore()
  dec updated = put(store, "key1", "value1")
  expect(get(store, "key1")).toEqual(NotFound {})
}

test "put updates existing record" {
  dec store = createStore()
  dec s1 = put(store, "key1", "old")
  dec s2 = put(s1, "key1", "new")
  expect(get(s2, "key1")).toEqual(Found { value: "new" })
}

test "get returns NotFound for missing key" {
  dec store = createStore()
  expect(get(store, "missing")).toEqual(NotFound {})
}

test "get returns Found for existing key" {
  dec store = createStore()
  dec updated = put(store, "a", 42)
  expect(get(updated, "a")).toEqual(Found { value: 42 })
}

test "remove deletes a record and returns new store" {
  dec store = createStore()
  dec s1 = put(store, "x", 1)
  dec s2 = remove(s1, "x")
  expect(get(s2, "x")).toEqual(NotFound {})
}

test "remove returns new store instance (immutable)" {
  dec store = createStore()
  dec s1 = put(store, "x", 1)
  dec s2 = remove(s1, "x")
  expect(get(s1, "x")).toEqual(Found { value: 1 })
}

test "remove on missing key returns new store without error" {
  dec store = createStore()
  dec s2 = remove(store, "nope")
  expect(s2.data).toEqual({})
}

test "query returns matching records" {
  dec store = createStore()
  dec s1 = put(store, "a", 10)
  dec s2 = put(s1, "b", 20)
  dec s3 = put(s2, "c", 5)
  dec results = query(s3, v => v > 8)
  expect(results).toHaveLength(2)
  expect(results).toContain(10)
  expect(results).toContain(20)
}

test "query returns empty array when nothing matches" {
  dec store = createStore()
  dec s1 = put(store, "a", 1)
  dec results = query(s1, v => v > 100)
  expect(results).toEqual([])
}

test "listAll returns all records as array" {
  dec store = createStore()
  dec s1 = put(store, "a", 1)
  dec s2 = put(s1, "b", 2)
  dec s3 = put(s2, "c", 3)
  dec all = listAll(s3)
  expect(all).toHaveLength(3)
  expect(all).toContain(1)
  expect(all).toContain(2)
  expect(all).toContain(3)
}

test "listAll returns empty array for empty store" {
  dec store = createStore()
  expect(listAll(store)).toEqual([])
}

test "get returns null-safe Result not throwing" {
  dec store = createStore()
  dec result = get(store, "x")
  expect(result).toEqual(NotFound {})
}
```

## impl

<!-- spec-hash: sha256:0ac3cd108938ca42cbbcd2901f61a4e7f1c0aa31fbbd9829a2255a37d257dca1 -->

```
enum Result { Found, NotFound }

expose fn createStore() {
  return { data: {} }
}

expose fn get(store, key) {
  dec value = store.data[key]
  if value == undefined {
    return NotFound {}
  }
  return Found { value: value }
}

expose fn put(store, key, value) {
  return { data: { ...store.data, [key]: value } }
}

expose fn remove(store, key) {
  dec entries = Object.entries(store.data) ~> filter(([k, v]) => k != key)
  dec newData = Object.fromEntries(entries)
  return { data: newData }
}

expose fn query(store, predicate) {
  return Object.values(store.data) ~> filter(predicate)
}

expose fn listAll(store) {
  return Object.values(store.data)
}
```
