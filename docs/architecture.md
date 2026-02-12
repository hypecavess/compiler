# Architecture & Internals

This document provides a technical overview of the **Fradual Compiler**'s internal architecture, explaining how source code is transformed into executable bytecode and run on a stack-based virtual machine. It is intended for contributors and anyone interested in compiler design.

## Overview

The Compiler follows a classic multi-stage pipeline architecture:

```mermaid
graph LR
    A[Source Code .fu] --> B[Lexer]
    B --> C[Token Stream]
    C --> D[Parser]
    D --> E[AST]
    E --> F[Compiler]
    F --> G[Bytecode Chunk]
    G --> H[VM]
    H --> I[Output]
```

Each stage has a single responsibility and passes its output to the next.

---

## 1. Lexer (Scanning)

**File:** `src/lexer.ts` | **Token definitions:** `src/token.ts`

The Lexer reads the raw source code character by character and groups them into **Tokens**.

**Responsibilities:**
- Identifies single-character tokens (`(`, `)`, `{`, `}`, `[`, `]`, `,`, `.`, `+`, `-`, `;`, `*`, `/`)
- Handles one-or-two character tokens (`!`, `!=`, `=`, `==`, `>`, `>=`, `<`, `<=`)
- Recognizes literals: numbers (including decimals), strings (double-quoted), and identifiers
- Maps reserved words to keyword tokens: `and`, `class`, `else`, `false`, `for`, `fun`, `if`, `nil`, `or`, `print`, `return`, `super`, `this`, `true`, `var`, `while`
- Ignores whitespace and single-line comments (`//`)
- Tracks line numbers for error reporting

**Token structure:**
```typescript
class Token {
    type: TokenType;    // Enum value
    lexeme: string;     // Original text
    literal: LiteralType; // Parsed value (string | number | boolean | null)
    line: number;       // Source line number
}
```

> **Note:** `super` is tokenized but not yet implemented in the parser, compiler, or VM. It is reserved for future inheritance support.

---

## 2. Parser (Syntax Analysis)

**File:** `src/parser.ts` | **AST definitions:** `src/ast.ts`

The Parser takes the token stream and constructs an **Abstract Syntax Tree (AST)** using **Recursive Descent Parsing**.

**Responsibilities:**
- Implements operator precedence (from lowest to highest): assignment → `or` → `and` → equality → comparison → term → factor → unary → call → primary
- Produces two AST node hierarchies that implement the **Visitor Pattern**:
  - **Expressions** (`Expr`): `Binary`, `Unary`, `Literal`, `Grouping`, `Variable`, `Assign`, `Logical`, `Call`, `Get`, `Set`, `This`, `ArrayLiteral`, `IndexGet`, `IndexSet`
  - **Statements** (`Stmt`): `Expression`, `Print`, `Var`, `Block`, `If`, `While`, `FunctionStmt`, `Return`, `Class`
- Desugars `for` loops into `while` loops with initializer/increment blocks
- Handles error recovery via `synchronize()` — on parse error, skips tokens until the next statement boundary

**Visitor interfaces** (`ExprVisitor<R>`, `StmtVisitor<R>`) ensure that the Compiler can traverse the tree without `instanceof` chains:

```typescript
interface ExprVisitor<R> {
    visitBinaryExpr(expr: Binary): R;
    visitCallExpr(expr: Call): R;
    visitArrayLiteralExpr(expr: ArrayLiteral): R;
    visitIndexGetExpr(expr: IndexGet): R;
    visitIndexSetExpr(expr: IndexSet): R;
    // ... 9 more
}
```

---

## 3. Compiler (Bytecode Generation)

**File:** `src/compiler.ts` | **Chunk & OpCodes:** `src/chunk.ts`

The Compiler traverses the AST via the Visitor pattern and emits **bytecode instructions** (OpCodes) into a `Chunk`.

**Responsibilities:**
- **Variable resolution:** Distinguishes local variables (stack-based, index-addressed), global variables (name-addressed via constants table), and upvalues (captured closed-over variables)
- **Scope management:** Tracks `scopeDepth` and a `locals` array. When a scope ends, locals are popped (or closed if captured by a closure)
- **Function compilation:** Creates a new `Compiler` instance for each function body, linked via `enclosing`. The compiled function is emitted as an `OP_CLOSURE` instruction
- **Jump patching:** Emits placeholder jump offsets and back-patches them once the target address is known

### Bytecode Chunk

A `Chunk` holds three parallel arrays:

| Array | Type | Purpose |
|---|---|---|
| `code` | `number[]` | Bytecode instructions and operands |
| `constants` | `Value[]` | Constant pool (numbers, strings, functions) |
| `lines` | `number[]` | Source line number per byte (for debugging) |

### Upvalue Resolution

When a variable is not found as a local, the compiler walks the `enclosing` chain:

