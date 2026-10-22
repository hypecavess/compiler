<div align="center">
<picture>
  <img
    alt="Fradual Banner"
    src="assets/compiler-banner.png"
    width="100%"
  />
</picture>

<br />
<br />

# Fradual

**Embeddable Scripting Runtime with Controlled Execution Budget for JavaScript & TypeScript**
*A lightweight, zero-dependency bytecode compiler and virtual machine designed for embedding deterministic scripting, business rules, and mathematical formulas.*

<br />

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-Apache%202.0-green.svg?style=flat-square)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-success.svg?style=flat-square)](#)
[![Tests](https://img.shields.io/badge/Tests-200%20passing-brightgreen.svg?style=flat-square)](#)
[![Sandboxed](https://img.shields.io/badge/Execution%20Boundary-Hardened-blueviolet.svg?style=flat-square)](#security--sandbox-model)

</div>

<br />

## Why Fradual?

Executing untrusted code in JavaScript is notoriously dangerous. `eval()` and `new Function()` expose host processes to severe vulnerabilities like prototype pollution, arbitrary code execution, and runaway loops.

**Fradual** provides a self-contained, isolated bytecode execution environment running directly in TypeScript/JavaScript without any native C/C++ bindings or external dependencies.

- 🛡️ **Hardened Sandbox**: Immune to prototype pollution (`__proto__`, `.constructor`, and prototype traversals are stripped).
- ⏱️ **Deterministic Intra-VM Instruction Budget**: Hard limits on bytecode instruction counts (`maxInstructions`), execution time (`maxExecutionMs`), and call stack frames (`maxFrames`).
- ⚡ **High Performance**: Compiles over **20,000 scripts/sec** and executes over **220,000 host bridge calls/sec**.
- 🪶 **Zero Dependencies**: Entire core engine is under 50 KB bundled, 100% tree-shakeable, and runs anywhere (Node.js, Deno, Bun, Cloudflare Workers, modern browsers).
- 🧩 **Rich Language Features**: Maps/dictionaries (`{}`), arrays (`[]`), first-class functions, lexical closures, OOP classes, string interpolation/concatenation, and modulo.
- 🎯 **Clean Diagnostics**: Pure structured error reporting with source lines and call stacks; never calls `process.exit()` or spams `console.log`.

---

## Quick Start

### Installation

```bash
npm install @hypecaves/compiler
```

### 30-Second Embedding Example

```typescript
import { Fradual } from '@hypecaves/compiler';

// 1. Initialize the sandboxed engine with limits & host context
const engine = new Fradual({
    maxInstructions: 50_000,
    maxExecutionMs: 250,
    globals: {
        order: { subtotal: 120, tier: 'VIP' }
    },
    natives: {
        calcDiscount: (subtotal, percent) => (subtotal * percent) / 100
    }
});

// 2. Run user-provided untrusted script
const script = `
    var discountPercent = 0;
    if (order.tier == "VIP") {
        discountPercent = 15;
    }
    var discount = calcDiscount(order.subtotal, discountPercent);
    return {
        originalTotal: order.subtotal,
        discountApplied: discount,
        finalTotal: order.subtotal - discount
    };
`;

const result = engine.run(script);

if (result.ok) {
    console.log('Result:', result.value);
    // { originalTotal: 120, discountApplied: 18, finalTotal: 102 }
} else {
    console.error('Execution failed:', result.diagnostics);
}
```

---

## Precompiling & Bytecode Reuse

When executing the same script repeatedly across multiple requests (e.g., evaluating business rules or game event hooks), precompilation compiles the AST to bytecode once and runs it thousands of times with zero compile overhead.

```typescript
import { Fradual } from '@hypecaves/compiler';

const engine = new Fradual();

// Compile once
const compiled = engine.compile(`
    fun computeScore(base, multiplier) {
        return (base * multiplier) % 1000;
    }
    return computeScore(userBase, factor);
`);

if (compiled.ok && compiled.program) {
    // Run repeatedly with different parameters
    engine.set('factor', 3);

    engine.set('userBase', 150);
    const run1 = engine.run(compiled.program); // 450

    engine.set('userBase', 500);
    const run2 = engine.run(compiled.program); // 500

    // Inspect compiled bytecode
    console.log(compiled.program.disassemble());
}
```

---

## Performance Benchmarks

Fradual is engineered for low latency and high throughput. Benchmarks run on standard commodity hardware:

| Benchmark Case | Iterations | Ops / Sec | Memory Delta |
|---|---|---|---|
| **V8 JIT Baseline** (Fibonacci 20 in Native JS) | 500 | **7,665 runs/sec** | Baseline |
| **Fradual Precompiled Bytecode VM** (Fibonacci 20) | 50 | **84 runs/sec** | Minimal |
| **Compiler Throughput** (Lex + Parse + AST + Bytecode) | 2,000 | **30,004 compiles/sec** | Clean GC |
| **Bridge: Host Object (50 keys) -> Fradual Map** | 5,000 | **133,066 ops/sec** | Zero leak |
| **Bridge: Fradual Map (50 keys) -> Host Object** | 5,000 | **142,831 ops/sec** | Zero leak |
| **Native Function Call Bridge** (Call + Return) | 5,000 | **383,483 calls/sec** | Clean GC |

Run the benchmarks locally:
```bash
npm run benchmark
```

---

## Security & Sandbox Model

Fradual was designed specifically for multi-tenant, untrusted user scripts. For the in-depth specification, see **[Sandbox Boundary & Security Architecture](docs/sandbox_boundary.md)**.

### 1. Prototype Pollution Immunity
- The host object converter `toValue()` strips `__proto__`, `constructor`, and `prototype` keys during serialization.
- Maps in Fradual use isolated `Map<string, Value>` structures rather than raw JavaScript object literals. Script keys like `"toString"` or `"valueOf"` can never access or pollute host prototypes.
- Primitive values (numbers, strings, booleans) do not expose property lookups.

### 2. Execution Budget Limits & Cancellation
- `maxInstructions`: Counts VM instruction dispatches. Provides a **deterministic instruction budget** for intra-VM execution across all operating systems and hardware (does not govern host wall-clock time or host native operations).
- `maxExecutionMs`: Wall-clock timer limit.
- `maxFrames`: Limits recursion call depth (default 256) to prevent host V8 call-stack exhaustion.
- `maxStackSize`: Limits operand stack depth (default 16,384).
- `abortSignal`: Standard Web API `AbortSignal` for cooperative host cancellation (`controller.abort()`).
- `engine.abort()`: Direct imperative cancellation method.

### 3. Synchronous Host Native Function Boundary Caveat
> [!IMPORTANT]
> **Host Native Timeout Boundary**:
> The VM's `maxExecutionMs`, `maxInstructions`, and `abortSignal` are evaluated **between bytecode instruction dispatches**.
> 
> Because JavaScript (V8) runs synchronously on a single event-loop thread, if a host application registers a synchronous host native function that blocks in an infinite loop (e.g., `while(true){}` inside the JS native), the VM cannot preempt or stop it until that native function returns.
>
> **Production Recommendation for Multi-Tenant Untrusted Scripts**:
> If your use case accepts untrusted native callbacks, run the `Fradual` instance inside a dedicated Node.js `worker_threads` Worker or Web Worker with thread-level resource limits (`resourceLimits: { maxOldGenerationSizeMb: ... }`) and cancellation.

---

## Language Features at a Glance

| Feature | Syntax Example |
|---|---|
| **Variables & Scope** | `var count = 10; { var inner = 20; }` |
| **Data Types** | `number`, `string`, `boolean`, `nil`, `array`, `map` |
| **Maps / Dictionaries** | `var m = { key: "val", count: 42 }; m.count = m.count + 1;` |
| **Arrays** | `var list = [1, 2, 3]; push(list, 4); var last = pop(list);` |
| **Control Flow** | `if (...) { ... } else { ... }`, `while (...) { ... }`, `for (...) { ... }` |
| **Functions & Closures** | `fun makeAdder(n) { fun add(x) { return x + n; } return add; }` |
| **OOP Classes** | `class Point {} var p = Point(); p.x = 10;` |
| **Operators** | `+`, `-`, `*`, `/`, `%` (modulo), `==`, `!=`, `<`, `>`, `<=`, `>=`, `and`, `or`, `!` |
| **Standard Builtins** | `clock()`, `len(val)`, `push(arr, item)`, `pop(arr)` |

For full specification and syntax rules, see the **[Language Reference](docs/language_reference.md)**.

---

## Command Line Interface (CLI)

Fradual includes a standalone CLI for running scripts, disassembling bytecode, and debugging.

```bash
# Run a script
fradual script.fu

# Disassemble bytecode to console
fradual --disasm script.fu

# Show version
fradual --version
```

---

## Real-World Examples

Check out the [`examples/`](examples/) directory for production recipes:
- `05_rule_engine.ts`: E-commerce promotion and VIP loyalty rule evaluator.
- `06_safe_calc.ts`: Safe financial mortgage calculator & custom math formula engine.

---

## Package Distribution & Compatibility

- **Node.js**: Version 18.0.0 or later.
- **Runtimes**: Fully compatible with Node.js, Bun, Deno, and modern browsers (Vite, Webpack, esbuild).
- **TypeScript**: First-class type definitions (`dist/index.d.ts`) included out of the box.
- **Tree-Shaking**: `"sideEffects": false` declared in `package.json`.

---

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.
