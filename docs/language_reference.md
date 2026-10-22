# Fradual Language Reference & Specification

Welcome to the **Fradual** language specification and reference guide. Fradual is a lightweight, dynamically-typed, sandboxed scripting language designed to be embedded into JavaScript and TypeScript applications.

---

## 1. Syntax & Lexical Conventions

Fradual uses a clean, C-family syntax. Statements end with semicolons `;`, and blocks are delimited with curly braces `{}`.

### Comments
```javascript
// This is a single-line comment.
var a = 10; // Inline comments can appear at the end of statements.
```
*(Block comments `/* ... */` are not supported).*

### Identifiers & Keywords
Identifiers must start with an ASCII letter or underscore (`_`), followed by any combination of letters, digits, or underscores.

Reserved keywords:
`and`, `class`, `else`, `false`, `for`, `fun`, `if`, `nil`, `or`, `print`, `return`, `super`, `this`, `true`, `var`, `while`.

---

## 2. Data Types & Semantics

Fradual has five primitive value types and four reference types.

### 2.1 Primitives (Value Semantics)

| Type | Description | Examples |
|---|---|---|
| **Number** | IEEE 754 64-bit double-precision float | `0`, `42`, `-17.5`, `3.14159` |
| **String** | UTF-8 encoded text sequence | `"hello"`, `"line 1\nline 2"`, `""` |
| **Boolean** | Logical truth values | `true`, `false` |
| **Nil** | Represents the absence of a value | `nil` |

#### Numbers
- There is no integer/float distinction: all numbers are IEEE 754 64-bit floats.
- Division by zero yields `Infinity` or `-Infinity`, and `0 / 0` evaluates to `NaN`.

#### Strings & Escape Sequences
Strings are enclosed in double quotes `"..."`. The lexer supports standard escape sequences:
- `\n`: Newline
- `\t`: Tab
- `\r`: Carriage return
- `\"`: Double quote
- `\\`: Backslash
- `\0`: Null character

Strings can also span multiple lines directly.

#### Nil
- Variables declared without an initializer default to `nil` (`var x;`).
- Functions without an explicit `return` expression return `nil`.
- Accessing a non-existent key on a map returns `nil`.
- `pop()` on an empty array returns `nil`.

---

### 2.2 Reference Types (Reference Semantics)

| Type | Description | Creation Syntax |
|---|---|---|
| **Array** | Ordered, dynamically-sized list of values | `[1, "two", true]` |
| **Map** | Key-value dictionary with string keys | `{ key: "value", "id": 100 }` |
| **Function** | First-class callable code block / closure | `fun add(a, b) { return a + b; }` |
| **Class & Instance** | User-defined classes and instantiated objects | `class Point {} var p = Point();` |

All reference types are passed and assigned **by reference**:
```javascript
var a = { count: 1 };
var b = a;
b.count = 2;
print a.count; // 2 (mutated the same underlying map)
```

---

## 3. Truthiness & Equality

### 3.1 Truthiness Rules
In condition contexts (`if`, `while`, `for`, logical operators `and`, `or`, `!`), Fradual defines **exact truthiness**:

| Value | Truthiness |
|---|---|
| `false` | **Falsey** |
| `nil` | **Falsey** |
| `0` | **Falsey** |
| `""` (empty string) | **Falsey** |
| *All other values* (`true`, non-zero numbers, non-empty strings, `[]`, `{}`, functions, instances) | **Truthy** |

> **Note:** Like JavaScript and Python, `0` and `""` are falsey. Arrays `[]` and maps `{}` are always truthy.

### 3.2 Equality (`==` and `!=`)
Equality checking is strict and does not perform implicit type coercion:

```javascript
print 10 == 10;     // true
print 10 == "10";   // false (different types)
print nil == nil;   // true
print nil == false; // false
print 0 == false;   // false
```

