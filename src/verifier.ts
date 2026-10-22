import { OpCode } from './chunk.js';
import { ObjFunction } from './object.js';
import { Diagnostic } from './diagnostic.js';

type OperandKind = 'none' | 'byte' | 'constant' | 'short' | 'jump' | 'loop' | 'closure';

const OPERANDS: Record<number, OperandKind | undefined> = {
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
 * Bytecode Verifier: Statically verifies that bytecode is structurally sound
 * before execution, defending against corrupted or maliciously crafted chunks.
 *
 * Guarantees:
 * 1. Every opcode is valid and all operands are fully present.
 * 2. Every constant index is within chunk.constants bounds.
 * 3. Every jump target lands on an exact instruction boundary, NEVER inside operands.
 * 4. Named opcodes reference string constants in the pool.
 * 5. Upvalue indices and closure descriptors are strictly within bounds.
 * 6. Nested functions are verified recursively.
 */
export function verifyBytecode(fn: ObjFunction, seen: Set<ObjFunction> = new Set()): Diagnostic[] {
    if (seen.has(fn)) return [];
    seen.add(fn);

    const diagnostics: Diagnostic[] = [];
    const chunk = fn.chunk;
    const code = chunk.code;
    const len = code.length;

    if (len === 0) {
        diagnostics.push({
            kind: 'compile',
            message: 'Bytecode verification failed: chunk is empty.',
            line: 0,
        });
        return diagnostics;
    }

    const validInstructionOffsets = new Set<number>();
    const jumpInstructions: { offset: number; opcode: OpCode; target: number; line: number }[] = [];

    let offset = 0;
    while (offset < len) {
        validInstructionOffsets.add(offset);
        const op = code[offset];
        if (op === undefined) break;

        const kind = OPERANDS[op];
        const line = chunk.lines[offset] ?? 0;

        if (kind === undefined) {
            diagnostics.push({
                kind: 'compile',
                message: `Bytecode verification failed: unknown opcode 0x${op.toString(16)} at offset ${offset}.`,
                line,
            });
            return diagnostics;
        }

        switch (kind) {
            case 'none':
                offset += 1;
                break;

            case 'byte': {
                if (offset + 1 >= len) {
                    diagnostics.push({
                        kind: 'compile',
                        message: `Bytecode verification failed: missing 8-bit operand for opcode ${OpCode[op]} at offset ${offset}.`,
                        line,
                    });
                    return diagnostics;
                }
                const slot = code[offset + 1]!;
                if (op === OpCode.OP_GET_UPVALUE || op === OpCode.OP_SET_UPVALUE) {
                    if (slot >= fn.upvalueCount) {
                        diagnostics.push({
                            kind: 'compile',
                            message: `Bytecode verification failed: upvalue index ${slot} out of bounds (function has ${fn.upvalueCount} upvalues) at offset ${offset}.`,
                            line,
                        });
                    }
                }
                offset += 2;
                break;
            }

            case 'short': {
                if (offset + 2 >= len) {
                    diagnostics.push({
                        kind: 'compile',
                        message: `Bytecode verification failed: missing 16-bit operand for opcode ${OpCode[op]} at offset ${offset}.`,
                        line,
                    });
                    return diagnostics;
                }
                offset += 3;
                break;
            }

            case 'constant': {
                if (offset + 2 >= len) {
                    diagnostics.push({
                        kind: 'compile',
                        message: `Bytecode verification failed: truncated constant operand at offset ${offset}.`,
                        line,
                    });
                    return diagnostics;
                }
                const hi = code[offset + 1]!;
                const lo = code[offset + 2]!;
                const constIndex = (hi << 8) | lo;
                if (constIndex >= chunk.constants.length) {
                    diagnostics.push({
                        kind: 'compile',
                        message: `Bytecode verification failed: constant index ${constIndex} out of bounds (pool size ${chunk.constants.length}) at offset ${offset}.`,
                        line,
                    });
                } else {
                    if (
                        op === OpCode.OP_GET_GLOBAL ||
                        op === OpCode.OP_DEFINE_GLOBAL ||
                        op === OpCode.OP_SET_GLOBAL ||
                        op === OpCode.OP_GET_PROPERTY ||
                        op === OpCode.OP_SET_PROPERTY ||
                        op === OpCode.OP_CLASS
                    ) {
                        const val = chunk.constants[constIndex];
                        if (typeof val !== 'string') {
                            diagnostics.push({
                                kind: 'compile',
                                message: `Bytecode verification failed: opcode ${OpCode[op]} requires string constant, but index ${constIndex} is ${typeof val} at offset ${offset}.`,
                                line,
                            });
                        }
                    }
                }
                offset += 3;
                break;
            }

            case 'jump': {
                if (offset + 2 >= len) {
                    diagnostics.push({
                        kind: 'compile',
                        message: `Bytecode verification failed: truncated jump operand at offset ${offset}.`,
                        line,
                    });
                    return diagnostics;
                }
                const hi = code[offset + 1]!;
                const lo = code[offset + 2]!;
                const jumpOffset = (hi << 8) | lo;
                const target = offset + 3 + jumpOffset;
                jumpInstructions.push({ offset, opcode: op as OpCode, target, line });
                offset += 3;
                break;
            }

            case 'loop': {
                if (offset + 2 >= len) {
                    diagnostics.push({
                        kind: 'compile',
                        message: `Bytecode verification failed: truncated loop operand at offset ${offset}.`,
                        line,
                    });
                    return diagnostics;
                }
                const hi = code[offset + 1]!;
                const lo = code[offset + 2]!;
                const loopOffset = (hi << 8) | lo;
                const target = offset + 3 - loopOffset;
                jumpInstructions.push({ offset, opcode: op as OpCode, target, line });
                offset += 3;
                break;
            }

            case 'closure': {
                if (offset + 2 >= len) {
                    diagnostics.push({
                        kind: 'compile',
                        message: `Bytecode verification failed: truncated closure operand at offset ${offset}.`,
                        line,
                    });
                    return diagnostics;
                }
                const hi = code[offset + 1]!;
                const lo = code[offset + 2]!;
                const constIndex = (hi << 8) | lo;
                if (constIndex >= chunk.constants.length) {
                    diagnostics.push({
                        kind: 'compile',
                        message: `Bytecode verification failed: closure constant index ${constIndex} out of bounds at offset ${offset}.`,
                        line,
                    });
                    return diagnostics;
                }
                const subFn = chunk.constants[constIndex];
                if (!(subFn instanceof ObjFunction)) {
                    diagnostics.push({
                        kind: 'compile',
                        message: `Bytecode verification failed: constant ${constIndex} is not an ObjFunction.`,
                        line,
                    });
                    return diagnostics;
                }
                const upvalueBytes = subFn.upvalueCount * 2;
                if (offset + 3 + upvalueBytes > len) {
                    diagnostics.push({
                        kind: 'compile',
                        message: `Bytecode verification failed: truncated upvalue descriptors for closure at offset ${offset}.`,
                        line,
                    });
                    return diagnostics;
                }
                for (let i = 0; i < subFn.upvalueCount; i++) {
                    const isLocal = code[offset + 3 + i * 2]!;
                    const index = code[offset + 3 + i * 2 + 1]!;
                    if (isLocal !== 0 && isLocal !== 1) {
                        diagnostics.push({
                            kind: 'compile',
                            message: `Bytecode verification failed: invalid upvalue isLocal flag (${isLocal}) at offset ${offset + 3 + i * 2}.`,
                            line,
                        });
                    }
                    if (isLocal === 0 && index >= fn.upvalueCount) {
                        diagnostics.push({
                            kind: 'compile',
                            message: `Bytecode verification failed: enclosing upvalue index ${index} out of bounds (${fn.upvalueCount}) for closure at offset ${offset}.`,
                            line,
                        });
                    }
                }
                offset += 3 + upvalueBytes;
                break;
            }
        }
    }

    // Verify all jump targets land on instruction boundaries
    for (const jump of jumpInstructions) {
        if (!validInstructionOffsets.has(jump.target)) {
            diagnostics.push({
                kind: 'compile',
                message: `Bytecode verification failed: ${OpCode[jump.opcode]} at offset ${jump.offset} targets invalid offset ${jump.target} (must land on an instruction boundary).`,
                line: jump.line,
            });
        }
    }

    // Recursively verify nested functions in constant pool
    for (const constant of chunk.constants) {
        if (constant instanceof ObjFunction) {
            diagnostics.push(...verifyBytecode(constant, seen));
        }
    }

    return diagnostics;
}
