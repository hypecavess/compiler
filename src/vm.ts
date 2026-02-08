import { Chunk, OpCode } from "./chunk";
import { ObjClass, ObjFunction, ObjInstance, ObjNative, Value } from "./object";

export enum InterpretResult {
    OK,
    COMPILE_ERROR,
    RUNTIME_ERROR
}

class CallFrame {
    function: ObjFunction;
    ip: number = 0;
    slots: number = 0;

    constructor(func: ObjFunction, slots: number) {
        this.function = func;
        this.slots = slots;
    }
}

export class VM {
    frames: CallFrame[] = [];
    frameCount: number = 0;
    stack: Value[] = [];
    globals: Map<string, Value> = new Map();

    constructor() {
        this.defineNative("clock", 0, (args: Value[]) => {
            return Date.now() / 1000;
        });
    }

    private defineNative(name: string, arity: number, function_: (args: Value[]) => Value) {
        this.globals.set(name, new ObjNative(name, arity, function_));
    }

    interpret(function_: ObjFunction): InterpretResult {
        this.frames = [];
        this.frameCount = 0;
        this.stack = [];

        // Main script function
        this.push(function_);
        this.frames[this.frameCount++] = new CallFrame(function_, 0);

        return this.run();
    }

    private run(): InterpretResult {
        let frame = this.frames[this.frameCount - 1];

        for (; ;) {
            const instruction = frame.function.chunk.code[frame.ip++];

            switch (instruction) {
                case OpCode.OP_CONSTANT: {
                    const constant = frame.function.chunk.constants[frame.function.chunk.code[frame.ip++]];
                    this.push(constant);
                    break;
                }
                case OpCode.OP_NIL: this.push(null); break;
                case OpCode.OP_TRUE: this.push(true); break;
                case OpCode.OP_FALSE: this.push(false); break;

                case OpCode.OP_POP: this.pop(); break;

                case OpCode.OP_GET_LOCAL: {
                    const slot = frame.function.chunk.code[frame.ip++];
                    this.push(this.stack[frame.slots + slot]);
                    break;
                }

                case OpCode.OP_SET_LOCAL: {
                    const slot = frame.function.chunk.code[frame.ip++];
                    this.stack[frame.slots + slot] = this.peek(0);
                    break;
                }

                case OpCode.OP_GET_GLOBAL: {
                    const name = frame.function.chunk.constants[frame.function.chunk.code[frame.ip++]] as string;
                    if (!this.globals.has(name)) {
                        console.error(`Undefined variable '${name}'.`);
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    this.push(this.globals.get(name)!);
                    break;
                }

                case OpCode.OP_DEFINE_GLOBAL: {
                    const name = frame.function.chunk.constants[frame.function.chunk.code[frame.ip++]] as string;
                    this.globals.set(name, this.pop());
                    break;
                }

                case OpCode.OP_SET_GLOBAL: {
                    const name = frame.function.chunk.constants[frame.function.chunk.code[frame.ip++]] as string;
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
                    this.push(a == b);
                    break;
                }
                case OpCode.OP_GREATER: {
                    const b = this.pop();
                    const a = this.pop();
                    this.push((a as any) > (b as any));
                    break;
                }
                case OpCode.OP_LESS: {
                    const b = this.pop();
                    const a = this.pop();
                    this.push((a as any) < (b as any));
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
                        console.error("Operands must be two numbers or two strings.");
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    break;
                }
                case OpCode.OP_SUBTRACT: {
                    const b = this.pop();
                    const a = this.pop();
                    this.push((a as number) - (b as number));
                    break;
                }
                case OpCode.OP_MULTIPLY: {
                    const b = this.pop();
                    const a = this.pop();
                    this.push((a as number) * (b as number));
                    break;
                }
                case OpCode.OP_DIVIDE: {
                    const b = this.pop();
                    const a = this.pop();
                    this.push((a as number) / (b as number));
                    break;
                }
                case OpCode.OP_NOT: {
                    this.push(!this.pop());
                    break;
                }
                case OpCode.OP_NEGATE: {
                    if (typeof this.peek(0) !== 'number') {
                        console.error("Operand must be a number.");
                        return InterpretResult.RUNTIME_ERROR;
                    }
                    this.push(-(this.pop() as number));
                    break;
                }

                case OpCode.OP_PRINT: {
                    console.log(this.pop());
                    break;
                }

                case OpCode.OP_JUMP: {
                    const offset = (frame.function.chunk.code[frame.ip] << 8) | frame.function.chunk.code[frame.ip + 1];
                    frame.ip += 2;
                    frame.ip += offset;
                    break;
                }
                case OpCode.OP_JUMP_IF_FALSE: {
                    const offset = (frame.function.chunk.code[frame.ip] << 8) | frame.function.chunk.code[frame.ip + 1];
                    frame.ip += 2;
                    if (!this.peek(0)) frame.ip += offset;
                    break;
                }
                case OpCode.OP_LOOP: {
                    const offset = (frame.function.chunk.code[frame.ip] << 8) | frame.function.chunk.code[frame.ip + 1];
                    frame.ip += 2;
                    frame.ip -= offset;
                    break;
                }

                case OpCode.OP_CALL: {
                    const argCount = frame.function.chunk.code[frame.ip++];
                    const callee = this.peek(argCount);

                    if (callee instanceof ObjNative) {
                        if (argCount != callee.arity) {
                            console.error(`Expected ${callee.arity} arguments but got ${argCount}.`);
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
                        // Replace the class on the stack with the instance.
                        // Currently stack: [..., Class, arg1, arg2, ...]
                        // We need to set Class slot to Instance.
                        this.stack[this.stack.length - argCount - 1] = instance;

                        // If we had initializers/constructors, we would call them here.
                        // For now we just return the instance.
                        break;
                    }

                    if (!(callee instanceof ObjFunction)) {
                        console.error("Can only call functions.");
                        return InterpretResult.RUNTIME_ERROR;
                    }

                    if (argCount != callee.arity) {
                        console.error(`Expected ${callee.arity} arguments but got ${argCount}.`);
                        return InterpretResult.RUNTIME_ERROR;
                    }

                    if (this.frameCount === 64) {
                        console.error("Stack overflow.");
                        return InterpretResult.RUNTIME_ERROR;
                    }

                    const newFrame = new CallFrame(callee, this.stack.length - argCount - 1);
                    this.frames[this.frameCount++] = newFrame;
                    frame = newFrame;
                    break;
                }

                case OpCode.OP_RETURN: {
                    const result = this.pop();
                    this.frameCount--;
                    if (this.frameCount === 0) {
                        this.pop(); // Pop main script function
                        return InterpretResult.OK;
                    }

                    this.stack.length = this.frames[this.frameCount].slots;
                    this.push(result);
                    frame = this.frames[this.frameCount - 1];
                    break;
                }

                case OpCode.OP_CLASS: {
                    const name = frame.function.chunk.constants[frame.function.chunk.code[frame.ip++]] as string;
                    const klass = new ObjClass(name);
                    this.push(klass);
                    break;
                }

                case OpCode.OP_GET_PROPERTY: {
                    const name = frame.function.chunk.constants[frame.function.chunk.code[frame.ip++]] as string;
                    const instance = this.peek(0);

                    if (!(instance instanceof ObjInstance)) {
                        console.error("Only instances have properties.");
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
                    const name = frame.function.chunk.constants[frame.function.chunk.code[frame.ip++]] as string;
                    const instance = this.peek(1);

                    if (!(instance instanceof ObjInstance)) {
                        console.error("Only instances have fields.");
                        return InterpretResult.RUNTIME_ERROR;
                    }

                    const value = this.pop();
                    instance.fields.set(name, value);
                    this.pop(); // Instance
                    this.push(value);
                    break;
                }
            }
        }
    }

    private push(value: Value) {
        this.stack.push(value);
    }

    private pop(): Value {
        return this.stack.pop()!;
    }

    private peek(distance: number): Value {
        return this.stack[this.stack.length - 1 - distance]!;
    }
}