1. Check enclosing compiler's locals → if found, mark as `isCaptured` and create an upvalue pointing to the local's stack index (`isLocal: true`)
2. Check enclosing compiler's upvalues → if found, create an upvalue pointing to that upvalue's index (`isLocal: false`)
3. Fall back to global variable lookup

---

## 4. Virtual Machine (VM)

**File:** `src/vm.ts`

The VM is a **stack-based virtual machine** that executes bytecode instructions in a dispatch loop.

### Core Components

| Component | Type | Purpose |
|---|---|---|
| `stack` | `Value[]` | Operand stack for all computations |
| `frames` | `CallFrame[]` | Call stack — each frame tracks a closure, instruction pointer (`ip`), and base stack slot (`slots`) |
| `globals` | `Map<string, Value>` | Global variable storage |
| `openUpvalues` | `ObjUpvalue \| null` | Linked list of open upvalues, sorted by stack location |

### Security Limits

| Limit | Value | Purpose |
|---|---|---|
| `MAX_STACK` | 64 frames | Prevents stack overflow from deep/infinite recursion |
| `MAX_EXECUTION_TIME_MS` | 5000 ms | Prevents infinite loops from hanging the process |

### Instruction Set (Complete)

The VM supports **35 bytecode instructions**:

#### Constants & Literals
| OpCode | Operand | Stack Effect | Description |
|---|---|---|---|
| `OP_CONSTANT` | 1 byte (constant index) | `[] → [value]` | Load constant from pool |
| `OP_NIL` | — | `[] → [nil]` | Push `null` |
| `OP_TRUE` | — | `[] → [true]` | Push `true` |
| `OP_FALSE` | — | `[] → [false]` | Push `false` |

#### Stack Operations
| OpCode | Operand | Stack Effect | Description |
|---|---|---|---|
| `OP_POP` | — | `[value] → []` | Discard top of stack |

#### Variable Access
| OpCode | Operand | Stack Effect | Description |
|---|---|---|---|
| `OP_GET_LOCAL` | 1 byte (slot) | `[] → [value]` | Read local from stack slot |
| `OP_SET_LOCAL` | 1 byte (slot) | `[value] → [value]` | Write to stack slot (no pop) |
| `OP_GET_GLOBAL` | 1 byte (name index) | `[] → [value]` | Read global by name |
| `OP_DEFINE_GLOBAL` | 1 byte (name index) | `[value] → []` | Define global variable |
| `OP_SET_GLOBAL` | 1 byte (name index) | `[value] → [value]` | Assign to existing global |
| `OP_GET_UPVALUE` | 1 byte (upvalue index) | `[] → [value]` | Read captured variable |
| `OP_SET_UPVALUE` | 1 byte (upvalue index) | `[value] → [value]` | Write to captured variable |
| `OP_CLOSE_UPVALUE` | — | `[value] → []` | Close upvalue and pop |

#### Arithmetic & Logic
| OpCode | Operand | Stack Effect | Description |
|---|---|---|---|
| `OP_ADD` | — | `[a, b] → [a+b]` | Add (numbers) or concatenate (strings) |
| `OP_SUBTRACT` | — | `[a, b] → [a-b]` | Subtract (numbers only) |
| `OP_MULTIPLY` | — | `[a, b] → [a*b]` | Multiply (numbers only) |
| `OP_DIVIDE` | — | `[a, b] → [a/b]` | Divide (numbers only) |
| `OP_NEGATE` | — | `[a] → [-a]` | Negate (numbers only) |
| `OP_NOT` | — | `[a] → [!a]` | Logical not (truthy check) |

#### Comparison
| OpCode | Operand | Stack Effect | Description |
|---|---|---|---|
| `OP_EQUAL` | — | `[a, b] → [a===b]` | Strict equality |
| `OP_GREATER` | — | `[a, b] → [a>b]` | Greater than (numbers only) |
| `OP_LESS` | — | `[a, b] → [a<b]` | Less than (numbers only) |

> `>=` is compiled as `OP_LESS` + `OP_NOT`, and `<=` as `OP_GREATER` + `OP_NOT`, and `!=` as `OP_EQUAL` + `OP_NOT`.

#### Control Flow
| OpCode | Operand | Stack Effect | Description |
|---|---|---|---|
| `OP_JUMP` | 2 bytes (offset) | no change | Unconditional forward jump |
| `OP_JUMP_IF_FALSE` | 2 bytes (offset) | no change | Jump if top is falsey (does NOT pop) |
| `OP_LOOP` | 2 bytes (offset) | no change | Unconditional backward jump |

#### Functions & Closures
| OpCode | Operand | Stack Effect | Description |
|---|---|---|---|
| `OP_CALL` | 1 byte (arg count) | `[fn, args...] → [result]` | Call function/class/native |
| `OP_RETURN` | — | `[result] → []` | Return from function, restore frame |
| `OP_CLOSURE` | 1 byte (fn index) + upvalue pairs | `[] → [closure]` | Create closure wrapping a function |

