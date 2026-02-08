import * as fs from 'fs';
import * as readline from 'readline';
import { Lexer } from './lexer';
import { Parser } from './parser';
import { Compiler } from './compiler';
import { VM, InterpretResult } from './vm';

function run(source: string) {
    const lexer = new Lexer(source);
    const tokens = lexer.scanTokens();

    // For debugging
    // console.log(tokens);

    const parser = new Parser(tokens);
    const statements = parser.parse();

    // Stop if there was a syntax error.
    if (statements.length === 0 && tokens.length > 1) return; // Basic check

    const compiler = new Compiler();
    const function_ = compiler.compile(statements);

    // DEBUG: Print bytecode
    console.log("--- BYTECODE ---");
    const { Disassembler } = require('./debug');
    new Disassembler().disassembleChunk(function_.chunk, "script");
    console.log("--- END BYTECODE ---");

    const vm = new VM();
    const result = vm.interpret(function_);

    if (result === InterpretResult.COMPILE_ERROR) process.exit(65);
    if (result === InterpretResult.RUNTIME_ERROR) process.exit(70);
}

function runFile(path: string) {
    try {
        const source = fs.readFileSync(path, 'utf-8');
        run(source);
    } catch (err) {
        console.error(`Could not read file "${path}".`);
        process.exit(74);
    }
}

function runPrompt() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '> '
    });

    rl.prompt();

    rl.on('line', (line) => {
        run(line);
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
    } else if (args.length === 1) {
        runFile(args[0]);
    } else {
        runPrompt();
    }
}

main();