- **Primitives** compare by value.
- **Reference types** (arrays, maps, instances, functions) compare by identity:
```javascript
print [1, 2] == [1, 2]; // false (distinct memory objects)
var arr = [1, 2];
var alias = arr;
print arr == alias;     // true (same reference)

print {} == {};         // false (distinct maps)
```

---

## 4. Operators

### 4.1 Arithmetic Operators

| Operator | Description | Operand Requirements |
|---|---|---|
| `+` | Addition / String Concatenation | Numbers OR if either operand is a string |
| `-` | Subtraction | Two numbers |
| `*` | Multiplication | Two numbers |
| `/` | Division (IEEE 754) | Two numbers |
| `%` | Modulo (Remainder) | Two numbers |
| `-` (unary) | Negation | Single number |

#### Smart String Concatenation:
If **either** operand of `+` is a string, the other operand is automatically converted to its canonical string representation:
```javascript
print "Score: " + 100;           // "Score: 100"
print "Active: " + true;         // "Active: true"
print "List: " + [1, 2];         // "List: [1, 2]"
print "Items: " + { "qty": 5 };  // "Items: {\"qty\": 5}"
```
If neither operand is a string, both must be numbers; mixing other types (e.g. `10 + true`) produces a runtime error.

### 4.2 Comparison Operators
`<`, `<=`, `>`, `>=` require both operands to be numbers:
```javascript
print 5 > 3;   // true
print 10 <= 10; // true
```

### 4.3 Logical Operators
`and` and `or` perform **short-circuit evaluation**:
- `a and b`: Evaluates `a`. If falsey, returns `a` immediately without evaluating `b`. Otherwise evaluates and returns `b`.
- `a or b`: Evaluates `a`. If truthy, returns `a` immediately without evaluating `b`. Otherwise evaluates and returns `b`.
- `!a`: Inverts truthiness, returning `true` if `a` is falsey and `false` if `a` is truthy.

---

## 5. Control Flow

### 5.1 If / Else
```javascript
if (user.role == "admin") {
    grantAllAccess();
} else if (user.role == "moderator") {
    grantReviewAccess();
} else {
    grantBasicAccess();
}
```

### 5.2 While Loops
```javascript
var count = 3;
while (count > 0) {
    print count;
    count = count - 1;
}
```

### 5.3 For Loops
The standard `for` loop desugars cleanly into a `while` loop at parse time:
```javascript
for (var i = 0; i < 5; i = i + 1) {
    print i;
}
```

---

## 6. Functions & Scope

### 6.1 Declarations & First-Class Functions
Functions are declared using the `fun` keyword. Functions are first-class values and can be assigned to variables, passed as arguments, and returned from functions:

```javascript
fun createMultiplier(factor) {
    fun multiply(x) {
        return x * factor;
    }
    return multiply;
}

var double = createMultiplier(2);
print double(10); // 20
```

### 6.2 Lexical Scoping & Closures
- Variables have lexical block scope delimited by `{}`.
- Inner blocks can read and shadow outer variables.
- Closures capture local variables as **upvalues**. When the enclosing function scope exits, upvalues are closed over and remain heap-allocated for as long as the closure is alive.

### 6.3 Parameters & Arity
- Functions can accept up to 255 parameters.
- Calling a function with the wrong number of arguments triggers a runtime error before executing the body.

---

## 7. Data Structures: Arrays & Maps

### 7.1 Arrays
Arrays are dynamic, zero-indexed lists:
```javascript
var list = [10, 20, 30];
print list[0];     // 10
list[1] = 99;      // mutate element
print len(list);   // 2

push(list, 40);    // append element
var last = pop(list); // pop last element (40)
```
- Accessing an index outside `0 <= index < len` throws a bounds error.
- Non-integer indices (e.g. `list["key"]`) throw a type error.

