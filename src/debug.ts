import { Chunk, OpCode } from "./chunk";
import { ObjFunction } from "./object";

export class Disassembler {
    disassembleChunk(chunk: Chunk, name: string) {
        console.log(`== ${name} ==`);

        for (let offset = 0; offset < chunk.code.length;) {
            offset = this.disassembleInstruction(chunk, offset);
        }
    }

    disassembleInstruction(chunk: Chunk, offset: number): number {
        process.stdout.write(`${offset.toString().padStart(4, '0')} `);

        const instruction = chunk.code[offset];
        switch (instruction) {
            case OpCode.OP_CONSTANT:
                return this.constantInstruction("OP_CONSTANT", chunk, offset);
            case OpCode.OP_NIL:
                return this.simpleInstruction("OP_NIL", offset);
            case OpCode.OP_TRUE:
                return this.simpleInstruction("OP_TRUE", offset);
            case OpCode.OP_FALSE:
                return this.simpleInstruction("OP_FALSE", offset);
            case OpCode.OP_POP:
                return this.simpleInstruction("OP_POP", offset);
            case OpCode.OP_GET_LOCAL:
                return this.byteInstruction("OP_GET_LOCAL", chunk, offset);
            case OpCode.OP_SET_LOCAL:
                return this.byteInstruction("OP_SET_LOCAL", chunk, offset);
            case OpCode.OP_GET_GLOBAL:
                return this.constantInstruction("OP_GET_GLOBAL", chunk, offset);
            case OpCode.OP_DEFINE_GLOBAL:
                return this.constantInstruction("OP_DEFINE_GLOBAL", chunk, offset);
            case OpCode.OP_SET_GLOBAL:
                return this.constantInstruction("OP_SET_GLOBAL", chunk, offset);
            case OpCode.OP_EQUAL:
                return this.simpleInstruction("OP_EQUAL", offset);
            case OpCode.OP_GREATER:
                return this.simpleInstruction("OP_GREATER", offset);
            case OpCode.OP_LESS:
                return this.simpleInstruction("OP_LESS", offset);
            case OpCode.OP_ADD:
                return this.simpleInstruction("OP_ADD", offset);
            case OpCode.OP_SUBTRACT:
                return this.simpleInstruction("OP_SUBTRACT", offset);
            case OpCode.OP_MULTIPLY:
                return this.simpleInstruction("OP_MULTIPLY", offset);
            case OpCode.OP_DIVIDE:
                return this.simpleInstruction("OP_DIVIDE", offset);
            case OpCode.OP_NOT:
                return this.simpleInstruction("OP_NOT", offset);
            case OpCode.OP_NEGATE:
                return this.simpleInstruction("OP_NEGATE", offset);
            case OpCode.OP_PRINT:
                return this.simpleInstruction("OP_PRINT", offset);
            case OpCode.OP_JUMP:
                return this.jumpInstruction("OP_JUMP", 1, chunk, offset);
            case OpCode.OP_JUMP_IF_FALSE:
                return this.jumpInstruction("OP_JUMP_IF_FALSE", 1, chunk, offset);
            case OpCode.OP_LOOP:
                return this.jumpInstruction("OP_LOOP", -1, chunk, offset);
            case OpCode.OP_CALL:
                return this.byteInstruction("OP_CALL", chunk, offset);
            case OpCode.OP_RETURN:
                return this.simpleInstruction("OP_RETURN", offset);
            case OpCode.OP_CLASS:
                return this.constantInstruction("OP_CLASS", chunk, offset);
            case OpCode.OP_GET_PROPERTY:
                return this.constantInstruction("OP_GET_PROPERTY", chunk, offset);
            case OpCode.OP_SET_PROPERTY:
                return this.constantInstruction("OP_SET_PROPERTY", chunk, offset);
            default:
                console.log(`Unknown opcode ${instruction}`);
                return offset + 1;
        }
    }

    private simpleInstruction(name: string, offset: number): number {
        console.log(name);
        return offset + 1;
    }

    private constantInstruction(name: string, chunk: Chunk, offset: number): number {
        const constant = chunk.code[offset + 1];
        const value = chunk.constants[constant];
        console.log(`${name.padEnd(16)} ${constant} '${value}'`);
        return offset + 2;
    }

    private byteInstruction(name: string, chunk: Chunk, offset: number): number {
        const slot = chunk.code[offset + 1];
        console.log(`${name.padEnd(16)} ${slot}`);
        return offset + 2;
    }

    private jumpInstruction(name: string, sign: number, chunk: Chunk, offset: number): number {
        const jump = (chunk.code[offset + 1] << 8) | chunk.code[offset + 2];
        console.log(`${name.padEnd(16)} ${offset} -> ${offset + 3 + sign * jump}`);
        return offset + 3;
    }
}
