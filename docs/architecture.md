# Architecture & Internals

This document provides a technical overview of the **Compiler**'s internal architecture, explaining how source code is transformed into executable actions. It is intended for contributors and those interested in compiler design.

## Overview

The Compiler follows a classic multi-stage pipeline architecture:

```mermaid
graph LR
    A[Source Code] --> B[Lexer]
    B --> C[Tokens]
    C --> D[Parser]
    D --> E[Abstract Syntax Tree (AST)]
    E --> F[Compiler]
    F --> G[Bytecode (Chunk)]
    G --> H[Virtual Machine (VM)]
    H --> I[Execution Output]
```

## 1. Lexer (Scanning)
**File:** `src/lexer.ts`

The Lexer (or Scanner) reads the raw source code string character by character and groups them into meaningful units called **Tokens**.
- Ignores whitespace and comments.
- Identifies keywords (`if`, `while`, `fun`), literals (`123`, `"text"`), and operators (`+`, `==`).
- Tracks line numbers for error reporting.

## 2. Parser (Syntax Analysis)
**File:** `src/parser.ts`

The Parser takes the stream of tokens and constructs an **Abstract Syntax Tree (AST)**.
- Uses **Recursive Descent Parsing**.
- Verifies that the token sequence follows the language's grammar rules.
- Handles operator precedence and associativity.
- Detects syntax errors (e.g., missing semicolons, unmatched parentheses).

## 3. Compiler (Bytecode Generation)
**File:** `src/compiler.ts`

The Compiler traverses the AST and generates instructions for the Virtual Machine.
- Single-pass compilation.
- Resolves variable scopes (locals vs globals).
- Emits **Bytecode Instructions** (OpCodes) into a `Chunk`.
- Manages strict stack effects for each operation.

## 4. Virtual Machine (VM)
**File:** `src/vm.ts`

The VM is a **Stack-Based Virtual Machine** that executes the bytecode instructions.
- **Stack**: Stores temporary values and local variables.
- **Call Frame**: Manages function calls and return addresses.
- **Global Table**: Stores global variables.
- **String Table**: Interns strings for efficient comparison and memory usage.

### Instruction Set (OpCodes)
Examples of bytecode instructions utilized by the VM:

| OpCode | Description | Stack Effect |
| :--- | :--- | :--- |
| `OP_CONSTANT` | Load a constant value. | `[ ] -> [ value ]` |
| `OP_ADD` | Pop two values, add them, push result. | `[ a, b ] -> [ a+b ]` |
| `OP_GET_LOCAL` | Read a local variable from the stack. | `[ ] -> [ value ]` |
| `OP_JUMP_IF_FALSE` | Jump if top of stack is falsey. | `[ condition ] -> [ ]` |
| `OP_CALL` | Invoke a function. | `[ func, arg1... ] -> [ result ]` |
| `OP_RETURN` | Return from a function. | `[ result ] -> [ ]` |

## 5. Value Representation
**File:** `src/object.ts`

Values in the VM are typed. The system distinguishes between:
- **Primitives**: Numbers, Booleans, Nil (stored directly).
- **Objects**: Strings, Functions, Native Functions (heap-allocated, managed).

## 6. Native Functions
**File:** `src/main.ts` (Registration)

Native functions allow the language to interact with the host environment. They are implemented in TypeScript and exposed to the VM as callable objects. Examples include `clock()` for time measurement.
