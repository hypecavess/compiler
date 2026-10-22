import { OpCode } from './chunk.js';
import {
    NativeFn,
    ObjArray,
    ObjClass,
    ObjClosure,
    ObjFunction,
    ObjInstance,
    ObjMap,
    ObjNative,
    ObjUpvalue,
    Value,
    valueToString,
} from './object.js';
import { Diagnostic } from './diagnostic.js';
import { verifyBytecode } from './verifier.js';

export enum InterpretResult {
    OK,
    COMPILE_ERROR,
    RUNTIME_ERROR,
}

export interface VMOptions {
    /**
     * Maximum wall-clock execution time in milliseconds for Fradual bytecode.
     * Defaults to 5000ms.
     *
     * IMPORTANT BOUNDARY NOTE:
     * This timeout is evaluated between VM bytecode instruction dispatches.
     * If a host native function runs a blocking synchronous loop inside JavaScript,
     * the single-threaded JS runtime cannot interrupt that function until it returns.
     * For full preemption against hostile synchronous natives, run the engine
     * inside a Worker thread (`node:worker_threads` or Web Worker).
     */
    maxExecutionMs?: number;
    /**
     * Maximum number of bytecode instructions per `interpret()` call.
     * Provides a deterministic instruction budget and intra-VM execution boundary.
     * Guarantees that identical bytecode executes the exact same number of bytecode
     * dispatch cycles across all machines. Note: this applies strictly to VM opcodes;
     * host execution time, host memory allocations, and host native callback durations are non-deterministic.
     * Defaults to unlimited.
     */
    maxInstructions?: number;
    /** Maximum call frame depth. Defaults to 256. */
    maxFrames?: number;
    /** Maximum value stack size. Defaults to 16384. */
    maxStackSize?: number;
    /**
     * Maximum depth for host native re-entrant calls (Script -> Host Native -> Script -> ...).
     * Distinguishes host re-entrancy from the script's internal call stack (`maxFrames`).
     * Defaults to 32.
     */
    maxReentrantDepth?: number;
    /** Receives the output of `print` statements. Defaults to `console.log`. */
    onPrint?: (text: string) => void;
    /**
     * Optional AbortSignal for cooperative cancellation from the host.
     * When signaled, bytecode execution halts immediately and produces a runtime error.
     */
    abortSignal?: AbortSignal | undefined;
}

class CallFrame {
    closure: ObjClosure;
    ip: number = 0;
    slots: number = 0;

    constructor(closure: ObjClosure, slots: number) {
        this.closure = closure;
        this.slots = slots;
    }
}

export class VM {
    frames: CallFrame[] = [];
    frameCount: number = 0;
    stack: Value[] = [];
    globals: Map<string, Value> = new Map();
    openUpvalues: ObjUpvalue | null = null;

    /** The runtime error from the most recent `interpret()` call, if any. */
    lastError: Diagnostic | null = null;
    /** The value returned by top-level code in the most recent `interpret()` call. */
    lastResult: Value = null;

    private static readonly DEFAULT_MAX_FRAMES = 256;
    private static readonly DEFAULT_MAX_STACK_SIZE = 16384;
    private static readonly DEFAULT_MAX_EXECUTION_TIME_MS = 5000;
    private static readonly DEFAULT_MAX_REENTRANT_DEPTH = 32;
    private static readonly TIMEOUT_CHECK_INTERVAL = 1024;

    private readonly maxFrames: number;
    private readonly maxStackSize: number;
    private readonly maxExecutionMs: number;
    private readonly maxInstructions: number;
    private readonly maxReentrantDepth: number;
    private readonly onPrint: (text: string) => void;
    private abortSignal?: AbortSignal | undefined;
    private isAborted: boolean = false;
    private abortReason: string = 'Execution aborted.';
    private startTime: number = 0;
    private instructionCount: number = 0;

    private readonly executionContextStack: {
        frames: CallFrame[];
        frameCount: number;
        stack: Value[];
        openUpvalues: ObjUpvalue | null;
        startTime: number;
    }[] = [];

