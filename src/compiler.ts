// Dual import for semantic separation: Stmt.X for statements, Expr.X for expressions
import * as Stmt from './ast.js';
import * as Expr from './ast.js';
import { Chunk, OpCode } from './chunk.js';
import { Token, TokenType } from './token.js';
import { ObjFunction, Value } from './object.js';

enum FunctionType {
    TYPE_SCRIPT,
    TYPE_FUNCTION,
}

interface Local {
    name: Token;
    depth: number;
    isCaptured: boolean;
}

interface Upvalue {
    index: number;
    isLocal: boolean;
}

export class Compiler implements Stmt.StmtVisitor<void>, Expr.ExprVisitor<void> {
    private static readonly MAX_CONSTANTS = 256;
    private static readonly MAX_LOCALS = 256;

    private enclosing: Compiler | null = null;
    private function: ObjFunction;
    private type: FunctionType;
    private locals: Local[] = [];
    private upvalues: Upvalue[] = [];
    private scopeDepth: number = 0;
    private currentLine: number = 0;
    readonly errors: string[] = [];

    get hadError(): boolean {
        return this.errors.length > 0;
    }

    constructor(type: FunctionType = FunctionType.TYPE_SCRIPT, enclosing: Compiler | null = null) {
        this.enclosing = enclosing;
        this.type = type;
        this.function = new ObjFunction(type === FunctionType.TYPE_SCRIPT ? null : '');

        // Claim stack slot 0 for existing function/script (receiver)
        this.locals.push({
            name: new Token(TokenType.IDENTIFIER, '', null, 0),
            depth: 0,
            isCaptured: false,
        });
    }

    compile(statements: Stmt.Stmt[]): ObjFunction {
        for (const statement of statements) {
            this.execute(statement);
        }
        this.emitReturn();
        this.function.upvalueCount = this.upvalues.length;
        return this.function;
    }

    private execute(stmt: Stmt.Stmt) {
        stmt.accept(this);
    }

    private evaluate(expr: Expr.Expr) {
        expr.accept(this);
    }

    private currentChunk(): Chunk {
        return this.function.chunk;
    }

    private error(message: string, line: number = this.currentLine): void {
        const formatted = `[line ${line}] Compile Error: ${message}`;
        this.errors.push(formatted);
        console.error(formatted);
    }

    private emitByte(byte: number, line: number = this.currentLine) {
        this.currentChunk().write(byte, line);
    }

    private emitBytes(byte1: number, byte2: number) {
        this.emitByte(byte1);
        this.emitByte(byte2);
    }

    private makeConstant(value: Value): number {
        const chunk = this.currentChunk();
        // Reuse identical primitive constants to conserve the limited pool.
        if (value === null || typeof value !== 'object') {
            const existing = chunk.constants.indexOf(value);
            if (existing !== -1) return existing;
        }
        const index = chunk.addConstant(value);
        if (index >= Compiler.MAX_CONSTANTS) {
            this.error(`Too many constants in one chunk (max ${Compiler.MAX_CONSTANTS}).`);
            return 0;
        }
        return index;
    }

    private emitConstant(value: Value) {
        this.emitBytes(OpCode.OP_CONSTANT, this.makeConstant(value));
    }

    private emitReturn() {
        this.emitByte(OpCode.OP_NIL); // Implicit return nil
        this.emitByte(OpCode.OP_RETURN);
    }

    private beginScope() {
        this.scopeDepth++;
    }

    private endScope() {
        this.scopeDepth--;
        // Pop locals from stack
        while (this.locals.length > 0) {
            const top = this.locals[this.locals.length - 1];
            if (!top || top.depth <= this.scopeDepth) break;

            const local = this.locals.pop();
            if (local && local.isCaptured) {
                this.emitByte(OpCode.OP_CLOSE_UPVALUE);
            } else {
                this.emitByte(OpCode.OP_POP);
            }
        }
    }

    private resolveLocal(name: Token): number {
        for (let i = this.locals.length - 1; i >= 0; i--) {
            const local = this.locals[i];
            if (!local) continue;
            if (local.name.lexeme === name.lexeme) {
                if (local.depth === -1) {
                    this.error("Can't read local variable in its own initializer.", name.line);
                }
                return i;
            }
        }
        return -1;
    }

