import { VM } from '../../src/vm.js';
import { Compiler } from '../../src/compiler.js';
import { Lexer } from '../../src/lexer.js';
import { Parser } from '../../src/parser.js';
import { ObjArray } from '../../src/object.js';

function run(source: string): VM {
    const lexer = new Lexer(source);
    const tokens = lexer.scanTokens();
    const parser = new Parser(tokens);
    const statements = parser.parse();
    const compiler = new Compiler();
    const func = compiler.compile(statements);
    const vm = new VM();
    vm.interpret(func);
    return vm;
}

describe('Features', () => {
    test('Compiler and VM init', () => {
        const vm = run('var a = 1;');
        expect(vm).toBeDefined();
    });

    test('Array Literal', () => {
        const vm = run('var a = [1, 2, 3];');
        const a = vm.globals.get('a');
        expect(a).toBeInstanceOf(ObjArray);
        if (a instanceof ObjArray) {
            expect(a.elements.length).toBe(3);
            expect(a.elements[0]).toBe(1);
        }
    });
});
