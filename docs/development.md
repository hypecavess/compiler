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

Output is generated in the `dist/` directory.

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
├── package.json
├── tsconfig.json
├── jest.config.js
├── .eslintrc.json
└── .prettierrc
```

---

## Debugging Tips

### Inspecting Bytecode

Uncomment the disassembler lines in `src/main.ts` to see what the compiler generates:

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

Edit these files freely — they are `.gitignore`'d or intended for local use only.

### Common Issues

| Issue | Cause | Fix |
|---|---|---|
| `Unexpected character` | Lexer hit an unsupported character | Check for special unicode characters or block comments (`/* */` not supported) |
| `Undefined variable 'x'` | Variable used before declaration or out of scope | Ensure `var` is declared in an accessible scope |
| `Operands must be numbers` | Arithmetic on non-number operands | Cast or validate types before operating |
| `Stack overflow` | Recursion deeper than 64 call frames | Reduce recursion depth or use iteration |
| `Execution time limit exceeded` | Loop or recursion ran longer than 5 seconds | Check for infinite loops |
| `Stack underflow` | Compiler bug — more pops than pushes | File a bug report with the `.fu` source |

---

## Security Limits

The VM enforces safety limits to prevent runaway programs:

| Limit | Value |
|---|---|
| Maximum call stack depth | 64 frames |
| Execution timeout | 5 seconds |
| Maximum locals per function | 256 |
| Maximum parameters per function | 255 |
| Maximum constants per chunk | 256 (single-byte address) |

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
