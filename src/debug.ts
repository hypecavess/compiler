import { Chunk, OpCode } from './chunk.js';
import { ObjFunction, valueToString } from './object.js';

/** Operand layout of each opcode, used by the disassembler. */
type OperandKind = 'none' | 'byte' | 'constant' | 'short' | 'jump' | 'loop' | 'closure';

const OPERANDS: Record<OpCode, OperandKind> = {
    [OpCode.OP_CONSTANT]: 'constant',
    [OpCode.OP_NIL]: 'none',
    [OpCode.OP_TRUE]: 'none',
    [OpCode.OP_FALSE]: 'none',
    [OpCode.OP_POP]: 'none',
    [OpCode.OP_GET_LOCAL]: 'byte',
    [OpCode.OP_SET_LOCAL]: 'byte',
    [OpCode.OP_GET_GLOBAL]: 'constant',
    [OpCode.OP_DEFINE_GLOBAL]: 'constant',
    [OpCode.OP_SET_GLOBAL]: 'constant',
    [OpCode.OP_EQUAL]: 'none',
    [OpCode.OP_GREATER]: 'none',
    [OpCode.OP_LESS]: 'none',
    [OpCode.OP_ADD]: 'none',
    [OpCode.OP_SUBTRACT]: 'none',
    [OpCode.OP_MULTIPLY]: 'none',
    [OpCode.OP_DIVIDE]: 'none',
    [OpCode.OP_NOT]: 'none',
    [OpCode.OP_NEGATE]: 'none',
    [OpCode.OP_PRINT]: 'none',
    [OpCode.OP_JUMP]: 'jump',
    [OpCode.OP_JUMP_IF_FALSE]: 'jump',
    [OpCode.OP_LOOP]: 'loop',
    [OpCode.OP_CALL]: 'byte',
    [OpCode.OP_RETURN]: 'none',
    [OpCode.OP_CLASS]: 'constant',
    [OpCode.OP_GET_PROPERTY]: 'constant',
    [OpCode.OP_SET_PROPERTY]: 'constant',
    [OpCode.OP_CLOSURE]: 'closure',
    [OpCode.OP_GET_UPVALUE]: 'byte',
    [OpCode.OP_SET_UPVALUE]: 'byte',
    [OpCode.OP_CLOSE_UPVALUE]: 'none',
    [OpCode.OP_ARRAY]: 'short',
    [OpCode.OP_INDEX_GET]: 'none',
    [OpCode.OP_INDEX_SET]: 'none',
    [OpCode.OP_MODULO]: 'none',
    [OpCode.OP_MAP]: 'short',
};

/**
 * Renders bytecode as human-readable text. Pure: returns strings and never
 * writes to the console, so it works in any host (Node, browsers, workers).
 */
export class Disassembler {
    /** Disassembles a chunk and, recursively, every function in its constant pool. */
    disassembleFunction(fn: ObjFunction): string {
        const parts = [this.disassembleChunk(fn.chunk, fn.name ?? 'script')];
        for (const constant of fn.chunk.constants) {
            if (constant instanceof ObjFunction) parts.push(this.disassembleFunction(constant));
        }
        return parts.join('\n\n');
    }

    disassembleChunk(chunk: Chunk, name: string): string {
        const lines = [`== ${name} ==`];
        for (let offset = 0; offset < chunk.code.length; ) {
            const [text, next] = this.disassembleInstruction(chunk, offset);
            lines.push(text);
            offset = next;
        }
        return lines.join('\n');
    }

    /** Returns the rendered instruction and the offset of the next instruction. */
    disassembleInstruction(chunk: Chunk, offset: number): [string, number] {
        const prefix = offset.toString().padStart(4, '0');
        const line = chunk.lines[offset];
        const sameLine = offset > 0 && chunk.lines[offset - 1] === line;
        const lineCol = (sameLine ? '|' : String(line ?? '?')).padStart(4, ' ');
        const head = `${prefix} ${lineCol} `;

        const instruction = chunk.code[offset];
        const kind = instruction === undefined ? undefined : OPERANDS[instruction as OpCode];
        if (kind === undefined) {
            return [`${head}Unknown opcode ${instruction}`, offset + 1];
        }
        const name = OpCode[instruction as OpCode].padEnd(18);
        const byte = (i: number) => chunk.code[offset + i];
        const short = (i: number) => {
            const hi = byte(i);
            const lo = byte(i + 1);
            return hi === undefined || lo === undefined ? undefined : (hi << 8) | lo;
        };

        switch (kind) {
            case 'none':
                return [`${head}${OpCode[instruction as OpCode]}`, offset + 1];
            case 'byte':
                return [`${head}${name}${byte(1) ?? '<undefined>'}`, offset + 2];
            case 'short':
                return [`${head}${name}${short(1) ?? '<undefined>'}`, offset + 3];
            case 'constant': {
                const index = short(1);
                const value = index === undefined ? undefined : chunk.constants[index];
                const shown = value === undefined ? '<undefined>' : valueToString(value);
                return [`${head}${name}${index ?? '?'} '${shown}'`, offset + 3];
            }
            case 'jump':
            case 'loop': {
                const jump = short(1);
                if (jump === undefined) return [`${head}${name}<undefined>`, offset + 3];
                const sign = kind === 'jump' ? 1 : -1;
                return [`${head}${name}${offset} -> ${offset + 3 + sign * jump}`, offset + 3];
            }
            case 'closure': {
                const index = short(1);
                let current = offset + 3;
                const fn = index === undefined ? undefined : chunk.constants[index];
                const out = [
                    `${head}${name}${index ?? '?'} '${fn === undefined ? '<undefined>' : valueToString(fn)}'`,
                ];
                const upvalueCount = fn instanceof ObjFunction ? fn.upvalueCount : 0;
                for (let i = 0; i < upvalueCount; i++) {
                    const isLocal = chunk.code[current];
                    const slot = chunk.code[current + 1];
                    out.push(
                        `${current.toString().padStart(4, '0')}    |   ${''.padEnd(18)}${isLocal ? 'local' : 'upvalue'} ${slot}`,
                    );
                    current += 2;
                }
                return [out.join('\n'), current];
            }
        }
    }
}
