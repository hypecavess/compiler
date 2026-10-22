/**
 * Public entry point of the Fradual package.
 *
 * Importing this module has no side effects: it never reads files, touches
 * `process`, or writes to the console. The CLI lives in `cli.ts`.
 */

// High-level embedding API
export {
    Fradual,
    Program,
    run,
    toValue,
    fromValue,
    ConversionError,
    DEFAULT_CONVERSION_OPTIONS,
} from './fradual.js';
export type {
    FradualOptions,
    RunResult,
    RunStatus,
    CompileResult,
    HostFunction,
    ConversionOptions,
    ConversionFailurePolicy,
} from './fradual.js';

// Diagnostics
export { formatDiagnostic } from './diagnostic.js';
export type { Diagnostic, DiagnosticKind, StackFrameInfo } from './diagnostic.js';

// Low-level pipeline (for tooling, playgrounds, and advanced hosts)
export { Lexer } from './lexer.js';
export { Parser } from './parser.js';
export { Compiler } from './compiler.js';
export type { CompilerOptions } from './compiler.js';
export { VM, InterpretResult } from './vm.js';
export type { VMOptions } from './vm.js';
export { Chunk, OpCode } from './chunk.js';
export { Disassembler } from './debug.js';
export { verifyBytecode } from './verifier.js';
export { Token, TokenType } from './token.js';
export {
    ObjArray,
    ObjClass,
    ObjClosure,
    ObjFunction,
    ObjInstance,
    ObjMap,
    ObjNative,
    valueToString,
} from './object.js';
export type { Value, NativeFn } from './object.js';
