import * as fs from 'fs';
import * as readline from 'readline';
import { Lexer } from './lexer.js';
import { Parser } from './parser.js';
import { Compiler } from './compiler.js';
import { VM, InterpretResult } from './vm.js';

// Security: refuse to load unreasonably large source files.
const MAX_SOURCE_BYTES = 1024 * 1024; // 1 MiB

function run(source: string, vm: VM): InterpretResult {
    const lexer = new Lexer(source);
    const tokens = lexer.scanTokens();

    const parser = new Parser(tokens);
    const statements = parser.parse();

    // Stop before execution if there was a lexical or syntax error.
    if (lexer.hadError || parser.hadError) return InterpretResult.COMPILE_ERROR;

    const compiler = new Compiler();
    const function_ = compiler.compile(statements);
    if (compiler.hadError) return InterpretResult.COMPILE_ERROR;

    return vm.interpret(function_);
}

function runFile(path: string) {
    let source: string;
    try {
        source = fs.readFileSync(path, 'utf-8');
    } catch {
        console.error(`Could not read file "${path}".`);
        process.exit(74);
    }

    if (Buffer.byteLength(source, 'utf-8') > MAX_SOURCE_BYTES) {
        console.error(`Source file too large (max ${MAX_SOURCE_BYTES} bytes).`);
        process.exit(65);
    }

    const result = run(source, new VM());
    if (result === InterpretResult.COMPILE_ERROR) process.exit(65);
    if (result === InterpretResult.RUNTIME_ERROR) process.exit(70);
}

function runPrompt() {
    // A single VM instance keeps globals alive across REPL lines.
    const vm = new VM();

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '> ',
    });

    rl.prompt();

    rl.on('line', (line) => {
        run(line, vm);
        rl.prompt();
    }).on('close', () => {
        console.log('Have a nice day!');
        process.exit(0);
    });
}

function main() {
    const args = process.argv.slice(2);

    if (args.length > 1) {
        console.log('Usage: fradual [script]');
        process.exit(64);
    } else if (args.length === 1 && args[0]) {
        runFile(args[0]);
    } else {
        runPrompt();
    }
}

main();
