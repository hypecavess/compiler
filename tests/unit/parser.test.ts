import { parse } from '../helpers.js';
import * as Expr from '../../src/ast.js';
import * as Stmt from '../../src/ast.js';

describe('Parser', () => {
    describe('Literals', () => {
        test('number literal', () => {
            const stmts = parse('42;');
            expect(stmts).toHaveLength(1);

            const exprStmt = stmts[0] as Stmt.Expression;
            const literal = exprStmt.expression as Expr.Literal;
            expect(literal.value).toBe(42);
        });

        test('string literal', () => {
            const stmts = parse('"hello";');
            const exprStmt = stmts[0] as Stmt.Expression;
            const literal = exprStmt.expression as Expr.Literal;
            expect(literal.value).toBe('hello');
        });

        test('boolean literals', () => {
            const trueStmts = parse('true;');
            const falseStmts = parse('false;');

            expect(((trueStmts[0] as Stmt.Expression).expression as Expr.Literal).value).toBe(true);
            expect(((falseStmts[0] as Stmt.Expression).expression as Expr.Literal).value).toBe(
                false,
            );
        });

        test('nil literal', () => {
            const stmts = parse('nil;');
            const literal = (stmts[0] as Stmt.Expression).expression as Expr.Literal;
            expect(literal.value).toBe(null);
        });
    });

    describe('Arithmetic Expressions', () => {
        test('addition', () => {
            const stmts = parse('1 + 2;');
            const expr = (stmts[0] as Stmt.Expression).expression as Expr.Binary;

            expect(expr.operator.lexeme).toBe('+');
            expect((expr.left as Expr.Literal).value).toBe(1);
            expect((expr.right as Expr.Literal).value).toBe(2);
        });

        test('operator precedence', () => {
            const stmts = parse('1 + 2 * 3;');
            const expr = (stmts[0] as Stmt.Expression).expression as Expr.Binary;

            expect(expr.operator.lexeme).toBe('+');
            expect((expr.left as Expr.Literal).value).toBe(1);

            const right = expr.right as Expr.Binary;
            expect(right.operator.lexeme).toBe('*');
        });

        test('grouping', () => {
            const stmts = parse('(1 + 2) * 3;');
            const expr = (stmts[0] as Stmt.Expression).expression as Expr.Binary;

            expect(expr.operator.lexeme).toBe('*');
        });
    });

    describe('Variable Declaration', () => {
        test('with initializer', () => {
            const stmts = parse('var x = 10;');
            const varStmt = stmts[0] as Stmt.Var;

            expect(varStmt.name.lexeme).toBe('x');
            expect((varStmt.initializer as Expr.Literal).value).toBe(10);
        });

        test('without initializer', () => {
            const stmts = parse('var x;');
            const varStmt = stmts[0] as Stmt.Var;

            expect(varStmt.name.lexeme).toBe('x');
            expect(varStmt.initializer).toBeNull();
        });
    });

    describe('Control Flow', () => {
        test('if statement', () => {
            const stmts = parse('if (true) print 1;');
            const ifStmt = stmts[0] as Stmt.If;

            expect(ifStmt.condition).toBeDefined();
            expect(ifStmt.thenBranch).toBeDefined();
            expect(ifStmt.elseBranch).toBeNull();
        });

        test('if-else statement', () => {
            const stmts = parse('if (true) print 1; else print 2;');
            const ifStmt = stmts[0] as Stmt.If;

            expect(ifStmt.elseBranch).not.toBeNull();
        });

        test('while statement', () => {
            const stmts = parse('while (true) print 1;');
            const whileStmt = stmts[0] as Stmt.While;

            expect(whileStmt.condition).toBeDefined();
            expect(whileStmt.body).toBeDefined();
        });
    });

    describe('Functions', () => {
        test('function declaration', () => {
            const stmts = parse('fun greet(name) { print name; }');
            const funStmt = stmts[0] as Stmt.FunctionStmt;

            expect(funStmt.name.lexeme).toBe('greet');
            expect(funStmt.params).toHaveLength(1);
            expect(funStmt.params[0]!.lexeme).toBe('name');
            expect(funStmt.body).toHaveLength(1);
        });

        test('function call', () => {
            const stmts = parse('foo(1, 2, 3);');
            const exprStmt = stmts[0] as Stmt.Expression;
            const call = exprStmt.expression as Expr.Call;

            expect((call.callee as Expr.Variable).name.lexeme).toBe('foo');
            expect(call.args).toHaveLength(3);
        });
    });

    describe('Logical Operators', () => {
        test('and operator', () => {
            const stmts = parse('true and false;');
            const expr = (stmts[0] as Stmt.Expression).expression as Expr.Logical;

            expect(expr.operator.lexeme).toBe('and');
        });

        test('or operator', () => {
            const stmts = parse('true or false;');
            const expr = (stmts[0] as Stmt.Expression).expression as Expr.Logical;

            expect(expr.operator.lexeme).toBe('or');
        });
    });

    describe('Assignment', () => {
        test('variable assignment', () => {
            const stmts = parse('x = 5;');
            const expr = (stmts[0] as Stmt.Expression).expression as Expr.Assign;

            expect(expr.name.lexeme).toBe('x');
            expect((expr.value as Expr.Literal).value).toBe(5);
        });
    });
});