### 7.2 Maps (Dictionaries)
Maps store string-keyed key-value pairs:
```javascript
// Literals support string keys or unquoted identifier keys
var user = {
    name: "Alex",
    "role": "editor",
    age: 30
};

// Access via dot notation or bracket notation:
print user.name;      // "Alex"
print user["role"];   // "editor"

// Mutate or add new keys:
user.score = 95;
user["verified"] = true;

// Number of entries:
print len(user);      // 5

// Non-existent key returns nil (no runtime error)
print user.missingKey; // nil
```

---

## 8. Classes & Instances

Fradual supports object-oriented modeling with classes and dynamic fields:
```javascript
class Person {}

var p = Person();
p.name = "Diana";
p.age = 28;

print p.name; // Diana
```

---

## 9. Built-in Standard Functions

The following functions are built into the runtime globally:

| Function | Signature | Description |
|---|---|---|
| `clock()` | `() -> number` | Returns the current time in seconds as a high-resolution float. |
| `len(val)` | `(string \| array \| map) -> number` | Returns the length of a string, element count of an array, or entry count of a map. |
| `push(arr, item)` | `(array, any) -> any` | Appends `item` to `arr` and returns the pushed item. |
| `pop(arr)` | `(array) -> any` | Removes and returns the last element of `arr`. Returns `nil` if empty. |

---

## 10. Security & Sandbox Boundary Guarantees

Fradual is built from the ground up for safe execution of untrusted scripts in host Node.js and browser environments.

### 10.1 Resource Governance
- **Deterministic Instruction Limiting (`maxInstructions`)**: Caps the maximum number of bytecode instructions a script can execute. Because it counts VM opcodes, it is 100% deterministic across all hardware.
- **Wall-Clock Timeout (`maxExecutionMs`)**: Halts execution if a script runs longer than the allotted time.
- **Call Stack Limiting (`maxFrames`)**: Limits recursion depth (default 256) to prevent host V8 call stack overflow.
- **Value Stack Limiting (`maxStackSize`)**: Limits operand stack capacity (default 16,384).

### 10.2 Prototype Pollution & Host Isolation
- **Host Prototype Immunity**: Scripts cannot access `.constructor`, `.__proto__`, or `Object.prototype`.
- **Map Isolation**: Maps are implemented on top of isolated `Map<string, Value>` structures. Keys named `toString`, `valueOf`, `constructor`, or `get` never collide with host prototypes.
- **Safe Bridge Serialization**: Objects returned to or accepted from the host pass through safe boundaries (`fromValue()` / `toValue()`) that sanitize prototype properties and prevent prototype poisoning.

### 10.3 IMPORTANT: The Synchronous Native Execution Boundary
> [!WARNING]
> In JavaScript (V8), the engine runs on a single event-loop thread.
> 
> The VM's `maxExecutionMs` and `maxInstructions` are evaluated **between bytecode instruction dispatches**. 
> If a host application registers a synchronous host native function that blocks in an infinite loop inside JavaScript (e.g. `while(true){}`), the VM cannot preempt or interrupt that native function until it returns control to the VM loop.
>
> **Best Practice for Multi-Tenant Untrusted Scripts:**
> If untrusted scripts can trigger host native functions that might block, run the `Fradual` instance inside a dedicated Node.js `worker_threads` Worker or Web Worker with OS/thread-level cancellation.

---

## 11. Error Architecture & Diagnostics

Fradual uses a structured diagnostic pipeline. It never calls `process.exit()` or logs directly to `console.error` inside core libraries.

All errors produce structured `Diagnostic` objects:
```typescript
interface Diagnostic {
    kind: 'lexical' | 'syntax' | 'compile' | 'runtime';
    message: string;
    line?: number;
    stack?: StackFrameInfo[];
}
```

```typescript
const result = engine.run("var a = ;");
if (!result.ok) {
    for (const diag of result.diagnostics) {
        console.error(formatDiagnostic(diag));
    }
}
```
Output:
```
[syntax] line 1: Expect expression.
```
