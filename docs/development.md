# Development Guide

This guide is for developers who want to contribute to the **Fradual Compiler** or modify it for their own needs.

## Prerequisites

- **Node.js**: v18 or higher
- **npm**: v9 or higher
- **Git**

## Project Setup

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/hypecavess/compiler.git
    cd compiler
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

## Building

Compile TypeScript to JavaScript:

```bash
npm run build
```

The build uses `tsconfig.build.json` (only `src/`, with declarations and source maps) and emits into the `dist/` directory — `src/main.ts` becomes `dist/main.js`. Tests are type-checked but never shipped.

To type-check everything (including tests) without emitting output:

```bash
npm run typecheck
```

## Running

### Execute a Script
```bash
# Via ts-node (development, no build needed):
npm run fradual -- path/to/script.fu

# Via compiled JS (after build):
node dist/main.js path/to/script.fu
```

### Interactive REPL
```bash
npm run fradual
# or after build:
node dist/main.js
```

Type expressions line-by-line. Press `Ctrl+C` or `Ctrl+D` to exit.

---

## Testing

We use **Jest** with ESM support. The project includes unit tests and integration (E2E) tests.

### Run All Tests
```bash
npm test
```

### Run Specific Suites
```bash
npm run test:unit          # Unit tests only
npm run test:integration   # E2E tests only
```

### Watch Mode (TDD)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```
Output is written to `coverage/`.

### Test Structure

| Suite | Location | What it tests |
|---|---|---|
| `lexer.test.ts` | `tests/unit/` | Tokenization of all token types |
| `parser.test.ts` | `tests/unit/` | AST generation for all syntax constructs |
| `compiler.test.ts` | `tests/unit/` | Bytecode output (opcode presence, constants) |
| `vm.test.ts` | `tests/unit/` | End-to-end execution of all language features |
| `features.test.ts` | `tests/unit/` | Compiler/VM init, array literals |
| `security.test.ts` | `tests/unit/` | Error flags, sandbox limits (timeout, stack overflow), constant pool overflow, array bounds, value formatting, closure semantics |
| `sanity.test.ts` | `tests/unit/` | Basic sanity check |
| `e2e.test.ts` | `tests/integration/` | Runs `.fu` fixture files and validates output |

**Test fixtures** live in `tests/integration/fixtures/` — each is a `.fu` script with known expected output.

**Test helper** (`tests/helpers.ts`) provides `tokenize()`, `parse()`, `compile()`, and `run()` utilities that capture `console.log` / `console.error` output for assertion.

---

## Linting & Formatting

```bash
npm run lint          # Check for lint errors
npm run lint:fix      # Auto-fix lint errors
npm run format        # Format all source files with Prettier
```

ESLint config: `.eslintrc.json` | Prettier config: `.prettierrc`

---

## Project Structure

```
compiler/
├── src/                    # Source code
│   ├── token.ts            # Token type enum & Token class
│   ├── lexer.ts            # Tokenizer (source → tokens)
│   ├── ast.ts              # AST node classes & visitor interfaces
│   ├── parser.ts           # Recursive descent parser (tokens → AST)
│   ├── chunk.ts            # OpCode enum & Chunk (bytecode container)
│   ├── object.ts           # Runtime value types (functions, closures, arrays, classes)
│   ├── compiler.ts         # Bytecode compiler (AST → Chunk)
│   ├── vm.ts               # Stack-based virtual machine (Chunk → execution)
│   ├── debug.ts            # Disassembler for bytecode inspection
│   └── main.ts             # CLI entry point (file mode & REPL)
├── tests/
│   ├── helpers.ts          # Shared test utilities
│   ├── unit/               # Unit tests per component
│   └── integration/
│       ├── e2e.test.ts     # Integration test runner
│       └── fixtures/       # .fu test scripts
├── examples/               # Sample Fradual scripts
│   ├── 01_basics.fu
│   ├── 02_control_flow.fu
│   ├── 03_functions.fu
│   └── 04_closures_sim.fu
├── playground/             # Scratch scripts for manual testing
├── docs/                   # Documentation (you are here)
├── dist/                   # Compiled JavaScript (build output)
├── bin/
│   └── fradual.js          # CLI entry shim (imports ../dist/main.js)
├── .github/
│   ├── workflows/          # CI, CodeQL, and release pipelines
│   └── dependabot.yml      # Automated dependency updates
├── package.json
├── tsconfig.json           # Type-checking config (src + tests)
├── tsconfig.build.json     # Build config (src only, emits dist/)
├── jest.config.js
├── .eslintrc.json
└── .prettierrc
```

---

## Debugging Tips

### Inspecting Bytecode

Add the disassembler after the compile step in `src/main.ts` (inside `run()`, right after `compiler.compile(...)`) to see what the compiler generates:

```typescript
import { Disassembler } from './debug.js';

// After compilation:
console.log('--- BYTECODE ---');
new Disassembler().disassembleChunk(function_.chunk, 'script');
console.log('--- END BYTECODE ---');
```

### Using the Playground

The `playground/` directory contains scratch `.fu` files for quick manual testing:

```bash
npm run fradual -- playground/smoke.fu
```

These files are tracked in git as shared scratch examples — feel free to experiment with them locally, but avoid committing personal experiments.

### Common Issues

| Issue | Cause | Fix |
|---|---|---|
| `Unexpected character` | Lexer hit an unsupported character | Check for special unicode characters or block comments (`/* */` not supported) |
| `Undefined variable 'x'` | Variable used before declaration or out of scope | Ensure `var` is declared in an accessible scope |
| `Operands must be numbers` | Arithmetic on non-number operands | Cast or validate types before operating |
| `Stack overflow (max call depth 64)` | Recursion deeper than 64 call frames | Reduce recursion depth or use iteration |
| `Execution time limit exceeded (5000 ms)` | Loop or recursion ran longer than 5 seconds | Check for infinite loops |
| `Stack underflow` | Compiler bug — more pops than pushes | File a bug report with the `.fu` source |

---

## Security Limits

The VM enforces safety limits to prevent runaway programs:

| Limit | Default | Enforced by |
|---|---|---|
| Maximum call stack depth | 64 frames | VM (`maxFrames`) |
| Maximum value stack size | 16384 values | VM (`maxStackSize`) |
| Execution timeout | 5 seconds | VM (`maxExecutionMs`) |
| Maximum source file size | 1 MiB | CLI |
| Maximum locals per function | 256 | Compiler |
| Maximum parameters/arguments | 255 | Parser |
| Maximum constants per chunk | 256 (single-byte address) | Compiler (compile error on overflow) |

The VM limits are configurable when embedding: `new VM({ maxExecutionMs: 100, maxFrames: 128, maxStackSize: 4096 })`.

---

## Contribution Workflow

1.  Fork the repository
2.  Create a feature branch (`git checkout -b feature/my-feature`)
3.  Implement your changes
4.  Add or update tests to cover your changes
5.  Ensure all tests pass (`npm test`)
6.  Run lint checks (`npm run lint`)
7.  Commit following [Conventional Commits](https://www.conventionalcommits.org/) style
8.  Push to your fork and submit a Pull Request

Please refer to [CONTRIBUTING.md](../CONTRIBUTING.md) for more detailed guidelines and [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) for community standards.
