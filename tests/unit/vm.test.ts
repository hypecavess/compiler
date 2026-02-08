import { run } from '../helpers';
import { InterpretResult } from '../../src/vm';

describe('VM', () => {
    describe('Arithmetic', () => {
        test('addition', () => {
            const { result, output } = run('print 1 + 2;');

            expect(result).toBe(InterpretResult.OK);
            expect(output).toEqual(['3']);
        });

        test('subtraction', () => {
            const { result, output } = run('print 5 - 3;');

            expect(result).toBe(InterpretResult.OK);
            expect(output).toEqual(['2']);
        });

        test('multiplication', () => {
            const { result, output } = run('print 4 * 3;');

            expect(result).toBe(InterpretResult.OK);
            expect(output).toEqual(['12']);
        });

        test('division', () => {
            const { result, output } = run('print 10 / 2;');

            expect(result).toBe(InterpretResult.OK);
            expect(output).toEqual(['5']);
        });

        test('complex expression', () => {
            const { result, output } = run('print (1 + 2) * 3;');

            expect(result).toBe(InterpretResult.OK);
            expect(output).toEqual(['9']);
        });

        test('negation', () => {
            const { result, output } = run('print -5;');

            expect(result).toBe(InterpretResult.OK);
            expect(output).toEqual(['-5']);
        });
    });

    describe('Comparison', () => {
        test('equality', () => {
            const { output } = run('print 1 == 1; print 1 == 2;');
            expect(output).toEqual(['true', 'false']);
        });

        test('inequality', () => {
            const { output } = run('print 1 != 2; print 1 != 1;');
            expect(output).toEqual(['true', 'false']);
        });

        test('greater than', () => {
            const { output } = run('print 2 > 1; print 1 > 2;');
            expect(output).toEqual(['true', 'false']);
        });

        test('less than', () => {
            const { output } = run('print 1 < 2; print 2 < 1;');
            expect(output).toEqual(['true', 'false']);
        });
    });

    describe('Strings', () => {
        test('string concatenation', () => {
            const { output } = run('print "hello" + " " + "world";');
            expect(output).toEqual(['hello world']);
        });
    });

    describe('Variables', () => {
        test('global variable', () => {
            const { output } = run('var x = 10; print x;');
            expect(output).toEqual(['10']);
        });

        test('variable assignment', () => {
            const { output } = run('var x = 1; x = 2; print x;');
            expect(output).toEqual(['2']);
        });

        test('nil initial value', () => {
            const { output } = run('var x; print x;');
            expect(output).toEqual(['null']);
        });
    });

    describe('Logical Operators', () => {
        test('and - true and true', () => {
            const { output } = run('print true and true;');
            expect(output).toEqual(['true']);
        });

        test('and - true and false', () => {
            const { output } = run('print true and false;');
            expect(output).toEqual(['false']);
        });

        test('or - false or true', () => {
            const { output } = run('print false or true;');
            expect(output).toEqual(['true']);
        });

        test('or - false or false', () => {
            const { output } = run('print false or false;');
            expect(output).toEqual(['false']);
        });

        test('short-circuit and', () => {
            const { output } = run('var a = false; print a and (a = true); print a;');
            expect(output).toEqual(['false', 'false']);
        });

        test('short-circuit or', () => {
            const { output } = run('var a = true; print a or (a = false); print a;');
            expect(output).toEqual(['true', 'true']);
        });
    });

    describe('Control Flow', () => {
        test('if - true', () => {
            const { output } = run('if (true) print "yes";');
            expect(output).toEqual(['yes']);
        });

        test('if - false', () => {
            const { output } = run('if (false) print "yes";');
            expect(output).toEqual([]);
        });

        test('if-else', () => {
            const { output } = run('if (false) print "yes"; else print "no";');
            expect(output).toEqual(['no']);
        });

        test('while loop', () => {
            const { output } = run(`
                var i = 0;
                while (i < 3) {
                    print i;
                    i = i + 1;
                }
            `);
            expect(output).toEqual(['0', '1', '2']);
        });
    });

    describe('Blocks and Scope', () => {
        test('block scope', () => {
            const { output } = run(`
                var a = "global";
                {
                    var a = "local";
                    print a;
                }
                print a;
            `);
            expect(output).toEqual(['local', 'global']);
        });
    });

    describe('Functions', () => {
        test('simple function', () => {
            const { output } = run(`
                fun sayHi() {
                    print "hi";
                }
                sayHi();
            `);
            expect(output).toEqual(['hi']);
        });

        test('function with parameters', () => {
            const { output } = run(`
                fun add(a, b) {
                    print a + b;
                }
                add(2, 3);
            `);
            expect(output).toEqual(['5']);
        });

        test('return value', () => {
            const { output } = run(`
                fun double(x) {
                    return x * 2;
                }
                print double(5);
            `);
            expect(output).toEqual(['10']);
        });

        test('recursive function', () => {
            const { output } = run(`
                fun fib(n) {
                    if (n < 2) return n;
                    return fib(n - 1) + fib(n - 2);
                }
                print fib(10);
            `);
            expect(output).toEqual(['55']);
        });
    });

    describe('Native Functions', () => {
        test('clock function', () => {
            const { result, output } = run('print clock() > 0;');
            expect(result).toBe(InterpretResult.OK);
            expect(output).toEqual(['true']);
        });
    });
});
