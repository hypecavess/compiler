import { compile } from '../helpers';
import { OpCode } from '../../src/chunk';

describe('Compiler', () => {
    describe('Constants', () => {
        test('number constant', () => {
            const func = compile('42;');

            expect(func.chunk.constants).toContain(42);
            expect(func.chunk.code).toContain(OpCode.OP_CONSTANT);
        });

        test('string constant', () => {
            const func = compile('"hello";');

            expect(func.chunk.constants).toContain('hello');
        });
    });

    describe('Arithmetic Operations', () => {
        test('addition bytecode', () => {
            const func = compile('1 + 2;');

            expect(func.chunk.code).toContain(OpCode.OP_ADD);
        });

        test('subtraction bytecode', () => {
            const func = compile('5 - 3;');

            expect(func.chunk.code).toContain(OpCode.OP_SUBTRACT);
        });

        test('multiplication bytecode', () => {
            const func = compile('2 * 3;');

            expect(func.chunk.code).toContain(OpCode.OP_MULTIPLY);
        });

        test('division bytecode', () => {
            const func = compile('10 / 2;');

            expect(func.chunk.code).toContain(OpCode.OP_DIVIDE);
        });
    });

    describe('Comparison Operations', () => {
        test('equality bytecode', () => {
            const func = compile('1 == 2;');

            expect(func.chunk.code).toContain(OpCode.OP_EQUAL);
        });

        test('greater than bytecode', () => {
            const func = compile('1 > 2;');

            expect(func.chunk.code).toContain(OpCode.OP_GREATER);
        });

        test('less than bytecode', () => {
            const func = compile('1 < 2;');

            expect(func.chunk.code).toContain(OpCode.OP_LESS);
        });
    });

    describe('Variables', () => {
        test('global variable definition', () => {
            const func = compile('var x = 10;');

            expect(func.chunk.code).toContain(OpCode.OP_DEFINE_GLOBAL);
            expect(func.chunk.constants).toContain('x');
        });

        test('global variable read', () => {
            const func = compile('var x = 10; x;');

            expect(func.chunk.code).toContain(OpCode.OP_GET_GLOBAL);
        });

        test('global variable assignment', () => {
            const func = compile('var x = 10; x = 20;');

            expect(func.chunk.code).toContain(OpCode.OP_SET_GLOBAL);
        });
    });

    describe('Control Flow', () => {
        test('if statement jump bytecode', () => {
            const func = compile('if (true) print 1;');

            expect(func.chunk.code).toContain(OpCode.OP_JUMP_IF_FALSE);
            expect(func.chunk.code).toContain(OpCode.OP_JUMP);
        });

        test('while statement loop bytecode', () => {
            const func = compile('while (false) print 1;');

            expect(func.chunk.code).toContain(OpCode.OP_JUMP_IF_FALSE);
            expect(func.chunk.code).toContain(OpCode.OP_LOOP);
        });
    });

    describe('Functions', () => {
        test('function bytecode', () => {
            const func = compile('fun test() { return 1; }');

            expect(func.chunk.code).toContain(OpCode.OP_DEFINE_GLOBAL);
            expect(func.chunk.constants).toContain('test');
        });

        test('function call bytecode', () => {
            const func = compile('fun test() {} test();');

            expect(func.chunk.code).toContain(OpCode.OP_CALL);
        });
    });

    describe('Print', () => {
        test('print bytecode', () => {
            const func = compile('print 42;');

            expect(func.chunk.code).toContain(OpCode.OP_PRINT);
        });
    });

    describe('Return', () => {
        test('implicit return', () => {
            const func = compile('1 + 2;');

            expect(func.chunk.code).toContain(OpCode.OP_RETURN);
        });
    });
});
