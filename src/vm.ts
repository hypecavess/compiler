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
} from './object.js';

export enum InterpretResult {
    OK,
    COMPILE_ERROR,
    RUNTIME_ERROR,
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

    // Security limits
    private static readonly MAX_STACK = 64; // Keeping it small as per original code, maybe increase?
    private static readonly MAX_EXECUTION_TIME_MS = 5000; // 5 seconds timeout
    private startTime: number = 0;

    constructor() {
        this.defineNative('clock', 0, (_args: Value[]) => {
            return Date.now() / 1000;
        });
        this.defineNative('len', 1, (args: Value[]) => {
            const arg = args[0];
            if (arg instanceof ObjArray) return arg.elements.length;
            if (typeof arg === 'string') return arg.length;
            return 0;
        });
        this.defineNative('push', 2, (args: Value[]) => {
            const arr = args[0];
            const val = args[1];
            if (arr instanceof ObjArray && val !== undefined) {
                arr.elements.push(val);
                return val;
            }
            return null;
        });
        this.defineNative('pop', 1, (args: Value[]) => {
            const arr = args[0];
            if (arr instanceof ObjArray) {
                return arr.elements.pop() ?? null;
            }
            return null;
        });
    }

    private defineNative(name: string, arity: number, function_: (args: Value[]) => Value) {
        this.globals.set(name, new ObjNative(name, arity, function_));
    }

    interpret(function_: ObjFunction): InterpretResult {
        this.frames = [];
        this.frameCount = 0;
        this.stack = [];
        this.startTime = Date.now();

        const closure = new ObjClosure(function_);
        this.push(closure);
        this.frames[this.frameCount++] = new CallFrame(closure, 0);

        return this.run();
    }

