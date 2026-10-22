import * as fs from 'fs';
import * as readline from 'readline';
import { Fradual, Program } from './fradual.js';
import { Diagnostic, formatDiagnostic } from './diagnostic.js';

// Security: refuse to load unreasonably large source files.
const MAX_SOURCE_BYTES = 1024 * 1024; // 1 MiB

const EXIT = {
    OK: 0,
    USAGE: 64,
    COMPILE_ERROR: 65,
    RUNTIME_ERROR: 70,
    IO_ERROR: 74,
} as const;

const USAGE = `Usage: fradual [options] [script.fu]

Runs a Fradual script, or starts an interactive REPL when no script is given.

Options:
  -d, --disasm     Print the compiled bytecode instead of running the script
  -v, --version    Print the version and exit
  -h, --help       Show this help and exit`;

function printDiagnostics(diagnostics: Diagnostic[]): void {
    for (const diagnostic of diagnostics) console.error(formatDiagnostic(diagnostic));
}

function readVersion(): string {
    try {
        const pkg = JSON.parse(
            fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
        ) as { version?: string };
        return pkg.version ?? 'unknown';
    } catch {
        return 'unknown';
    }
}

function runFile(path: string, disasm: boolean): number {
    let source: string;
    try {
        source = fs.readFileSync(path, 'utf-8');
    } catch {
        console.error(`Could not read file "${path}".`);
        return EXIT.IO_ERROR;
    }

    if (Buffer.byteLength(source, 'utf-8') > MAX_SOURCE_BYTES) {
        console.error(`Source file too large (max ${MAX_SOURCE_BYTES} bytes).`);
        return EXIT.COMPILE_ERROR;
    }

    // Scripts run from the CLI follow the language rules strictly.
    const engine = new Fradual({ allowTopLevelReturn: false });
    const compiled = engine.compile(source);
    if (!compiled.program) {
        printDiagnostics(compiled.diagnostics);
        return EXIT.COMPILE_ERROR;
    }

    if (disasm) {
        console.log(compiled.program.disassemble());
        return EXIT.OK;
    }

    const result = engine.run(compiled.program);
    if (!result.ok) {
        printDiagnostics(result.diagnostics);
        return EXIT.RUNTIME_ERROR;
    }
    return EXIT.OK;
}

function runPrompt(disasm: boolean): void {
    // A single engine keeps globals alive across REPL lines.
    const engine = new Fradual({ allowTopLevelReturn: false });

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '> ',
    });

    rl.prompt();

    rl.on('line', (line) => {
        const compiled = engine.compile(line);
        if (!compiled.program) {
            printDiagnostics(compiled.diagnostics);
        } else {
            const program: Program = compiled.program;
            if (disasm) console.log(program.disassemble());
            const result = engine.run(program);
            if (!result.ok) printDiagnostics(result.diagnostics);
        }
        rl.prompt();
    }).on('close', () => {
        console.log('Have a nice day!');
        process.exit(EXIT.OK);
    });
}

export function main(argv: string[] = process.argv.slice(2)): void {
    let disasm = false;
    const files: string[] = [];

    for (const arg of argv) {
        switch (arg) {
            case '-h':
            case '--help':
                console.log(USAGE);
                process.exit(EXIT.OK);
                break;
            case '-v':
            case '--version':
                console.log(readVersion());
                process.exit(EXIT.OK);
                break;
            case '-d':
            case '--disasm':
                disasm = true;
                break;
            default:
                if (arg.startsWith('-')) {
                    console.error(`Unknown option '${arg}'.\n\n${USAGE}`);
                    process.exit(EXIT.USAGE);
                }
                files.push(arg);
        }
    }

    if (files.length > 1) {
        console.error(USAGE);
        process.exit(EXIT.USAGE);
    }

    const [file] = files;
    if (file) {
        process.exitCode = runFile(file, disasm);
    } else {
        runPrompt(disasm);
    }
}

main();