#### Classes & Properties
| OpCode | Operand | Stack Effect | Description |
|---|---|---|---|
| `OP_CLASS` | 1 byte (name index) | `[] → [class]` | Create a class object |
| `OP_GET_PROPERTY` | 1 byte (name index) | `[instance] → [value]` | Read instance field |
| `OP_SET_PROPERTY` | 1 byte (name index) | `[instance, value] → [value]` | Write instance field |
| `OP_PRINT` | — | `[value] → []` | Pop and print to stdout |

#### Arrays
| OpCode | Operand | Stack Effect | Description |
|---|---|---|---|
| `OP_ARRAY` | 1 byte (element count) | `[e1...eN] → [array]` | Create array from N stack values |
| `OP_INDEX_GET` | — | `[array, index] → [value]` | Read array element |
| `OP_INDEX_SET` | — | `[array, index, value] → [value]` | Write array element |

---

## 5. Value Representation

**File:** `src/object.ts`

All values in the VM share a single `Value` type — a TypeScript union:

```typescript
type Value = number | string | boolean | null
    | ObjFunction | ObjNative | ObjClass
    | ObjInstance | ObjArray | ObjClosure | ObjUpvalue;
```

### Runtime Object Types

| Class | Purpose | Key Fields |
|---|---|---|
| `ObjFunction` | Compiled function | `arity`, `upvalueCount`, `chunk`, `name` |
| `ObjClosure` | Function + captured environment | `function`, `upvalues[]` |
| `ObjUpvalue` | Captured variable reference | `location`, `closed`, `next` |
| `ObjNative` | Host-implemented function | `name`, `arity`, `function` |
| `ObjClass` | Class definition | `name` |
| `ObjInstance` | Object instance | `class`, `fields: Map` |
| `ObjArray` | Dynamic array | `elements: Value[]` |

### Upvalue Lifecycle

1. **Open:** Points to a stack slot (`location` index). Value is read/written directly on the stack.
2. **Closed:** When the variable goes out of scope, the value is copied to `closed` and `location` is set to `-1`. All closures sharing the upvalue see the same closed value.

---

## 6. Disassembler (Debug)

**File:** `src/debug.ts`

The `Disassembler` class can dump a `Chunk`'s bytecode in human-readable format. Useful during development for inspecting what the compiler generates.

**Supported instruction formats:**
- **Simple** (1 byte): `OP_NIL`, `OP_TRUE`, etc.
- **Byte** (2 bytes): `OP_GET_LOCAL`, `OP_CALL`, `OP_ARRAY`, etc.
- **Constant** (2 bytes): `OP_CONSTANT`, `OP_GET_GLOBAL`, `OP_CLASS`, etc.
- **Jump** (3 bytes): `OP_JUMP`, `OP_JUMP_IF_FALSE`, `OP_LOOP`
- **Closure** (variable): `OP_CLOSURE` + constant index + upvalue pairs

**Usage** (enable in `src/main.ts`):
```typescript
import { Disassembler } from './debug.js';
new Disassembler().disassembleChunk(function_.chunk, 'script');
```

---

## 7. Native Functions

**File:** `src/vm.ts` (registered in the `VM` constructor)

Native functions are implemented in TypeScript and injected into the `globals` map at VM startup:

| Function | Arity | Description |
|---|---|---|
| `clock()` | 0 | Returns seconds since Unix epoch (as `Date.now() / 1000`) |
| `len(x)` | 1 | Returns length of an `ObjArray` or `string` |
| `push(arr, val)` | 2 | Appends `val` to `arr`, returns `val` |
| `pop(arr)` | 1 | Removes and returns the last element of `arr` |

---

## 8. Entry Point & CLI

**File:** `src/main.ts`

The main module provides two modes of operation:

- **File mode:** `fradual path/to/script.fu` — reads and executes a `.fu` file
- **REPL mode:** `fradual` (no arguments) — interactive line-by-line execution

The pipeline per input line/file: `Lexer → Parser → Compiler → VM`.

---

## Known Limitations & Gotchas

| Area | Limitation |
|---|---|
| **Classes** | No methods, constructors, or inheritance. Only field get/set via dot notation. `super` is reserved but unimplemented. |
| **`this`** | Compiles to `OP_NIL` — not functional outside methods (which don't exist yet). |
| **Error reporting** | Compiler emits line `0` for all bytecode. Debug line info is placeholder only. |
| **String interning** | Not implemented — strings are compared by value (`===`), not by reference. The "String Table" mentioned in older docs does not exist. |
| **Max constants** | 256 per chunk (single-byte operand addressing). |
| **Max locals** | 256 per function. |
| **Max parameters** | 255 per function call. |
| **Array index** | Out-of-bounds access is a runtime error (no wrapping or auto-grow). |
