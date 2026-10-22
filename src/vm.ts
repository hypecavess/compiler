import { OpCode } from './chunk.js';
import {
    ObjArray,
    ObjClass,
    ObjClosure,
    ObjFunction,
    ObjInstance,
    ObjNative,
    ObjUpvalue,
    Value,
    valueToString,
} from './object.js';

export enum InterpretResult {
    OK,
    COMPILE_ERROR,
    RUNTIME_ERROR,
}

export interface VMOptions {
    /** Maximum wall-clock execution time in milliseconds. Defaults to 5000. */
    maxExecutionMs?: number;
    /** Maximum call frame depth. Defaults to 64. */
    maxFrames?: number;
    /** Maximum value stack size. Defaults to 16384. */
    maxStackSize?: number;
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

    // Security limits (defaults)
    private static readonly DEFAULT_MAX_FRAMES = 64;
    private static readonly DEFAULT_MAX_STACK_SIZE = 16384;
    private static readonly DEFAULT_MAX_EXECUTION_TIME_MS = 5000;
    // Power of two: the timeout is checked every N instructions via a bitmask.
    private static readonly TIMEOUT_CHECK_INTERVAL = 1024;

    private readonly maxFrames: number;
    private readonly maxStackSize: number;
    private readonly maxExecutionMs: number;
    private startTime: number = 0;
    private instructionCount: number = 0;

    constructor(options: VMOptions = {}) {
        this.maxFrames = options.maxFrames ?? VM.DEFAULT_MAX_FRAMES;
        this.maxStackSize = options.maxStackSize ?? VM.DEFAULT_MAX_STACK_SIZE;
        this.maxExecutionMs = options.maxExecutionMs ?? VM.DEFAULT_MAX_EXECUTION_TIME_MS;

        this.defineNative('clock', 0, (_args: Value[]) => {
            return Date.now() / 1000;
        });
        this.defineNative('len', 1, (args: Value[]) => {
            const arg = args[0];
            if (arg instanceof ObjArray) return arg.elements.length;
            if (typeof arg === 'string') return arg.length;
            throw new TypeError("Argument to 'len' must be an array or a string.");
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

    private defineNative(name: string, arity: number, function_: (args: Value[]) => Value) {
        this.globals.set(name, new ObjNative(name, arity, function_));
    }

    interpret(function_: ObjFunction): InterpretResult {
        this.frames = [];
        this.frameCount = 0;
        this.stack = [];
        this.openUpvalues = null;
        this.startTime = Date.now();
        this.instructionCount = 0;

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
        }
    }

    private runtimeError(message: string): void {
        console.error(`Runtime Error: ${message}`);
        for (let i = this.frameCount - 1; i >= 0; i--) {
            const frame = this.frames[i];
            if (!frame) continue;
            const fn = frame.closure.function;
            const line = fn.chunk.lines[Math.max(0, frame.ip - 1)] ?? 0;
            const location = fn.name ? `${fn.name}()` : 'script';
            console.error(`  [line ${line}] in ${location}`);
        }
    }

    private run(): InterpretResult {
        let frame = this.frames[this.frameCount - 1];
        if (!frame) {
            this.runtimeError('No active call frame.');
            return InterpretResult.RUNTIME_ERROR;
        }

        for (;;) {
            // Security: check for timeout periodically (Date.now() per instruction is costly).
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
                    const constantIndex = this.readByte(frame);
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
                    this.stack[frame.slots + slot] = this.peek(0);
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
                    if (typeof a === 'string' && typeof b === 'string') {
                        this.push(a + b);
                    } else if (typeof a === 'number' && typeof b === 'number') {
                        this.push(a + b);
                    } else {
                        this.runtimeError('Operands must be two numbers or two strings.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
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
                    console.log(valueToString(this.pop()));
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
                        if (argCount != callee.arity) {
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
                        this.stack.length -= argCount + 1; // Pop args and function
                        this.push(result);
                        break;
                    }

                    if (callee instanceof ObjClass) {
                        const instance = new ObjInstance(callee);
                        // replace class with instance
                        if (this.stack.length - argCount - 1 < 0) {
                            this.runtimeError('Stack underflow during class instantiation.');
                            return InterpretResult.RUNTIME_ERROR;
                        }
                        this.stack[this.stack.length - argCount - 1] = instance;
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
                        this.pop(); // Pop main script function
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

                    if (!(instance instanceof ObjInstance)) {
                        this.runtimeError('Only instances have properties.');
                        return InterpretResult.RUNTIME_ERROR;
                    }

                    if (instance.fields.has(name)) {
                        this.pop(); // Instance
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

                    if (!(instance instanceof ObjInstance)) {
                        this.runtimeError('Only instances have fields.');
                        return InterpretResult.RUNTIME_ERROR;
                    }

                    const value = this.pop();
                    instance.fields.set(name, value);
                    this.pop(); // Instance
                    this.push(value);
                    break;
                }

                case OpCode.OP_CLOSURE: {
                    const constantIndex = this.readByte(frame);
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

                    // A closed upvalue is identified by location === -1; `closed`
                    // itself may legitimately hold nil/false/0.
                    this.push(
                        upvalue.location === -1 ? upvalue.closed : this.stack[upvalue.location]!,
                    );
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
                    const count = this.readByte(frame);
                    if (count === undefined) {
                        this.runtimeError('Corrupted bytecode: missing array element count.');
                        return InterpretResult.RUNTIME_ERROR;
                    }

                    const elements = [];
                    for (let i = 0; i < count; i++) {
                        elements.push(this.peek(count - 1 - i));
                    }
                    // Pop elements
                    this.stack.length -= count;
                    const array = new ObjArray(elements);
                    this.push(array);
                    break;
                }

                case OpCode.OP_INDEX_GET: {
                    const index = this.pop();
                    const object = this.pop();

                    if (!(object instanceof ObjArray)) {
                        this.runtimeError('Only arrays can be indexed.');
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

                    if (!(object instanceof ObjArray)) {
                        this.runtimeError('Only arrays can be indexed.');
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

    /** Reads a one-byte constant operand and validates that it names a string constant. */
    private readConstantName(frame: CallFrame): string | undefined {
        const constantIndex = this.readByte(frame);
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
            upvalue.location = -1; // Invalid location
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