    private resolveUpvalue(name: Token): number {
        if (this.enclosing === null) return -1;

        const local = this.enclosing.resolveLocal(name);
        if (local !== -1) {
            if (this.enclosing.locals[local]) {
                this.enclosing.locals[local]!.isCaptured = true;
            }
            return this.addUpvalue(local, true);
        }

        const upvalue = this.enclosing.resolveUpvalue(name);
        if (upvalue !== -1) {
            return this.addUpvalue(upvalue, false);
        }

        return -1;
    }

    private addUpvalue(index: number, isLocal: boolean): number {
        for (let i = 0; i < this.upvalues.length; i++) {
            const upvalue = this.upvalues[i];
            if (!upvalue) continue;
            if (upvalue.index === index && upvalue.isLocal === isLocal) {
                return i;
            }
        }

        this.upvalues.push({ index, isLocal });
        return this.upvalues.length - 1;
    }

    private addLocal(name: Token) {
        if (this.locals.length === Compiler.MAX_LOCALS) {
            this.error('Too many local variables in function.', name.line);
            return;
        }
        this.locals.push({ name: name, depth: -1, isCaptured: false }); // -1 means uninitialized
    }

    private markInitialized() {
        if (this.scopeDepth === 0) return;
        const local = this.locals[this.locals.length - 1];
        if (local) local.depth = this.scopeDepth;
    }

    visitFunctionStmt(stmt: Stmt.FunctionStmt): void {
        this.currentLine = stmt.name.line;

        // Declare the function name before compiling the body so that
        // local functions can recursively refer to themselves.
        if (this.scopeDepth > 0) {
            this.addLocal(stmt.name);
            this.markInitialized();
        }

        const compiler = new Compiler(FunctionType.TYPE_FUNCTION, this); // Pass enclosing compiler
        compiler.function.name = stmt.name.lexeme;
        compiler.function.arity = stmt.params.length;
        compiler.currentLine = stmt.name.line;

        compiler.beginScope();
        for (const param of stmt.params) {
            compiler.addLocal(param);
            compiler.markInitialized();
        }

        for (const statement of stmt.body) {
            compiler.execute(statement);
        }
        compiler.endScope();

        compiler.emitReturn();

        // Record how many upvalues the VM must wire up when executing OP_CLOSURE.
        compiler.function.upvalueCount = compiler.upvalues.length;

        // Bubble nested compile errors up to the top-level compiler.
        this.errors.push(...compiler.errors);

        const constant = this.makeConstant(compiler.function);
        this.emitBytes(OpCode.OP_CLOSURE, constant);

        for (const upvalue of compiler.upvalues) {
            this.emitByte(upvalue.isLocal ? 1 : 0);
            this.emitByte(upvalue.index);
        }

        if (this.scopeDepth === 0) {
            const nameConstant = this.makeConstant(stmt.name.lexeme);
            this.emitBytes(OpCode.OP_DEFINE_GLOBAL, nameConstant);
        }
    }

    visitClassStmt(stmt: Stmt.Class): void {
        this.currentLine = stmt.name.line;
        const constant = this.makeConstant(stmt.name.lexeme);
        this.emitBytes(OpCode.OP_CLASS, constant);
        this.emitBytes(OpCode.OP_DEFINE_GLOBAL, constant);
    }

    visitCallExpr(expr: Expr.Call): void {
        this.evaluate(expr.callee);
        for (const arg of expr.args) {
            this.evaluate(arg);
        }
        this.currentLine = expr.paren.line;
        this.emitBytes(OpCode.OP_CALL, expr.args.length);
    }

    visitReturnStmt(stmt: Stmt.Return): void {
        this.currentLine = stmt.keyword.line;
        if (this.type === FunctionType.TYPE_SCRIPT) {
            this.error("Can't return from top-level code.", stmt.keyword.line);
        }

        if (stmt.value == null) {
            this.emitByte(OpCode.OP_NIL);
        } else {
            this.evaluate(stmt.value);
        }
        this.emitByte(OpCode.OP_RETURN);
    }

    visitBlockStmt(stmt: Stmt.Block): void {
        this.beginScope();
        for (const statement of stmt.statements) {
            this.execute(statement);
        }
        this.endScope();
    }

    visitExpressionStmt(stmt: Stmt.Expression): void {
        this.evaluate(stmt.expression);
        this.emitByte(OpCode.OP_POP);
    }

    visitPrintStmt(stmt: Stmt.Print): void {
        this.evaluate(stmt.expression);
        this.emitByte(OpCode.OP_PRINT);
    }

