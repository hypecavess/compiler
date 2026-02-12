import { Value } from './object.js';

export enum OpCode {
    OP_CONSTANT,
    OP_NIL,
    OP_TRUE,
    OP_FALSE,
    OP_POP,
    OP_GET_LOCAL,
    OP_SET_LOCAL,
    OP_GET_GLOBAL,
    OP_DEFINE_GLOBAL,
    OP_SET_GLOBAL,
    OP_EQUAL,
    OP_GREATER,
    OP_LESS,
    OP_ADD,
    OP_SUBTRACT,
    OP_MULTIPLY,
    OP_DIVIDE,
    OP_NOT,
    OP_NEGATE,
    OP_PRINT,
    OP_JUMP,
    OP_JUMP_IF_FALSE,
    OP_LOOP,
    OP_CALL,
    OP_RETURN,
    OP_CLASS,
    OP_GET_PROPERTY,
    OP_SET_PROPERTY,
    OP_CLOSURE,
    OP_GET_UPVALUE,
    OP_SET_UPVALUE,
    OP_CLOSE_UPVALUE,
    OP_ARRAY,
    OP_INDEX_GET,
    OP_INDEX_SET,
}

export class Chunk {
    code: number[] = [];
    constants: Value[] = [];
    lines: number[] = [];

    write(byte: number, line: number) {
        this.code.push(byte);
        this.lines.push(line);
    }

    addConstant(value: Value): number {
        this.constants.push(value);
        return this.constants.length - 1;
    }
}