    constructor(options: VMOptions = {}) {
        this.maxFrames = options.maxFrames ?? VM.DEFAULT_MAX_FRAMES;
        this.maxStackSize = options.maxStackSize ?? VM.DEFAULT_MAX_STACK_SIZE;
        this.maxExecutionMs = options.maxExecutionMs ?? VM.DEFAULT_MAX_EXECUTION_TIME_MS;
        this.maxInstructions = options.maxInstructions ?? Infinity;
        this.maxReentrantDepth = options.maxReentrantDepth ?? VM.DEFAULT_MAX_REENTRANT_DEPTH;
        this.onPrint = options.onPrint ?? ((text) => console.log(text));
        this.abortSignal = options.abortSignal;

        this.defineNative('clock', 0, (_args: Value[]) => {
            return Date.now() / 1000;
        });
        this.defineNative('len', 1, (args: Value[]) => {
            const arg = args[0];
            if (arg instanceof ObjArray) return arg.elements.length;
            if (arg instanceof ObjMap) return arg.entries.size;
            if (typeof arg === 'string') return arg.length;
            throw new TypeError("Argument to 'len' must be an array, map, or string.");
        });
        this.defineNative('push', 2, (args: Value[]) => {
            const arr = args[0];
            const val = args[1];
            if (!(arr instanceof ObjArray)) {
                throw new TypeError("First argument to 'push' must be an array.");
            }
            arr.elements.push(val ?? null);
            return val ?? null;
        });
        this.defineNative('pop', 1, (args: Value[]) => {
            const arr = args[0];
            if (!(arr instanceof ObjArray)) {
                throw new TypeError("Argument to 'pop' must be an array.");
            }
            return arr.elements.pop() ?? null;
        });
    }

    /**
     * Registers a host function callable from scripts.
     * Use `arity: -1` for a variadic function. Exceptions thrown by `fn`
     * become script runtime errors and never escape the VM.
     */
    defineNative(name: string, arity: number, fn: NativeFn): void {
        this.globals.set(name, new ObjNative(name, arity, fn));
    }

    setGlobal(name: string, value: Value): void {
        this.globals.set(name, value);
    }

    getGlobal(name: string): Value | undefined {
        return this.globals.get(name);
    }

    abort(reason: string = 'Execution aborted.'): void {
        this.isAborted = true;
        this.abortReason = reason;
    }

    /** Sets or replaces the AbortSignal on this VM. */
    setAbortSignal(signal?: AbortSignal): void {
        this.abortSignal = signal;
    }

    /**
     * Resets the abort state so the VM instance can be reused for another run.
     * - Resets internal `isAborted` flag and reason.
     * - If `newSignal` is provided, it replaces the current abortSignal.
     * - If no new signal is provided and the existing abortSignal is already aborted,
     *   it automatically detaches the stale signal so the VM is not stuck in an aborted state.
     */
    resetAbort(newSignal?: AbortSignal): void {
        this.isAborted = false;
        this.abortReason = 'Execution aborted.';
        if (newSignal !== undefined) {
            this.abortSignal = newSignal;
        } else if (this.abortSignal?.aborted) {
            this.abortSignal = undefined;
        }
    }