    visitVarStmt(stmt: Stmt.Var): void {
        this.currentLine = stmt.name.line;
        // 1. Declare
        if (this.scopeDepth > 0) {
            for (let i = this.locals.length - 1; i >= 0; i--) {
                const local = this.locals[i];
                if (!local) continue;
                if (local.depth !== -1 && local.depth < this.scopeDepth) break;
                if (local.name.lexeme === stmt.name.lexeme) {
                    this.error('Already a variable with this name in this scope.', stmt.name.line);
                }
            }
            this.addLocal(stmt.name);
        }

        // 2. Initialize
        if (stmt.initializer) {
            this.evaluate(stmt.initializer);
        } else {
            this.emitByte(OpCode.OP_NIL);
        }

        // 3. Define
        if (this.scopeDepth > 0) {
            this.markInitialized();
        } else {
            const constant = this.makeConstant(stmt.name.lexeme);
            this.emitBytes(OpCode.OP_DEFINE_GLOBAL, constant);
        }
    }

    visitIfStmt(stmt: Stmt.If): void {
        this.evaluate(stmt.condition);

        this.emitByte(OpCode.OP_JUMP_IF_FALSE);
        this.emitByte(0xff);
        this.emitByte(0xff);
        const thenJump = this.currentChunk().code.length - 2;

        this.emitByte(OpCode.OP_POP);
        this.execute(stmt.thenBranch);

        this.emitByte(OpCode.OP_JUMP);
        this.emitByte(0xff);
        this.emitByte(0xff);
        const elseJump = this.currentChunk().code.length - 2;

        this.patchJump(thenJump);
        this.emitByte(OpCode.OP_POP);

        if (stmt.elseBranch) {
            this.execute(stmt.elseBranch);
        }

        this.patchJump(elseJump);
    }

    visitWhileStmt(stmt: Stmt.While): void {
        const loopStart = this.currentChunk().code.length;
        this.evaluate(stmt.condition);

        this.emitByte(OpCode.OP_JUMP_IF_FALSE);
        this.emitByte(0xff);
        this.emitByte(0xff);
        const exitJump = this.currentChunk().code.length - 2;

        this.emitByte(OpCode.OP_POP);
        this.execute(stmt.body);

        this.emitLoop(loopStart);

        this.patchJump(exitJump);
        this.emitByte(OpCode.OP_POP);
    }

    private emitLoop(loopStart: number) {
        this.emitByte(OpCode.OP_LOOP);
        const offset = this.currentChunk().code.length - loopStart + 2;
        if (offset > 65535) this.error('Loop body too large.');
        this.emitByte((offset >> 8) & 0xff);
        this.emitByte(offset & 0xff);
    }

    private emitJump(instruction: number): number {
        this.emitByte(instruction);
        this.emitByte(0xff);
        this.emitByte(0xff);
        return this.currentChunk().code.length - 2;
    }

    private patchJump(offset: number) {
        const jump = this.currentChunk().code.length - offset - 2;
        if (jump > 65535) this.error('Too much code to jump over.');
        this.currentChunk().code[offset] = (jump >> 8) & 0xff;
        this.currentChunk().code[offset + 1] = jump & 0xff;
    }

    visitBinaryExpr(expr: Expr.Binary): void {
        this.evaluate(expr.left);
        this.evaluate(expr.right);
        this.currentLine = expr.operator.line;
        switch (expr.operator.type) {
            case TokenType.BANG_EQUAL:
                this.emitBytes(OpCode.OP_EQUAL, OpCode.OP_NOT);
                break;
            case TokenType.EQUAL_EQUAL:
                this.emitByte(OpCode.OP_EQUAL);
                break;
            case TokenType.GREATER:
                this.emitByte(OpCode.OP_GREATER);
                break;
            case TokenType.GREATER_EQUAL:
                this.emitBytes(OpCode.OP_LESS, OpCode.OP_NOT);
                break;
            case TokenType.LESS:
                this.emitByte(OpCode.OP_LESS);
                break;
            case TokenType.LESS_EQUAL:
                this.emitBytes(OpCode.OP_GREATER, OpCode.OP_NOT);
                break;
            case TokenType.PLUS:
                this.emitByte(OpCode.OP_ADD);
                break;
            case TokenType.MINUS:
                this.emitByte(OpCode.OP_SUBTRACT);
                break;
            case TokenType.STAR:
                this.emitByte(OpCode.OP_MULTIPLY);
                break;
            case TokenType.SLASH:
                this.emitByte(OpCode.OP_DIVIDE);
                break;
        }
    }

