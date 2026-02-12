import { Lexer } from '../src/lexer.js';
import { Parser } from '../src/parser.js';
import { Compiler } from '../src/compiler.js';
import { VM, InterpretResult } from '../src/vm.js';
import { Token } from '../src/token.js';
import * as Stmt from '../src/ast.js';
import { ObjFunction } from '../src/object.js';

export function tokenize(source: string): Token[] {
    const lexer = new Lexer(source);
    return lexer.scanTokens();
}

export function parse(source: string): Stmt.Stmt[] {
    const tokens = tokenize(source);
    const parser = new Parser(tokens);
    return parser.parse();
}

export function compile(source: string): ObjFunction {
    const statements = parse(source);
    const compiler = new Compiler();
    return compiler.compile(statements);
}

export function run(source: string): { result: InterpretResult; output: string[] } {
    const logs: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;

    const logFn = (...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
    };

    console.log = logFn;
    console.error = logFn;

    try {
        const func = compile(source);
        const vm = new VM();
        const result = vm.interpret(func);
        return { result, output: logs };
    } finally {
        console.log = originalLog;
        console.error = originalError;
    }
}
