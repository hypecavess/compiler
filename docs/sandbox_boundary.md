# Fradual Sandbox Boundary & Security Architecture

This document provides a technical specification of the security boundaries, data conversion contracts, and isolation guarantees implemented by the **Fradual** virtual machine and compiler.

---

## 1. Threat Model & Design Goals

Fradual is designed to execute **untrusted user-provided scripts**, business rules, and mathematical formulas within a JavaScript / TypeScript host environment (Node.js, Bun, Deno, Cloudflare Workers, or modern web browsers).

### Primary Attack Vectors Mitigated:
1. **Host Escape & Prototype Pollution:** Attempts to reach host globals (`process`, `require`, `Function`, `globalThis`) or mutate `Object.prototype` via `__proto__`, `.constructor`, or prototype chains.
2. **Denial of Service (DoS):** Runaway infinite loops (`while(true){}`) or unbounded recursion causing host call-stack exhaustion.
3. **Memory Exhaustion:** Unchecked allocation loops creating massive arrays or strings.
4. **Host Crash from Exceptions:** Host native functions throwing errors that bubble up as uncaught exceptions and crash the host process.
5. **Corrupted Bytecode Injection:** Synthetic or truncated bytecode chunks causing out-of-bounds array reads or memory corruption in the VM.

---

## 2. Value Crossing Semantics (Bridge Contract)

