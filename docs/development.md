# Development Guide

This guide is for developers who want to contribute to the **Compiler** project or modify it for their own needs.

## Prerequisites

- **Node.js**: v18 or tighter
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

## Building the Project

The project is written in TypeScript. To compile it to JavaScript:

```bash
npm run build
```

The output will be generated in the `dist/` directory.

## Running Tests

We use **Jest** for testing. The project includes unit tests for lexer, parser, compiler, and VM, as well as an end-to-end integration test suite.

### Run All Tests
```bash
npm test
```

### Run Specific Suites
- **Unit Tests**: `npm run test:unit`
- **Integration Tests**: `npm run test:integration`

### Watch Mode (TDD)
Automatically re-run tests on file changes:
```bash
npm run test:watch
```

## Project Structure

```bash
compiler/
├── src/                # Source code
│   ├── ast.ts          # AST nodes and visitors
│   ├── chunk.ts        # Bytecode chunk management
│   ├── compiler.ts     # Bytecode compiler
│   ├── debug.ts        # Disassembler for debugging
│   ├── lexer.ts        # Tokenizer
│   ├── main.ts         # Entry point (CLI)
│   ├── object.ts       # Runtime values and objects
│   ├── parser.ts       # Recursive descent parser
│   ├── token.ts        # Token definitions
│   └── vm.ts           # Virtual Machine
├── tests/              # Test suite
│   ├── unit/           # Unit tests for components
│   └── integration/    # End-to-end .fu script tests
├── examples/           # Sample Fradual scripts
├── docs/               # Documentation
└── dist/               # Compiled JavaScript (build output)
```

## Contribution Workflow

1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/my-feature`).
3.  Implement your changes.
4.  Add tests to cover your changes.
5.  Ensure all tests pass (`npm test`).
6.  Commit your changes following the [Conventional Commits](https://www.conventionalcommits.org/) style.
7.  Push to your fork and submit a Pull Request.

Please refer to [CONTRIBUTING.md](../CONTRIBUTING.md) for more detailed guidelines.
