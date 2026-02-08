import * as Stmt from "./ast";
import * as Expr from "./ast";
import { Chunk, OpCode } from "./chunk";
import { Token, TokenType } from "./token";
import { ObjFunction } from "./object";

enum FunctionType {
    TYPE_SCRIPT,
    TYPE_FUNCTION
}

interface Local {
    name: Token;
    depth: number;
}

export class Compiler implements Stmt.StmtVisitor<void>, Expr.ExprVisitor<void> {
    private function: ObjFunction;
    private type: FunctionType;
    private locals: Local[] = [];
    private scopeDepth: number = 0;

    constructor(type: FunctionType = FunctionType.TYPE_SCRIPT) {
        this.type = type;
        this.function = new ObjFunction(type === FunctionType.TYPE_SCRIPT ? null : "");

        // Claim stack slot 0 for existing function/script (receiver)
        this.locals.push({ name: new Token(TokenType.IDENTIFIER, "", null, 0), depth: 0 });
    }

    compile(statements: Stmt.Stmt[]): ObjFunction {
        for (const statement of statements) {
            this.execute(statement);
        }
        this.emitReturn();
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

    private emitByte(byte: number) {
        this.currentChunk().write(byte, 0);
    }

    private emitBytes(byte1: number, byte2: number) {
        this.emitByte(byte1);
        this.emitByte(byte2);
    }

    private emitConstant(value: any) {
        const constant = this.currentChunk().addConstant(value);
        this.emitBytes(OpCode.OP_CONSTANT, constant);
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
        while (this.locals.length > 0 && this.locals[this.locals.length - 1].depth > this.scopeDepth) {
            this.emitByte(OpCode.OP_POP);
            this.locals.pop();
        }
    }

    private resolveLocal(name: Token): number {
        for (let i = this.locals.length - 1; i >= 0; i--) {
            const local = this.locals[i];
            if (local.name.lexeme === name.lexeme) {
                if (local.depth === -1) {
                    console.error("Can't read local variable in its own initializer.");
                }
                return i;
            }
        }
        return -1;
    }

    private addLocal(name: Token) {
        if (this.locals.length === 256) {
            console.error("Too many local variables in function.");
            return;
        }
        this.locals.push({ name: name, depth: -1 }); // -1 means uninitialized
    }

    private markInitialized() {
        if (this.scopeDepth === 0) return;
        this.locals[this.locals.length - 1].depth = this.scopeDepth;
    }

    visitFunctionStmt(stmt: Stmt.Function): void {

        const compiler = new Compiler(FunctionType.TYPE_FUNCTION);
        compiler.function.name = stmt.name.lexeme;
        compiler.function.arity = stmt.params.length;

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

        this.emitConstant(compiler.function);
        const nameConstant = this.currentChunk().addConstant(stmt.name.lexeme);
        this.emitBytes(OpCode.OP_DEFINE_GLOBAL, nameConstant);
        this.emitBytes(OpCode.OP_DEFINE_GLOBAL, nameConstant);
    }

    visitClassStmt(stmt: Stmt.Class): void {
        const constant = this.currentChunk().addConstant(stmt.name.lexeme);
        this.emitBytes(OpCode.OP_CLASS, constant);
        this.emitBytes(OpCode.OP_DEFINE_GLOBAL, constant);
    }

    visitCallExpr(expr: Expr.Call): void {
        this.evaluate(expr.callee);
        for (const arg of expr.args) {
            this.evaluate(arg);
        }
        this.emitBytes(OpCode.OP_CALL, expr.args.length);
    }

    visitReturnStmt(stmt: Stmt.Return): void {
        if (this.type === FunctionType.TYPE_SCRIPT) {
            console.error("Can't return from top-level code.");
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
        // 1. Declare
        if (this.scopeDepth > 0) {
            for (let i = this.locals.length - 1; i >= 0; i--) {
                const local = this.locals[i];
                if (local.depth !== -1 && local.depth < this.scopeDepth) break;
                if (local.name.lexeme === stmt.name.lexeme) {
                    console.error("Already a variable with this name in this scope.");
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
            const name = stmt.name.lexeme;
            const constant = this.currentChunk().addConstant(name);
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
        if (offset > 65535) throw new Error("Loop body too large.");
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
        if (jump > 65535) throw new Error("Too much code to jump over.");
        this.currentChunk().code[offset] = (jump >> 8) & 0xff;
        this.currentChunk().code[offset + 1] = jump & 0xff;
    }

    visitBinaryExpr(expr: Expr.Binary): void {
        this.evaluate(expr.left);
        this.evaluate(expr.right);
        switch (expr.operator.type) {
            case TokenType.BANG_EQUAL: this.emitBytes(OpCode.OP_EQUAL, OpCode.OP_NOT); break;
            case TokenType.EQUAL_EQUAL: this.emitByte(OpCode.OP_EQUAL); break;
            case TokenType.GREATER: this.emitByte(OpCode.OP_GREATER); break;
            case TokenType.GREATER_EQUAL: this.emitBytes(OpCode.OP_LESS, OpCode.OP_NOT); break;
            case TokenType.LESS: this.emitByte(OpCode.OP_LESS); break;
            case TokenType.LESS_EQUAL: this.emitBytes(OpCode.OP_GREATER, OpCode.OP_NOT); break;
            case TokenType.PLUS: this.emitByte(OpCode.OP_ADD); break;
            case TokenType.MINUS: this.emitByte(OpCode.OP_SUBTRACT); break;
            case TokenType.STAR: this.emitByte(OpCode.OP_MULTIPLY); break;
            case TokenType.SLASH: this.emitByte(OpCode.OP_DIVIDE); break;
        }
    }

    visitGroupingExpr(expr: Expr.Grouping): void {
        this.evaluate(expr.expression);
    }

    visitLiteralExpr(expr: Expr.Literal): void {
        switch (expr.value) {
            case null: this.emitByte(OpCode.OP_NIL); break;
            case true: this.emitByte(OpCode.OP_TRUE); break;
            case false: this.emitByte(OpCode.OP_FALSE); break;
            default: this.emitConstant(expr.value); break;
        }
    }

    visitUnaryExpr(expr: Expr.Unary): void {
        this.evaluate(expr.right);
        switch (expr.operator.type) {
            case TokenType.MINUS: this.emitByte(OpCode.OP_NEGATE); break;
            case TokenType.BANG: this.emitByte(OpCode.OP_NOT); break;
        }
    }

    visitVariableExpr(expr: Expr.Variable): void {
        const arg = this.resolveLocal(expr.name);
        if (arg !== -1) {
            this.emitBytes(OpCode.OP_GET_LOCAL, arg);
        } else {
            const constant = this.currentChunk().addConstant(expr.name.lexeme);
            this.emitBytes(OpCode.OP_GET_GLOBAL, constant);
        }
    }

    visitLogicalExpr(expr: Expr.Logical): void {
        this.evaluate(expr.left);

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
        const arg = this.resolveLocal(expr.name);
        if (arg !== -1) {
            this.emitBytes(OpCode.OP_SET_LOCAL, arg);
        } else {
            const constant = this.currentChunk().addConstant(expr.name.lexeme);
            this.emitBytes(OpCode.OP_SET_GLOBAL, constant);
        }
    }

    visitGetExpr(expr: Expr.Get): void {
        this.evaluate(expr.object);
        const name = this.currentChunk().addConstant(expr.name.lexeme);
        this.emitBytes(OpCode.OP_GET_PROPERTY, name);
    }

    visitSetExpr(expr: Expr.Set): void {
        this.evaluate(expr.value);
        this.evaluate(expr.object);
        const name = this.currentChunk().addConstant(expr.name.lexeme);
        this.emitBytes(OpCode.OP_SET_PROPERTY, name);
    }

    visitThisExpr(expr: Expr.This): void {
        // For now, treat 'this' as a variable.
        // In a real implementation we would need to ensure we are inside a method.
        // And 'this' should be at stack slot 0 (which we Reserved in constructor but currently is generic).
        // Since we don't have methods yet, 'this' might not work as expected everywhere, but let's try resolving it as local.
        // Actually, we need to resolve it. Token "this" needs to be resolved.
        // But expr.keyword is "this".
        // Let's try to resolve it as a local variable named "this".
        // Note: The compiler constructor reserves slot 0 with name "". We might need to name it "this" inside methods.
        // For now, let's just emit an error or try to resolve it.

        // Simpler implementation for now: failure if used outside method (which we don't support yet).
        // OR: Just try to resolve it. If we are in a script, it might fail.

        // We'll leave it simple:
        console.error("'this' not fully supported yet (no methods).");
        // But to satisfy the visitor:
        this.emitByte(OpCode.OP_NIL);
    }
}