    interpret(function_: ObjFunction): InterpretResult {
        const verifyDiagnostics = verifyBytecode(function_);
        if (verifyDiagnostics.length > 0) {
            this.lastError = verifyDiagnostics[0]!;
            return InterpretResult.COMPILE_ERROR;
        }

        // If engine was already aborted prior to starting this execution:
        if (this.isAborted || this.abortSignal?.aborted) {
            const reason = this.isAborted
                ? this.abortReason
                : typeof this.abortSignal?.reason === 'string'
                  ? this.abortSignal.reason
                  : 'Execution aborted.';
            this.lastError = {
                kind: 'runtime',
                message: reason,
                line: 0,
            };
            return InterpretResult.RUNTIME_ERROR;
        }

        if (this.executionContextStack.length >= this.maxReentrantDepth) {
            this.lastError = {
                kind: 'runtime',
                message: `Maximum re-entrant execution depth (${this.maxReentrantDepth}) exceeded.`,
                line: 0,
            };
            return InterpretResult.RUNTIME_ERROR;
        }

        // Save outer execution context if currently re-entrant
        const isReentrant = this.frameCount > 0;
        if (isReentrant) {
            this.executionContextStack.push({
                frames: [...this.frames],
                frameCount: this.frameCount,
                stack: [...this.stack],
                openUpvalues: this.openUpvalues,
                startTime: this.startTime,
            });
        } else {
            this.instructionCount = 0;
            this.startTime = Date.now();
            this.executionContextStack.length = 0;
        }

        this.frames = [];
        this.frameCount = 0;
        this.stack = [];
        this.openUpvalues = null;
        this.lastError = null;
        this.lastResult = null;

        const closure = new ObjClosure(function_);
        this.push(closure);
        this.frames[this.frameCount++] = new CallFrame(closure, 0);

        try {
            return this.run();
        } catch (err) {
            // Defensive: internal VM faults (e.g. stack underflow/overflow) must
            // never escape as uncaught exceptions to the host process.
            this.runtimeError(err instanceof Error ? err.message : String(err));
            return InterpretResult.RUNTIME_ERROR;
        } finally {
            if (isReentrant && this.executionContextStack.length > 0) {
                const saved = this.executionContextStack.pop()!;
                this.frames = saved.frames;
                this.frameCount = saved.frameCount;
                this.stack = saved.stack;
                this.openUpvalues = saved.openUpvalues;
                this.startTime = saved.startTime;
            }
        }
    }

    private runtimeError(message: string): void {
        const stack: { function: string | null; line: number }[] = [];
        for (let i = this.frameCount - 1; i >= 0; i--) {
            const frame = this.frames[i];
            if (!frame) continue;
            const fn = frame.closure.function;
            const line = fn.chunk.lines[Math.max(0, frame.ip - 1)] ?? 0;
            stack.push({ function: fn.name || null, line });
        }
        this.lastError = {
            kind: 'runtime',
            message,
            line: stack[0]?.line ?? 0,
            stack,
        };
    }

