import { Lexer } from '../src/lexer';
import { Parser } from '../src/parser';
import { Compiler } from '../src/compiler';
import { VM, InterpretResult } from '../src/vm';
import { Token } from '../src/token';
import * as Stmt from '../src/ast';
import { ObjFunction } from '../src/object';

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
    console.log = (...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
    };

    try {
        const func = compile(source);
        const vm = new VM();
        const result = vm.interpret(func);
        return { result, output: logs };
    } finally {
        console.log = originalLog;
    }
}