    visitGroupingExpr(expr: Expr.Grouping): void {
        this.evaluate(expr.expression);
    }

    visitLiteralExpr(expr: Expr.Literal): void {
        switch (expr.value) {
            case null:
                this.emitByte(OpCode.OP_NIL);
                break;
            case true:
                this.emitByte(OpCode.OP_TRUE);
                break;
            case false:
                this.emitByte(OpCode.OP_FALSE);
                break;
            default:
                this.emitConstant(expr.value);
                break;
        }
    }

    visitUnaryExpr(expr: Expr.Unary): void {
        this.evaluate(expr.right);
        this.currentLine = expr.operator.line;
        switch (expr.operator.type) {
            case TokenType.MINUS:
                this.emitByte(OpCode.OP_NEGATE);
                break;
            case TokenType.BANG:
                this.emitByte(OpCode.OP_NOT);
                break;
        }
    }

    visitVariableExpr(expr: Expr.Variable): void {
        this.currentLine = expr.name.line;
        let arg = this.resolveLocal(expr.name);
        if (arg !== -1) {
            this.emitBytes(OpCode.OP_GET_LOCAL, arg);
        } else {
            arg = this.resolveUpvalue(expr.name);
            if (arg !== -1) {
                this.emitBytes(OpCode.OP_GET_UPVALUE, arg);
            } else {
                const constant = this.makeConstant(expr.name.lexeme);
                this.emitBytes(OpCode.OP_GET_GLOBAL, constant);
            }
        }
    }

    visitLogicalExpr(expr: Expr.Logical): void {
        this.evaluate(expr.left);
        this.currentLine = expr.operator.line;

        if (expr.operator.type === TokenType.OR) {
            const elseJump = this.emitJump(OpCode.OP_JUMP_IF_FALSE);
            const endJump = this.emitJump(OpCode.OP_JUMP);

            this.patchJump(elseJump);
            this.emitByte(OpCode.OP_POP);

            this.evaluate(expr.right);
            this.patchJump(endJump);
        } else {
            const endJump = this.emitJump(OpCode.OP_JUMP_IF_FALSE);
            this.emitByte(OpCode.OP_POP);

            this.evaluate(expr.right);
            this.patchJump(endJump);
        }
    }

    visitAssignExpr(expr: Expr.Assign): void {
        this.evaluate(expr.value);
        this.currentLine = expr.name.line;
        let arg = this.resolveLocal(expr.name);
        if (arg !== -1) {
            this.emitBytes(OpCode.OP_SET_LOCAL, arg);
        } else {
            arg = this.resolveUpvalue(expr.name);
            if (arg !== -1) {
                this.emitBytes(OpCode.OP_SET_UPVALUE, arg);
            } else {
                const constant = this.makeConstant(expr.name.lexeme);
                this.emitBytes(OpCode.OP_SET_GLOBAL, constant);
            }
        }
    }

    visitGetExpr(expr: Expr.Get): void {
        this.evaluate(expr.object);
        this.currentLine = expr.name.line;
        const name = this.makeConstant(expr.name.lexeme);
        this.emitBytes(OpCode.OP_GET_PROPERTY, name);
    }

    visitSetExpr(expr: Expr.Set): void {
        this.evaluate(expr.object);
        this.evaluate(expr.value);
        this.currentLine = expr.name.line;
        const name = this.makeConstant(expr.name.lexeme);
        this.emitBytes(OpCode.OP_SET_PROPERTY, name);
    }

    visitThisExpr(expr: Expr.This): void {
        // Methods are not implemented yet, so 'this' cannot be resolved.
        // Fail fast at compile time instead of silently evaluating to nil.
        this.error("'this' is not supported yet (classes have no methods).", expr.keyword.line);
        this.emitByte(OpCode.OP_NIL);
    }

    visitArrayLiteralExpr(expr: Expr.ArrayLiteral): void {
        for (const element of expr.elements) {
            this.evaluate(element);
        }
        this.emitByte(OpCode.OP_ARRAY);
        this.emitByte(expr.elements.length);
    }

    visitIndexGetExpr(expr: Expr.IndexGet): void {
        this.evaluate(expr.object);
        this.evaluate(expr.index);
        this.emitByte(OpCode.OP_INDEX_GET);
    }

    visitIndexSetExpr(expr: Expr.IndexSet): void {
        this.evaluate(expr.object);
        this.evaluate(expr.index);
        this.evaluate(expr.value);
        this.emitByte(OpCode.OP_INDEX_SET);
    }
}