    private run(): InterpretResult {
        let frame = this.frames[this.frameCount - 1];
        if (!frame) {
            this.runtimeError('No active call frame.');
            return InterpretResult.RUNTIME_ERROR;
        }

        for (;;) {
            if (this.isAborted || this.abortSignal?.aborted) {
                const reason = this.isAborted
                    ? this.abortReason
                    : typeof this.abortSignal?.reason === 'string'
                      ? this.abortSignal.reason
                      : 'Execution aborted.';
                this.runtimeError(reason);
                return InterpretResult.RUNTIME_ERROR;
            }

            if (this.instructionCount >= this.maxInstructions) {
                this.runtimeError(
                    `Instruction limit exceeded (${this.maxInstructions} instructions).`,
                );
                return InterpretResult.RUNTIME_ERROR;
            }
            if (
                (this.instructionCount++ & (VM.TIMEOUT_CHECK_INTERVAL - 1)) === 0 &&
                Date.now() - this.startTime > this.maxExecutionMs
            ) {
                this.runtimeError(`Execution time limit exceeded (${this.maxExecutionMs} ms).`);
                return InterpretResult.RUNTIME_ERROR;
            }

            const instruction = this.readByte(frame);
            if (instruction === undefined) {
                this.runtimeError('Corrupted bytecode: unexpected end of chunk.');
                return InterpretResult.RUNTIME_ERROR;
            }

            switch (instruction) {
                case OpCode.OP_CONSTANT: {
                    const constantIndex = this.readShort(frame);
                    if (constantIndex === undefined) {
                        this.runtimeError('Corrupted bytecode: missing constant operand.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    const constant = frame.closure.function.chunk.constants[constantIndex];
                    if (constant === undefined) {
                        this.runtimeError(
                            `Corrupted bytecode: invalid constant index ${constantIndex}.`,
                        );
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    this.push(constant);
                    break;
                }
                case OpCode.OP_NIL:
                    this.push(null);
                    break;
                case OpCode.OP_TRUE:
                    this.push(true);
                    break;
                case OpCode.OP_FALSE:
                    this.push(false);
                    break;

                case OpCode.OP_POP:
                    this.pop();
                    break;

                case OpCode.OP_GET_LOCAL: {
                    const slot = this.readByte(frame);
                    if (slot === undefined) {
                        this.runtimeError('Corrupted bytecode: missing local slot operand.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    const val = this.stack[frame.slots + slot];
                    if (val === undefined) {
                        this.runtimeError(`Invalid local slot ${slot}.`);
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    this.push(val);
                    break;
                }

                case OpCode.OP_SET_LOCAL: {
                    const slot = this.readByte(frame);
                    if (slot === undefined) {
                        this.runtimeError('Corrupted bytecode: missing local slot operand.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    const target = frame.slots + slot;
                    if (target < 0 || target >= this.stack.length) {
                        this.runtimeError(`Invalid local slot ${slot}.`);
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    this.stack[target] = this.peek(0);
                    break;
                }

                case OpCode.OP_GET_GLOBAL: {
                    const name = this.readConstantName(frame);
                    if (name === undefined) return InterpretResult.RUNTIME_ERROR;

                    if (!this.globals.has(name)) {
                        this.runtimeError(`Undefined variable '${name}'.`);
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    this.push(this.globals.get(name)!);
                    break;
                }

                case OpCode.OP_DEFINE_GLOBAL: {
                    const name = this.readConstantName(frame);
                    if (name === undefined) return InterpretResult.RUNTIME_ERROR;

                    this.globals.set(name, this.pop());
                    break;
                }

                case OpCode.OP_SET_GLOBAL: {
                    const name = this.readConstantName(frame);
                    if (name === undefined) return InterpretResult.RUNTIME_ERROR;

                    if (!this.globals.has(name)) {
                        this.runtimeError(`Undefined variable '${name}'.`);
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    this.globals.set(name, this.peek(0));
                    break;
                }

                case OpCode.OP_EQUAL: {
                    const b = this.pop();
                    const a = this.pop();
                    this.push(a === b);
                    break;
                }
                case OpCode.OP_GREATER: {
                    const b = this.pop();
                    const a = this.pop();
                    if (typeof a === 'number' && typeof b === 'number') {
                        this.push(a > b);
                    } else {
                        this.runtimeError('Operands must be numbers.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    break;
                }
                case OpCode.OP_LESS: {
                    const b = this.pop();
                    const a = this.pop();
                    if (typeof a === 'number' && typeof b === 'number') {
                        this.push(a < b);
                    } else {
                        this.runtimeError('Operands must be numbers.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    break;
                }

                case OpCode.OP_ADD: {
                    const b = this.pop();
                    const a = this.pop();
                    if (typeof a === 'string' || typeof b === 'string') {
                        this.push(valueToString(a) + valueToString(b));
                    } else if (typeof a === 'number' && typeof b === 'number') {
                        this.push(a + b);
                    } else {
                        this.runtimeError('Operands must be two numbers or at least one string.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    break;
                }
                case OpCode.OP_MODULO: {
                    const b = this.pop();
                    const a = this.pop();
                    if (typeof a !== 'number' || typeof b !== 'number') {
                        this.runtimeError('Operands must be numbers.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    this.push(a % b);
                    break;
                }
                case OpCode.OP_SUBTRACT: {
                    const b = this.pop();
                    const a = this.pop();
                    if (typeof a !== 'number' || typeof b !== 'number') {
                        this.runtimeError('Operands must be numbers.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    this.push(a - b);
                    break;
                }
                case OpCode.OP_MULTIPLY: {
                    const b = this.pop();
                    const a = this.pop();
                    if (typeof a !== 'number' || typeof b !== 'number') {
                        this.runtimeError('Operands must be numbers.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    this.push(a * b);
                    break;
                }
                case OpCode.OP_DIVIDE: {
                    const b = this.pop();
                    const a = this.pop();
                    if (typeof a !== 'number' || typeof b !== 'number') {
                        this.runtimeError('Operands must be numbers.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    this.push(a / b);
                    break;
                }
                case OpCode.OP_NOT: {
                    const val = this.pop();
                    this.push(!val);
                    break;
                }
                case OpCode.OP_NEGATE: {
                    const val = this.peek(0);
                    if (typeof val !== 'number') {
                        this.runtimeError('Operand must be a number.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    this.pop();
                    this.push(-val);
                    break;
                }

                case OpCode.OP_PRINT: {
                    this.onPrint(valueToString(this.pop()));
                    break;
                }

                case OpCode.OP_JUMP: {
                    const offset = this.readShort(frame);
                    if (offset === undefined) {
                        this.runtimeError('Corrupted bytecode: missing jump offset.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    frame.ip += offset;
                    break;
                }
                case OpCode.OP_JUMP_IF_FALSE: {
                    const offset = this.readShort(frame);
                    if (offset === undefined) {
                        this.runtimeError('Corrupted bytecode: missing jump offset.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    if (!this.peek(0)) frame.ip += offset;
                    break;
                }
                case OpCode.OP_LOOP: {
                    const offset = this.readShort(frame);
                    if (offset === undefined) {
                        this.runtimeError('Corrupted bytecode: missing loop offset.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    frame.ip -= offset;
                    break;
                }

                case OpCode.OP_CALL: {
                    const argCount = this.readByte(frame);
                    if (argCount === undefined) {
                        this.runtimeError('Corrupted bytecode: missing argument count.');
                        return InterpretResult.RUNTIME_ERROR;
                    }

                    const callee = this.peek(argCount);

                    if (callee instanceof ObjNative) {
                        if (this.isAborted || this.abortSignal?.aborted) {
                            const reason = this.isAborted
                                ? this.abortReason
                                : typeof this.abortSignal?.reason === 'string'
                                  ? this.abortSignal.reason
                                  : 'Execution aborted.';
                            this.runtimeError(reason);
                            return InterpretResult.RUNTIME_ERROR;
                        }

                        if (callee.arity >= 0 && argCount != callee.arity) {
                            this.runtimeError(
                                `Expected ${callee.arity} arguments but got ${argCount}.`,
                            );
                            return InterpretResult.RUNTIME_ERROR;
                        }
                        const args = this.stack.slice(this.stack.length - argCount);
                        let result: Value;
                        try {
                            // Never let a host-side exception escape the VM sandbox.
                            result = callee.function(args);
                        } catch (err) {
                            this.runtimeError(err instanceof Error ? err.message : String(err));
                            return InterpretResult.RUNTIME_ERROR;
                        }

                        if (this.isAborted || this.abortSignal?.aborted) {
                            const reason = this.isAborted
                                ? this.abortReason
                                : typeof this.abortSignal?.reason === 'string'
                                  ? this.abortSignal.reason
                                  : 'Execution aborted.';
                            this.runtimeError(reason);
                            return InterpretResult.RUNTIME_ERROR;
                        }

                        this.stack.length -= argCount + 1;
                        this.push(result === undefined ? null : result);
                        break;
                    }

                    if (callee instanceof ObjClass) {
                        if (argCount !== 0) {
                            this.runtimeError(`Expected 0 arguments but got ${argCount}.`);
                            return InterpretResult.RUNTIME_ERROR;
                        }
                        const instance = new ObjInstance(callee);
                        if (this.stack.length - 1 < 0) {
                            this.runtimeError('Stack underflow during class instantiation.');
                            return InterpretResult.RUNTIME_ERROR;
                        }
                        this.stack[this.stack.length - 1] = instance;
                        break;
                    }

                    if (callee instanceof ObjClosure) {
                        if (argCount != callee.function.arity) {
                            this.runtimeError(
                                `Expected ${callee.function.arity} arguments but got ${argCount}.`,
                            );
                            return InterpretResult.RUNTIME_ERROR;
                        }

                        if (this.frameCount === this.maxFrames) {
                            this.runtimeError(`Stack overflow (max call depth ${this.maxFrames}).`);
                            return InterpretResult.RUNTIME_ERROR;
                        }

                        const newFrame = new CallFrame(callee, this.stack.length - argCount - 1);
                        this.frames[this.frameCount++] = newFrame;
                        frame = newFrame;
                        break;
                    }

                    this.runtimeError('Can only call functions and classes.');
                    return InterpretResult.RUNTIME_ERROR;
                }

                case OpCode.OP_RETURN: {
                    const result = this.pop();
                    this.closeUpvalues(frame.slots);
                    this.frameCount--;
                    if (this.frameCount === 0) {
                        this.pop();
                        this.lastResult = result;
                        return InterpretResult.OK;
                    }

                    if (!this.frames[this.frameCount]) {
                        this.runtimeError('Corrupted call stack.');
                        return InterpretResult.RUNTIME_ERROR;
                    }

                    this.stack.length = this.frames[this.frameCount]!.slots;
                    this.push(result);
                    frame = this.frames[this.frameCount - 1];
                    if (!frame) {
                        this.runtimeError('Corrupted call stack.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    break;
                }

                case OpCode.OP_CLASS: {
                    const name = this.readConstantName(frame);
                    if (name === undefined) return InterpretResult.RUNTIME_ERROR;

                    const klass = new ObjClass(name);
                    this.push(klass);
                    break;
                }

                case OpCode.OP_GET_PROPERTY: {
                    const name = this.readConstantName(frame);
                    if (name === undefined) return InterpretResult.RUNTIME_ERROR;

                    const instance = this.peek(0);

                    if (instance instanceof ObjMap) {
                        this.pop();
                        this.push(instance.entries.get(name) ?? null);
                        break;
                    }

                    if (!(instance instanceof ObjInstance)) {
                        this.runtimeError('Only instances and maps have properties.');
                        return InterpretResult.RUNTIME_ERROR;
                    }

                    if (instance.fields.has(name)) {
                        this.pop();
                        this.push(instance.fields.get(name)!);
                    } else {
                        this.runtimeError(`Undefined property '${name}'.`);
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    break;
                }

                case OpCode.OP_SET_PROPERTY: {
                    const name = this.readConstantName(frame);
                    if (name === undefined) return InterpretResult.RUNTIME_ERROR;

                    const instance = this.peek(1);

                    if (instance instanceof ObjMap) {
                        const value = this.pop();
                        instance.entries.set(name, value);
                        this.pop();
                        this.push(value);
                        break;
                    }

                    if (!(instance instanceof ObjInstance)) {
                        this.runtimeError('Only instances and maps have fields.');
                        return InterpretResult.RUNTIME_ERROR;
                    }

                    const value = this.pop();
                    instance.fields.set(name, value);
                    this.pop();
                    this.push(value);
                    break;
                }

                case OpCode.OP_CLOSURE: {
                    const constantIndex = this.readShort(frame);
                    if (constantIndex === undefined) {
                        this.runtimeError('Corrupted bytecode: missing closure operand.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    const func = frame.closure.function.chunk.constants[constantIndex];
                    if (!(func instanceof ObjFunction)) {
                        this.runtimeError(
                            'Corrupted bytecode: closure constant is not a function.',
                        );
                        return InterpretResult.RUNTIME_ERROR;
                    }

                    const closure = new ObjClosure(func);
                    this.push(closure);

                    for (let i = 0; i < func.upvalueCount; i++) {
                        const isLocal = this.readByte(frame);
                        const index = this.readByte(frame);
                        if (isLocal === undefined || index === undefined) {
                            this.runtimeError('Corrupted bytecode: missing upvalue operands.');
                            return InterpretResult.RUNTIME_ERROR;
                        }

                        if (isLocal) {
                            closure.upvalues.push(this.captureUpvalue(frame.slots + index));
                        } else {
                            if (index >= frame.closure.upvalues.length) {
                                this.runtimeError(`Invalid upvalue index ${index}.`);
                                return InterpretResult.RUNTIME_ERROR;
                            }
                            closure.upvalues.push(frame.closure.upvalues[index]!);
                        }
                    }
                    break;
                }

                case OpCode.OP_GET_UPVALUE: {
                    const slot = this.readByte(frame);
                    if (slot === undefined) {
                        this.runtimeError('Corrupted bytecode: missing upvalue slot.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    if (slot >= frame.closure.upvalues.length) {
                        this.runtimeError(`Invalid upvalue slot ${slot}.`);
                        return InterpretResult.RUNTIME_ERROR;
                    }

                    const upvalue = frame.closure.upvalues[slot];
                    if (!upvalue) {
                        this.runtimeError(`Invalid upvalue slot ${slot}.`);
                        return InterpretResult.RUNTIME_ERROR;
                    }

                    if (upvalue.location !== -1) {
                        if (upvalue.location < 0 || upvalue.location >= this.stack.length) {
                            this.runtimeError('Corrupted upvalue stack location.');
                            return InterpretResult.RUNTIME_ERROR;
                        }
                        this.push(this.stack[upvalue.location]!);
                    } else {
                        this.push(upvalue.closed);
                    }
                    break;
                }

                case OpCode.OP_SET_UPVALUE: {
                    const slot = this.readByte(frame);
                    if (slot === undefined) {
                        this.runtimeError('Corrupted bytecode: missing upvalue slot.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    if (slot >= frame.closure.upvalues.length) {
                        this.runtimeError(`Invalid upvalue slot ${slot}.`);
                        return InterpretResult.RUNTIME_ERROR;
                    }

                    const upvalue = frame.closure.upvalues[slot];
                    if (!upvalue) {
                        this.runtimeError(`Invalid upvalue slot ${slot}.`);
                        return InterpretResult.RUNTIME_ERROR;
                    }

                    const value = this.peek(0);
                    if (upvalue.location === -1) {
                        upvalue.closed = value;
                    } else {
                        if (upvalue.location < 0 || upvalue.location >= this.stack.length) {
                            this.runtimeError('Corrupted upvalue stack location.');
                            return InterpretResult.RUNTIME_ERROR;
                        }
                        this.stack[upvalue.location] = value;
                    }
                    break;
                }

                case OpCode.OP_CLOSE_UPVALUE: {
                    this.closeUpvalues(this.stack.length - 1);
                    this.pop();
                    break;
                }

                case OpCode.OP_ARRAY: {
                    const count = this.readShort(frame);
                    if (count === undefined) {
                        this.runtimeError('Corrupted bytecode: missing array element count.');
                        return InterpretResult.RUNTIME_ERROR;
                    }

                    const elements = [];
                    for (let i = 0; i < count; i++) {
                        elements.push(this.peek(count - 1 - i));
                    }
                    this.stack.length -= count;
                    const array = new ObjArray(elements);
                    this.push(array);
                    break;
                }

                case OpCode.OP_MAP: {
                    const count = this.readShort(frame);
                    if (count === undefined) {
                        this.runtimeError('Corrupted bytecode: missing map entry count.');
                        return InterpretResult.RUNTIME_ERROR;
                    }

                    const map = new ObjMap();
                    const entries: [string, Value][] = [];
                    for (let i = 0; i < count; i++) {
                        const value = this.pop();
                        const key = this.pop();
                        if (typeof key !== 'string') {
                            this.runtimeError('Map keys must be strings.');
                            return InterpretResult.RUNTIME_ERROR;
                        }
                        entries.push([key, value]);
                    }
                    for (let i = entries.length - 1; i >= 0; i--) {
                        const [k, v] = entries[i]!;
                        map.entries.set(k, v);
                    }
                    this.push(map);
                    break;
                }

                case OpCode.OP_INDEX_GET: {
                    const index = this.pop();
                    const object = this.pop();

                    if (object instanceof ObjMap) {
                        if (typeof index !== 'string') {
                            this.runtimeError('Map index must be a string.');
                            return InterpretResult.RUNTIME_ERROR;
                        }
                        this.push(object.entries.get(index) ?? null);
                        break;
                    }

                    if (!(object instanceof ObjArray)) {
                        this.runtimeError('Only arrays and maps can be indexed.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    if (typeof index !== 'number' || !Number.isInteger(index)) {
                        this.runtimeError('Array index must be an integer.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    if (index < 0 || index >= object.elements.length) {
                        this.runtimeError(
                            `Array index ${index} out of bounds (length ${object.elements.length}).`,
                        );
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    this.push(object.elements[index] ?? null);
                    break;
                }

                case OpCode.OP_INDEX_SET: {
                    const value = this.pop();
                    const index = this.pop();
                    const object = this.pop();

                    if (object instanceof ObjMap) {
                        if (typeof index !== 'string') {
                            this.runtimeError('Map index must be a string.');
                            return InterpretResult.RUNTIME_ERROR;
                        }
                        object.entries.set(index, value);
                        this.push(value);
                        break;
                    }

                    if (!(object instanceof ObjArray)) {
                        this.runtimeError('Only arrays and maps can be indexed.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    if (typeof index !== 'number' || !Number.isInteger(index)) {
                        this.runtimeError('Array index must be an integer.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    if (index < 0 || index >= object.elements.length) {
                        this.runtimeError(
                            `Array index ${index} out of bounds (length ${object.elements.length}).`,
                        );
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    object.elements[index] = value;
                    this.push(value);
                    break;
                }

                default: {
                    this.runtimeError(`Unknown opcode ${instruction}.`);
                    return InterpretResult.RUNTIME_ERROR;
                }
            }
        }
    }

    // Helper to accept byte securely
    private readByte(frame: CallFrame): number | undefined {
        const val = frame.closure.function.chunk.code[frame.ip++];
        return val;
    }

    private readShort(frame: CallFrame): number | undefined {
        const high = frame.closure.function.chunk.code[frame.ip++];
        const low = frame.closure.function.chunk.code[frame.ip++];
        if (high === undefined || low === undefined) return undefined;
        return (high << 8) | low;
    }

    /** Reads a 16-bit constant operand and validates that it names a string constant. */
    private readConstantName(frame: CallFrame): string | undefined {
        const constantIndex = this.readShort(frame);
        if (constantIndex === undefined) {
            this.runtimeError('Corrupted bytecode: missing constant operand.');
            return undefined;
        }
        const name = frame.closure.function.chunk.constants[constantIndex];
        if (typeof name !== 'string') {
            this.runtimeError(`Corrupted bytecode: constant ${constantIndex} is not a name.`);
            return undefined;
        }
        return name;
    }

    private captureUpvalue(local: number): ObjUpvalue {
        let prevUpvalue: ObjUpvalue | null = null;
        let upvalue = this.openUpvalues;

        while (upvalue != null && upvalue.location > local) {
            prevUpvalue = upvalue;
            upvalue = upvalue.next;
        }

        if (upvalue != null && upvalue.location === local) {
            return upvalue;
        }

        const createdUpvalue = new ObjUpvalue(local);
        createdUpvalue.next = upvalue;

        if (prevUpvalue == null) {
            this.openUpvalues = createdUpvalue;
        } else {
            prevUpvalue.next = createdUpvalue;
        }

        return createdUpvalue;
    }

    private closeUpvalues(last: number) {
        while (this.openUpvalues != null && this.openUpvalues.location >= last) {
            const upvalue = this.openUpvalues;
            const val = this.stack[upvalue.location];
            upvalue.closed = val ?? null;
            upvalue.location = -1;
            this.openUpvalues = upvalue.next;
        }
    }

    private push(value: Value) {
        if (this.stack.length >= this.maxStackSize) {
            throw new RangeError(`Value stack overflow (max ${this.maxStackSize}).`);
        }
        this.stack.push(value);
    }

    private pop(): Value {
        const value = this.stack.pop();
        if (value === undefined) {
            throw new Error('Stack underflow.');
        }
        return value;
    }

    private peek(distance: number): Value {
        return this.stack[this.stack.length - 1 - distance]!;
    }
}
