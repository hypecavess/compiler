import { run, tokenize, parse } from '../helpers.js';
import { InterpretResult, VM } from '../../src/vm.js';
import { Lexer } from '../../src/lexer.js';
import { Parser } from '../../src/parser.js';
import { Compiler } from '../../src/compiler.js';

function silenced<T>(fn: () => T): T {
    const originalLog = console.log;
    const originalError = console.error;
    console.log = () => undefined;
    console.error = () => undefined;
    try {
        return fn();
    } finally {
        console.log = originalLog;
        console.error = originalError;
    }
}

describe('Security & Robustness', () => {
    describe('Lexer error reporting', () => {
        test('unexpected character sets hadError', () => {
            silenced(() => {
                const lexer = new Lexer('var a = @;');
                lexer.scanTokens();
                expect(lexer.hadError).toBe(true);
                expect(lexer.errors[0]).toContain('Unexpected character');
            });
        });

        test('unterminated string sets hadError', () => {
            silenced(() => {
                const lexer = new Lexer('"open ended');
                lexer.scanTokens();
                expect(lexer.hadError).toBe(true);
                expect(lexer.errors[0]).toContain('Unterminated string');
            });
        });
    });

    describe('Parser error reporting', () => {
        test('syntax error sets hadError', () => {
            silenced(() => {
                const parser = new Parser(tokenize('var = 5;'));
                parser.parse();
                expect(parser.hadError).toBe(true);
            });
        });

        test('run() refuses to execute code with syntax errors', () => {
            const { result } = run('var = 5;');
            expect(result).toBe(InterpretResult.COMPILE_ERROR);
        });
    });

    describe('Compiler error reporting', () => {
        test('return at top level is a compile error', () => {
            const { result } = run('return 1;');
            expect(result).toBe(InterpretResult.COMPILE_ERROR);
        });

        test("'this' outside a method is a compile error", () => {
            const { result } = run('print this;');
            expect(result).toBe(InterpretResult.COMPILE_ERROR);
        });

        test('nested function compile errors bubble to top level', () => {
            const { result } = run('fun f() { return this; } f();');
            expect(result).toBe(InterpretResult.COMPILE_ERROR);
        });

        test('constant pool overflow is a compile error, not silent corruption', () => {
            silenced(() => {
                // 300 distinct number literals exceed the 256-slot constant pool.
                const literals = Array.from({ length: 300 }, (_, i) => `${i + 0.5};`).join('\n');
                const compiler = new Compiler();
                compiler.compile(parse(literals));
                expect(compiler.hadError).toBe(true);
                expect(compiler.errors.some((e) => e.includes('Too many constants'))).toBe(true);
            });
        });

        test('identical constants are deduplicated', () => {
            silenced(() => {
                const compiler = new Compiler();
                const func = compiler.compile(parse('1; 1; 1; "a"; "a";'));
                expect(compiler.hadError).toBe(false);
                expect(func.chunk.constants.filter((c) => c === 1).length).toBe(1);
                expect(func.chunk.constants.filter((c) => c === 'a').length).toBe(1);
            });
        });
    });

    describe('VM runtime protection', () => {
        test('undefined variable is a runtime error', () => {
            const { result, output } = run('print missing;');
            expect(result).toBe(InterpretResult.RUNTIME_ERROR);
            expect(output.join('\n')).toContain("Undefined variable 'missing'");
        });

        test('type confusion in arithmetic is a runtime error', () => {
            const { result } = run('print 1 + true;');
            expect(result).toBe(InterpretResult.RUNTIME_ERROR);
        });

        test('subtraction type error carries a message', () => {
            const { result, output } = run('print "a" - 1;');
            expect(result).toBe(InterpretResult.RUNTIME_ERROR);
            expect(output.join('\n')).toContain('Operands must be numbers');
        });

        test('calling a non-callable value is a runtime error', () => {
            const { result, output } = run('var x = 5; x();');
            expect(result).toBe(InterpretResult.RUNTIME_ERROR);
            expect(output.join('\n')).toContain('Can only call functions and classes');
        });

        test('unbounded recursion triggers stack overflow, not a crash', () => {
            const { result, output } = run('fun f() { f(); } f();');
            expect(result).toBe(InterpretResult.RUNTIME_ERROR);
            expect(output.join('\n')).toContain('Stack overflow');
        });

        test('infinite loop is stopped by the execution time limit', () => {
            silenced(() => {
                const lexer = new Lexer('while (true) { 1; }');
                const parser = new Parser(lexer.scanTokens());
                const compiler = new Compiler();
                const func = compiler.compile(parser.parse());
                const vm = new VM({ maxExecutionMs: 50 });
                expect(vm.interpret(func)).toBe(InterpretResult.RUNTIME_ERROR);
            });
        });

        test('runtime errors include line information', () => {
            const { output } = run('\n\nprint missing;');
            expect(output.join('\n')).toContain('[line 3]');
        });

        test('native function misuse is a runtime error, not a host crash', () => {
            const { result, output } = run('len(5);');
            expect(result).toBe(InterpretResult.RUNTIME_ERROR);
            expect(output.join('\n')).toContain('len');
        });

        test('wrong native arity is a runtime error', () => {
            const { result } = run('clock(1);');
            expect(result).toBe(InterpretResult.RUNTIME_ERROR);
        });
    });

    describe('Array safety', () => {
        test('out-of-bounds read is a runtime error', () => {
            const { result, output } = run('var a = [1]; print a[5];');
            expect(result).toBe(InterpretResult.RUNTIME_ERROR);
            expect(output.join('\n')).toContain('out of bounds');
        });

        test('out-of-bounds write is a runtime error', () => {
            const { result } = run('var a = [1]; a[5] = 2;');
            expect(result).toBe(InterpretResult.RUNTIME_ERROR);
        });

        test('non-integer index is a runtime error', () => {
            const { result, output } = run('var a = [1, 2]; print a[0.5];');
            expect(result).toBe(InterpretResult.RUNTIME_ERROR);
            expect(output.join('\n')).toContain('integer');
        });

        test('indexing a non-array is a runtime error', () => {
            const { result } = run('var a = 5; print a[0];');
            expect(result).toBe(InterpretResult.RUNTIME_ERROR);
        });
    });

    describe('Value formatting', () => {
        test('nil prints as nil', () => {
            const { output } = run('print nil;');
            expect(output).toEqual(['nil']);
        });

        test('arrays print with canonical formatting', () => {
            const { output } = run('print [1, "two", true, nil];');
            expect(output).toEqual(['[1, two, true, nil]']);
        });

        test('cyclic arrays do not cause infinite recursion', () => {
            const { result, output } = run('var a = [1]; push(a, a); print a;');
            expect(result).toBe(InterpretResult.OK);
            expect(output).toEqual(['[1, [...]]']);
        });
    });

    describe('Closures', () => {
        test('captured locals resolve correctly (upvalue wiring)', () => {
            const { result, output } = run(`
                fun outer() {
                    var x = 42;
                    fun inner() {
                        print x;
                    }
                    inner();
                }
                outer();
            `);
            expect(result).toBe(InterpretResult.OK);
            expect(output).toEqual(['42']);
        });

        test('closures keep captured variables alive after scope exit', () => {
            const { result, output } = run(`
                var captured;
                {
                    var counter = 0;
                    fun increment() {
                        counter = counter + 1;
                        return counter;
                    }
                    captured = increment;
                }
                print captured();
                print captured();
            `);
            expect(result).toBe(InterpretResult.OK);
            expect(output).toEqual(['1', '2']);
        });

        test('local functions can recurse', () => {
            const { result, output } = run(`
                {
                    fun fact(n) {
                        if (n < 2) return 1;
                        return n * fact(n - 1);
                    }
                    print fact(5);
                }
            `);
            expect(result).toBe(InterpretResult.OK);
            expect(output).toEqual(['120']);
        });
    });
});
