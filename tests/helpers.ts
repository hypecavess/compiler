import { Lexer } from '../src/lexer.js';
import { Parser } from '../src/parser.js';
import { Compiler } from '../src/compiler.js';
import { VM, VMOptions, InterpretResult } from '../src/vm.js';
import { Token } from '../src/token.js';
import * as Stmt from '../src/ast.js';
import { ObjFunction } from '../src/object.js';
import { Diagnostic, formatDiagnostic } from '../src/diagnostic.js';

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

export function run(
    source: string,
    options: VMOptions = {},
): { result: InterpretResult; output: string[] } {
    const output: string[] = [];
    const report = (diagnostics: Diagnostic[]) => {
        for (const d of diagnostics) output.push(formatDiagnostic(d));
    };

    const lexer = new Lexer(source);
    const tokens = lexer.scanTokens();
    const parser = new Parser(tokens);
    const statements = parser.parse();
    if (lexer.hadError || parser.hadError) {
        report([...lexer.diagnostics, ...parser.diagnostics]);
        return { result: InterpretResult.COMPILE_ERROR, output };
    }

    const compiler = new Compiler();
    const func = compiler.compile(statements);
    if (compiler.hadError) {
        report(compiler.diagnostics);
        return { result: InterpretResult.COMPILE_ERROR, output };
    }

    const vm = new VM({ ...options, onPrint: (text) => output.push(text) });
    const result = vm.interpret(func);
    if (vm.lastError) report([vm.lastError]);
    return { result, output };
}