    private run(): InterpretResult {
        let frame = this.frames[this.frameCount - 1];
        if (!frame) return InterpretResult.RUNTIME_ERROR;

        for (; ;) {
            // Security: Check for timeout
            if (Date.now() - this.startTime > VM.MAX_EXECUTION_TIME_MS) {
                console.error('Execution time limit exceeded.');
                return InterpretResult.RUNTIME_ERROR;
            }

            const instruction = this.readByte(frame);
            if (instruction === undefined) return InterpretResult.RUNTIME_ERROR;

            switch (instruction) {
                case OpCode.OP_CONSTANT: {
                    const constantIndex = this.readByte(frame);
                    if (constantIndex === undefined) return InterpretResult.RUNTIME_ERROR;
                    const constant = frame.closure.function.chunk.constants[constantIndex];
                    if (constant === undefined) return InterpretResult.RUNTIME_ERROR;
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
                    if (slot === undefined) return InterpretResult.RUNTIME_ERROR;
                    const val = this.stack[frame.slots + slot];
                    if (val === undefined) return InterpretResult.RUNTIME_ERROR;
                    this.push(val);
                    break;
                }

                case OpCode.OP_SET_LOCAL: {
                    const slot = this.readByte(frame);
                    if (slot === undefined) return InterpretResult.RUNTIME_ERROR;
                    this.stack[frame.slots + slot] = this.peek(0);
                    break;
                }

                case OpCode.OP_GET_GLOBAL: {
                    const constantIndex = this.readByte(frame);
                    if (constantIndex === undefined) return InterpretResult.RUNTIME_ERROR;
                    const name = frame.closure.function.chunk.constants[constantIndex];
                    if (typeof name !== 'string') return InterpretResult.RUNTIME_ERROR;

                    if (!this.globals.has(name)) {
                        console.error(`Undefined variable '${name}'.`);
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    this.push(this.globals.get(name)!);
                    break;
                }

                case OpCode.OP_DEFINE_GLOBAL: {
                    const constantIndex = this.readByte(frame);
                    if (constantIndex === undefined) return InterpretResult.RUNTIME_ERROR;
                    const name = frame.closure.function.chunk.constants[constantIndex];
                    if (typeof name !== 'string') return InterpretResult.RUNTIME_ERROR;

                    this.globals.set(name, this.pop());
                    break;
                }

                case OpCode.OP_SET_GLOBAL: {
                    const constantIndex = this.readByte(frame);
                    if (constantIndex === undefined) return InterpretResult.RUNTIME_ERROR;
                    const name = frame.closure.function.chunk.constants[constantIndex];
                    if (typeof name !== 'string') return InterpretResult.RUNTIME_ERROR;

                    if (!this.globals.has(name)) {
                        console.error(`Undefined variable '${name}'.`);
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
                        // Strict comparison or error? Original used 'any'.
                        // Let's enforce types or use generic comparison carefully.
                        // For now, runtime error if not numbers to be strict.
                        console.error('Operands must be numbers.');
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
                        console.error('Operands must be numbers.');
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
                        console.error('Operands must be two numbers or two strings.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    break;
                }
                case OpCode.OP_SUBTRACT: {
                    const b = this.pop();
                    const a = this.pop();
                    if (typeof a !== 'number' || typeof b !== 'number')
                        return InterpretResult.RUNTIME_ERROR;
                    this.push(a - b);
                    break;
                }
                case OpCode.OP_MULTIPLY: {
                    const b = this.pop();
                    const a = this.pop();
                    if (typeof a !== 'number' || typeof b !== 'number')
                        return InterpretResult.RUNTIME_ERROR;
                    this.push(a * b);
                    break;
                }
                case OpCode.OP_DIVIDE: {
                    const b = this.pop();
                    const a = this.pop();
                    if (typeof a !== 'number' || typeof b !== 'number')
                        return InterpretResult.RUNTIME_ERROR;
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
                        console.error('Operand must be a number.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    this.pop();
                    this.push(-val);
                    break;
                }

                case OpCode.OP_PRINT: {
                    console.log(this.pop());
                    break;
                }

                case OpCode.OP_JUMP: {
                    const offset = this.readShort(frame);
                    if (offset === undefined) return InterpretResult.RUNTIME_ERROR;
                    frame.ip += offset;
                    break;
                }
                case OpCode.OP_JUMP_IF_FALSE: {
                    const offset = this.readShort(frame);
                    if (offset === undefined) return InterpretResult.RUNTIME_ERROR;
                    if (!this.peek(0)) frame.ip += offset;
                    break;
                }
                case OpCode.OP_LOOP: {
                    const offset = this.readShort(frame);
                    if (offset === undefined) return InterpretResult.RUNTIME_ERROR;
                    frame.ip -= offset;
                    break;
                }

                case OpCode.OP_CALL: {
                    const argCount = this.readByte(frame);
                    if (argCount === undefined) return InterpretResult.RUNTIME_ERROR;

                    const callee = this.peek(argCount);

                    if (callee instanceof ObjNative) {
                        if (argCount != callee.arity) {
                            console.error(
                                `Expected ${callee.arity} arguments but got ${argCount}.`,
                            );
                            return InterpretResult.RUNTIME_ERROR;
                        }
                        const args = this.stack.slice(this.stack.length - argCount);
                        const result = callee.function(args);
                        this.stack.length -= argCount + 1; // Pop args and function
                        this.push(result);
                        break;
                    }

                    if (callee instanceof ObjClass) {
                        const instance = new ObjInstance(callee);
                        // replace class with instance
                        if (this.stack.length - argCount - 1 < 0)
                            return InterpretResult.RUNTIME_ERROR;
                        this.stack[this.stack.length - argCount - 1] = instance;
                        break;
                    }

                    if (callee instanceof ObjClosure) {
                        if (argCount != callee.function.arity) {
                            console.error(
                                `Expected ${callee.function.arity} arguments but got ${argCount}.`,
                            );
                            return InterpretResult.RUNTIME_ERROR;
                        }

                        if (this.frameCount === VM.MAX_STACK) {
                            console.error('Stack overflow.');
                            return InterpretResult.RUNTIME_ERROR;
                        }

                        const newFrame = new CallFrame(callee, this.stack.length - argCount - 1);
                        this.frames[this.frameCount++] = newFrame;
                        frame = newFrame;
                        break;
                    }

                    console.error('Can only call functions and classes.');
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
                        return InterpretResult.RUNTIME_ERROR;
                    }

                    this.stack.length = this.frames[this.frameCount]!.slots;
                    this.push(result);
                    frame = this.frames[this.frameCount - 1];
                    if (!frame) return InterpretResult.RUNTIME_ERROR;
                    break;
                }

                case OpCode.OP_CLASS: {
                    const constantIndex = this.readByte(frame);
                    if (constantIndex === undefined) return InterpretResult.RUNTIME_ERROR;
                    const name = frame.closure.function.chunk.constants[constantIndex];
                    if (typeof name !== 'string') return InterpretResult.RUNTIME_ERROR;

                    const klass = new ObjClass(name);
                    this.push(klass);
                    break;
                }

                case OpCode.OP_GET_PROPERTY: {
                    const constantIndex = this.readByte(frame);
                    if (constantIndex === undefined) return InterpretResult.RUNTIME_ERROR;
                    const name = frame.closure.function.chunk.constants[constantIndex];
                    if (typeof name !== 'string') return InterpretResult.RUNTIME_ERROR;

                    const instance = this.peek(0);

                    if (!(instance instanceof ObjInstance)) {
                        console.error('Only instances have properties.');
                        return InterpretResult.RUNTIME_ERROR;
                    }

                    if (instance.fields.has(name)) {
                        this.pop(); // Instance
                        this.push(instance.fields.get(name)!);
                    } else {
                        console.error(`Undefined property '${name}'.`);
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    break;
                }

                case OpCode.OP_SET_PROPERTY: {
                    const constantIndex = this.readByte(frame);
                    if (constantIndex === undefined) return InterpretResult.RUNTIME_ERROR;
                    const name = frame.closure.function.chunk.constants[constantIndex];
                    if (typeof name !== 'string') return InterpretResult.RUNTIME_ERROR;

                    const instance = this.peek(1);

                    if (!(instance instanceof ObjInstance)) {
                        console.error('Only instances have fields.');
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
                    if (constantIndex === undefined) return InterpretResult.RUNTIME_ERROR;
                    const func = frame.closure.function.chunk.constants[constantIndex];
                    if (!(func instanceof ObjFunction)) return InterpretResult.RUNTIME_ERROR;

                    const closure = new ObjClosure(func);
                    this.push(closure);

                    for (let i = 0; i < func.upvalueCount; i++) {
                        const isLocal = this.readByte(frame);
                        const index = this.readByte(frame);
                        if (isLocal === undefined || index === undefined)
                            return InterpretResult.RUNTIME_ERROR;

                        if (isLocal) {
                            closure.upvalues.push(this.captureUpvalue(frame.slots + index));
                        } else {
                            if (index >= frame.closure.upvalues.length)
                                return InterpretResult.RUNTIME_ERROR;
                            closure.upvalues.push(frame.closure.upvalues[index]!);
                        }
                    }
                    break;
                }

                case OpCode.OP_GET_UPVALUE: {
                    const slot = this.readByte(frame);
                    if (slot === undefined) return InterpretResult.RUNTIME_ERROR;
                    if (slot >= frame.closure.upvalues.length) return InterpretResult.RUNTIME_ERROR;

                    const upvalue = frame.closure.upvalues[slot];
                    if (!upvalue) return InterpretResult.RUNTIME_ERROR;

                    this.push(upvalue.closed !== null ? upvalue.closed : this.stack[upvalue.location]!);
                    break;
                }

                case OpCode.OP_SET_UPVALUE: {
                    const slot = this.readByte(frame);
                    if (slot === undefined) return InterpretResult.RUNTIME_ERROR;
                    if (slot >= frame.closure.upvalues.length) return InterpretResult.RUNTIME_ERROR;

                    const upvalue = frame.closure.upvalues[slot];
                    if (!upvalue) return InterpretResult.RUNTIME_ERROR;

                    const value = this.peek(0);
                    if (upvalue.closed) {
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
                    if (count === undefined) return InterpretResult.RUNTIME_ERROR;

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

                    if (object instanceof ObjArray && typeof index === 'number') {
                        if (index < 0 || index >= object.elements.length) {
                            console.error('Array index out of bounds.');
                            return InterpretResult.RUNTIME_ERROR;
                        }
                        const val = object.elements[index];
                        if (val === undefined) {
                            this.push(null);
                        } else {
                            this.push(val);
                        }
                    } else {
                        console.error('Invalid index operation.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    break;
                }

                case OpCode.OP_INDEX_SET: {
                    const value = this.pop();
                    const index = this.pop();
                    const object = this.pop();

                    if (object instanceof ObjArray && typeof index === 'number') {
                        if (index < 0 || index >= object.elements.length) {
                            console.error('Array index out of bounds.');
                            return InterpretResult.RUNTIME_ERROR;
                        }
                        object.elements[index] = value;
                        this.push(value);
                    } else {
                        console.error('Invalid index operation.');
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    break;
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
            // If val is undefined, that means we are closing up something that is already gone?
            // In a correct compilers, stack should cover the location.
            upvalue.closed = val ?? null;
            upvalue.location = -1; // Invalid location
            this.openUpvalues = upvalue.next;
        }
    }

    private push(value: Value) {
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