The boundary between the host JavaScript environment and the Fradual virtual machine is mediated by [toValue()](file:///c:/Users/nomnones/Desktop/Compiler/compiler/src/fradual.ts#L82) (Host → Fradual) and [fromValue()](file:///c:/Users/nomnones/Desktop/Compiler/compiler/src/fradual.ts#L127) (Fradual → Host).

### 2.1 Host to Fradual (`toValue`)
- **Primitives (`number`, `string`, `boolean`, `null`, `undefined`):**
  - Numbers, strings, and booleans are copied by value.
  - `undefined` and `null` are mapped to Fradual `nil`.
  - BigInt is coerced to `Number`.
- **Cyclic Reference Detection & Symmetric Max Depth:**
  - Cyclic structures are tracked via a `seen: Map<object, Value>` detector and preserved without infinite recursion.
  - Nesting depth is guarded by `maxDepth: 256` in both `toValue()` and `fromValue()`.
- **Structured Failure Policies (`error` | `null` | `omit`):**
  - Configurable via `ConversionOptions.failurePolicy`:
    - `'error'` (Default): Throws a structured `ConversionError` containing the exact property path (e.g. `'user.profile.balance'`) and underlying cause.
    - `'null'`: Sets unconvertible or failing properties to `null`.
    - `'omit'`: Omits the failing property entirely from the resulting map or object.
- **Arrays & Sets (`Array`, `Set`):**
  - Converted into a new `ObjArray` instance. Elements are deeply converted recursively.
- **Plain Objects & Maps (`{ ... }`, `Map`):**
  - Converted into a dedicated `ObjMap` instance.
  - Keys named `__proto__`, `constructor`, or `prototype` are explicitly filtered out.
  - Only own enumerable properties (`Object.getOwnPropertyDescriptor`) are read.
- **Host Getters & Proxies:**
  - Getters are evaluated via `desc.get.call(obj)` inside a `try/catch`. Under default policy, failing getters raise `ConversionError(path)`. Under `'null'` or `'omit'`, they degrade gracefully.
  - Prototype-chain getters (e.g. on `Object.prototype`) are never invoked because only own properties are inspected.
  - Host `Proxy` instances trapping property enumerations are guarded; traps throwing errors trigger the configured `failurePolicy`.
- **Host Functions:**
  - Wrapped as an `ObjNative` callable. Arguments are sanitized via `fromValue` before reaching the host function.
  - Exceptions thrown by host functions are caught by the VM and reported as Fradual runtime errors; they never escape to the host event loop.
- **Special Objects (`Date`, `RegExp`, `Promise`):**
  - `Date` instances are converted to ISO 8601 strings (or `null` if invalid).
  - `RegExp` instances are converted to their pattern source string.
  - Host native functions returning a `Promise` are rejected with an explicit diagnostic error (`Native returned a Promise; async natives are not supported yet`).

### 2.2 Fradual to Host (`fromValue`)
- `ObjArray` is converted into a fresh host JavaScript `Array`.
- `ObjMap` and `ObjInstance` are converted into fresh plain JavaScript objects (`{}`).
- Any map entry whose key is `"__proto__"` is defined using `Object.defineProperty` with `enumerable: true, writable: true`, ensuring host `Object.prototype` is never poisoned.
- Cyclic references inside Fradual structures are detected and preserved during export via `seen: Map<object, unknown>`.
- Symmetrically honors `maxDepth` and `failurePolicy`.

---

## 3. Resource Governance & Limits

| Parameter | Type | Default | Description |
|---|---|---|---|
| `maxInstructions` | `number` | `Infinity` | Deterministic instruction budget for intra-VM bytecode execution. Counts opcode dispatches. Shared and accumulated across nested re-entrant script executions. Does not govern host wall-clock time or host native operations. |
| `maxExecutionMs` | `number` | `5000` | Wall-clock execution timeout in milliseconds. Checked between bytecode instruction dispatches. |
| `maxFrames` | `number` | `256` | Maximum call stack depth within Fradual script function calls (`fun f() { f(); }`). Prevents host V8 call-stack exhaustion. |
| `maxStackSize` | `number` | `16384` | Maximum operand stack depth. Protects against operand stack exhaustion. |
| `maxReentrantDepth` | `number` | `32` | Maximum depth for host native re-entrant calls (`Script -> Host Native -> Script -> ...`). Strictly isolated from `maxFrames`. |
| `abortSignal` | `AbortSignal` | `undefined` | Standard Web API AbortSignal for cooperative external cancellation. |

### Cooperative Cancellation & Reset Contract
Host applications can cancel running or pending scripts cooperatively via standard `AbortSignal` or the `engine.abort()` API:

```typescript
const controller = new AbortController();
const engine = new Fradual({ abortSignal: controller.signal });

// Cancel execution from another event / timeout:
setTimeout(() => controller.abort('Execution cancelled'), 50);

const result = engine.run(untrustedScript);
if (!result.ok) {
    // result.diagnostics contains 'Execution cancelled'
}

// Re-using the engine after cancellation:
// resetAbort() resets the engine's internal isAborted flag AND automatically detaches
// stale aborted signals so the engine is not permanently locked.
engine.resetAbort();

// Or attach a fresh AbortSignal for the next run:
const newController = new AbortController();
engine.resetAbort(newController.signal);
```

#### `resetAbort()` State Matrix & API Contract:

| State Scenario | Action / Call | Resulting Engine State | Next `run()` Behavior |
|---|---|---|---|
| Engine's internal flag active (`engine.abort()`) | `engine.resetAbort()` | `isAborted = false`, reason reset | Runs cleanly |
| Attached `AbortSignal` aborted, no new signal | `engine.resetAbort()` | Stale signal detached (`abortSignal = undefined`) | Runs cleanly |
| Fresh (untriggered) `AbortSignal` provided | `engine.resetAbort(freshSignal)` | `abortSignal = freshSignal`, `isAborted = false` | Runs, governed by new signal |
| **Already-aborted `AbortSignal` provided** | `engine.resetAbort(deadSignal)` | `abortSignal = deadSignal` (`aborted: true`) | **Rejects execution immediately** with dead signal reason |
| Post-error / post-abort VM state | Next `engine.run()` | All frames, stacks, and upvalues wiped | **Guaranteed pristine, zero-residual state** |

---

## 4. Inter-Instruction Cancellation & VM Re-entrancy Guarantees

Fradual's execution and cancellation model provides clear operational guarantees:

1. **Per-Instruction VM Dispatch Check (100% Frequency):**
   - The VM checks `this.isAborted` and `this.abortSignal?.aborted` at the start of **every single instruction cycle** in the main dispatch loop.
   - Any pure Fradual bytecode execution (loops, recursion, computations) is halted immediately at the very next instruction.

2. **Synchronous Host Native Execution Boundary (Inter-Instruction / Inter-Call):**
   - In V8 (Node.js, browsers), JavaScript is single-threaded.
   - When Fradual executes a call to a registered host native function (`callee.function(args)`), control leaves the Fradual interpreter loop and enters the host JS function synchronously on V8's call stack.
   - Cancellation checks are evaluated immediately **before entering** the native function and **immediately upon returning**, preventing new host calls once cancelled.
   - If a synchronous host native enters a blocking CPU loop, single-threaded V8 cannot preempt it; Worker threads (`node:worker_threads`) are recommended for untrusted host natives.

3. **Same-Engine VM Re-entrancy Architecture:**
   - Host native functions can safely invoke `engine.run()` or `vm.interpret()` on the **exact same engine instance** while an outer script is suspended.
   - **Real State Isolation:** When entering a re-entrant call, outer frames and operand stacks are preserved in `executionContextStack` as shallow-cloned array snapshots (`[...this.frames]`, `[...this.stack]`). The inner execution receives fresh arrays and cannot mutate outer registers, stack slots, or instruction pointers.
   - **Acyclic Open Upvalues:** `openUpvalues` linked lists are saved and isolated per execution level. Closures created in inner executions close over their own scopes without touching outer unclosed upvalues.
   - **Instruction Budget Accumulation:** The deterministic instruction counter (`this.instructionCount`) is **not reset** during re-entrant calls; instead, bytecode dispatches in inner scripts count against the global `maxInstructions` budget. Re-entrancy cannot be used to bypass resource governance.
   - **Recoverable Error Containment vs. Global Abort:**
     - *Script Runtime Errors (Recoverable):* An error inside an inner script (e.g. division by zero) produces a structured `RunResult { ok: false, status: 'runtime_error' }`. The host callback can inspect this and return a fallback value, allowing the outer script to proceed without corruption.
     - *Engine Aborts (Fatal/Global):* Calling `engine.abort()` or triggering an `AbortSignal` during re-entrant execution halts both inner and suspended outer executions immediately.
   - **Independent Depth Limits:** Re-entrant host nesting is governed by `maxReentrantDepth` (default: 32), completely independent of the script's internal call stack limit `maxFrames` (default: 256).

---

## 5. Bytecode Safety & Static Verification Contract

Fradual implements a two-tier safety architecture for bytecode:

### 5.1 Static Verification (`verifyBytecode`)
Before any function or closure is executed, it passes through the static bytecode verifier:
1. **Instruction Boundary Alignment:**
   - Valid instruction offsets are recorded in a hash set.
   - All jump targets (`OP_JUMP`, `OP_JUMP_IF_FALSE`, `OP_LOOP`) are verified to land **strictly on instruction boundaries**.
   - Jumps into the middle of multi-byte operands (e.g. constant pool indices or jump offsets) are detected and rejected as compile diagnostics.
2. **Operand Bounds & Type Soundness:**
   - Every opcode is checked to ensure all required operands (8-bit, 16-bit, upvalue descriptors) are fully present before EOF.
   - Constant pool indices are checked to ensure `index < chunk.constants.length`.
   - Named opcodes (`OP_GET_GLOBAL`, `OP_SET_GLOBAL`, `OP_DEFINE_GLOBAL`, `OP_GET_PROPERTY`, `OP_SET_PROPERTY`, `OP_CLASS`) statically verify that the referenced constant is a string identifier.
   - Upvalue opcodes (`OP_GET_UPVALUE`, `OP_SET_UPVALUE`) statically verify that the slot index is strictly `< fn.upvalueCount`.
3. **Closure Recursion & Descriptor Validation:**
   - Nested functions inside constant pools are recursively verified.
   - Closure upvalue descriptors (`isLocal`, `index`) verify that enclosing upvalue indices are within enclosing function upvalue bounds.

### 5.2 Runtime Defensive Bounds Checking
Even if synthetic or malformed bytecode bypasses compilation, the VM dispatch loop maintains strict defensive bounds:
- **EOF Protection:** `readByte` and `readShort` return `undefined` on unexpected EOF, triggering a clean `runtimeError` rather than an out-of-bounds array access.
- **Slot Bounds Verification:** `OP_SET_LOCAL`, `OP_GET_LOCAL`, `OP_GET_UPVALUE`, and `OP_SET_UPVALUE` verify that slot indices fall within allocated stack and upvalue bounds.
- **Stack Underflow/Overflow:** Stack operations check frame count (`maxFrames`) and operand stack limits (`maxStackSize`).

---

## 6. Error & Diagnostic Contract

Fradual adheres to a strict zero-console policy in library code:
- **No Console Writes:** Core library modules never call `console.log`, `console.warn`, or `console.error`.
- **No Process Termination:** Core modules never call `process.exit()`.
- **Structured Output:** All failures are returned as structured `Diagnostic` objects:
  ```typescript
  interface Diagnostic {
      kind: 'lexical' | 'syntax' | 'compile' | 'runtime';
      message: string;
      line: number;
      where?: string;
      stack?: StackFrameInfo[];
  }
  ```

---

## 7. In-Process Language Sandbox vs. Operating System Security Boundary

It is critical to distinguish between **intra-process language sandboxing** and **operating system isolation**:

1. **What Fradual Is:**
   - An in-process, memory-managed bytecode virtual machine executing within the host JavaScript runtime.
   - Prevents untrusted scripts from accessing host globals, constructing host objects, polluting prototypes, escaping execution limits, or causing memory crashes.
   - Restricts script capabilities strictly to explicitly exposed host natives and globals.

2. **What Fradual Is Not:**
   - Fradual is **not an OS-level hypervisor, namespace, or container jail**.
   - Because Fradual runs on the same V8 thread as the host application, registering untrusted, non-cooperative host functions (e.g. native C++ addons, third-party libraries executing blocking loops or unhandled OS system calls) compromises the host thread.
   - The host runtime's security boundary cannot be delegated solely to the VM interpreter if the host itself injects dangerous native bindings.

3. **Multi-Tenant / Untrusted Host Isolation Best Practices:**
   - For multi-tenant clouds or executing untrusted host bindings, run the Fradual instance in an isolated Node.js `worker_threads` Worker or separate child process (`child_process.fork`).
   - Use OS-level resource limits (cgroups, container memory limits) to guarantee absolute thread preemption and memory boundaries against hostile native extensions.

---

## 8. Value Conversion Policies in Security-Critical Applications

When integrating Fradual into authorization engines, billing calculators, or access control filters:

> [!CAUTION]
> **Never use `failurePolicy: 'null'` or `failurePolicy: 'omit'` in security-critical or authorization pipelines.**

- If an object property evaluation fails during conversion (e.g., throwing getter, deep nesting, or unconvertible type), `'null'` or `'omit'` silently strips the field or sets it to `null`.
- In an authorization check, a missing or null property (`if user.isAdmin` or `if permissions.canDelete`) might invert boolean logic or lead to unintended privilege escalation.
- In security-critical contexts, always use the default `failurePolicy: 'error'`. This ensures that any conversion irregularity immediately halts execution with a structured `ConversionError` identifying the exact property path.

