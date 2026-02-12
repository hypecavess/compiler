import { Token, LiteralType } from './token.js';

export interface Expr {
    accept<R>(visitor: ExprVisitor<R>): R;
}

export interface ExprVisitor<R> {
    visitBinaryExpr(expr: Binary): R;
    visitCallExpr(expr: Call): R;
    visitGroupingExpr(expr: Grouping): R;
    visitLiteralExpr(expr: Literal): R;
    visitLogicalExpr(expr: Logical): R;
    visitUnaryExpr(expr: Unary): R;
    visitVariableExpr(expr: Variable): R;
    visitAssignExpr(expr: Assign): R;
    visitGetExpr(expr: Get): R;
    visitSetExpr(expr: Set): R;
    visitThisExpr(expr: This): R;
    visitArrayLiteralExpr(expr: ArrayLiteral): R;
    visitIndexGetExpr(expr: IndexGet): R;
    visitIndexSetExpr(expr: IndexSet): R;
}

export class Call implements Expr {
    callee: Expr;
    paren: Token;
    args: Expr[];
    constructor(callee: Expr, paren: Token, args: Expr[]) {
        this.callee = callee;
        this.paren = paren;
        this.args = args;
    }
    accept<R>(visitor: ExprVisitor<R>): R {
        return visitor.visitCallExpr(this);
    }
}

export class Binary implements Expr {
    left: Expr;
    operator: Token;
    right: Expr;
    constructor(left: Expr, operator: Token, right: Expr) {
        this.left = left;
        this.operator = operator;
        this.right = right;
    }
    accept<R>(visitor: ExprVisitor<R>): R {
        return visitor.visitBinaryExpr(this);
    }
}

export class Logical implements Expr {
    left: Expr;
    operator: Token;
    right: Expr;
    constructor(left: Expr, operator: Token, right: Expr) {
        this.left = left;
        this.operator = operator;
        this.right = right;
    }
    accept<R>(visitor: ExprVisitor<R>): R {
        return visitor.visitLogicalExpr(this);
    }
}

export class Grouping implements Expr {
    expression: Expr;
    constructor(expression: Expr) {
        this.expression = expression;
    }
    accept<R>(visitor: ExprVisitor<R>): R {
        return visitor.visitGroupingExpr(this);
    }
}

export class Literal implements Expr {
    value: LiteralType;
    constructor(value: LiteralType) {
        this.value = value;
    }
    accept<R>(visitor: ExprVisitor<R>): R {
        return visitor.visitLiteralExpr(this);
    }
}

export class Unary implements Expr {
    operator: Token;
    right: Expr;
    constructor(operator: Token, right: Expr) {
        this.operator = operator;
        this.right = right;
    }
    accept<R>(visitor: ExprVisitor<R>): R {
        return visitor.visitUnaryExpr(this);
    }
}

export class Variable implements Expr {
    name: Token;
    constructor(name: Token) {
        this.name = name;
    }
    accept<R>(visitor: ExprVisitor<R>): R {
        return visitor.visitVariableExpr(this);
    }
}

export class Assign implements Expr {
    name: Token;
    value: Expr;
    constructor(name: Token, value: Expr) {
        this.name = name;
        this.value = value;
    }
    accept<R>(visitor: ExprVisitor<R>): R {
        return visitor.visitAssignExpr(this);
    }
}

export interface Stmt {
    accept<R>(visitor: StmtVisitor<R>): R;
}

export interface StmtVisitor<R> {
    visitBlockStmt(stmt: Block): R;
    visitExpressionStmt(stmt: Expression): R;
    visitFunctionStmt(stmt: FunctionStmt): R;
    visitPrintStmt(stmt: Print): R;
    visitReturnStmt(stmt: Return): R;
    visitVarStmt(stmt: Var): R;
    visitIfStmt(stmt: If): R;
    visitWhileStmt(stmt: While): R;
    visitClassStmt(stmt: Class): R;
}

export class Block implements Stmt {
    statements: Stmt[];
    constructor(statements: Stmt[]) {
        this.statements = statements;
    }
    accept<R>(visitor: StmtVisitor<R>): R {
        return visitor.visitBlockStmt(this);
    }
}

export class Class implements Stmt {
    name: Token;
    // methods to be added later if needed
    constructor(name: Token) {
        this.name = name;
    }
    accept<R>(visitor: StmtVisitor<R>): R {
        return visitor.visitClassStmt(this);
    }
}

export class Get implements Expr {
    object: Expr;
    name: Token;
    constructor(object: Expr, name: Token) {
        this.object = object;
        this.name = name;
    }
    accept<R>(visitor: ExprVisitor<R>): R {
        return visitor.visitGetExpr(this);
    }
}

export class Set implements Expr {
    object: Expr;
    name: Token;
    value: Expr;
    constructor(object: Expr, name: Token, value: Expr) {
        this.object = object;
        this.name = name;
        this.value = value;
    }
    accept<R>(visitor: ExprVisitor<R>): R {
        return visitor.visitSetExpr(this);
    }
}

export class This implements Expr {
    keyword: Token;
    constructor(keyword: Token) {
        this.keyword = keyword;
    }
    accept<R>(visitor: ExprVisitor<R>): R {
        return visitor.visitThisExpr(this);
    }
}

export class Expression implements Stmt {
    expression: Expr;
    constructor(expression: Expr) {
        this.expression = expression;
    }
    accept<R>(visitor: StmtVisitor<R>): R {
        return visitor.visitExpressionStmt(this);
    }
}

export class FunctionStmt implements Stmt {
    name: Token;
    params: Token[];
    body: Stmt[];
    constructor(name: Token, params: Token[], body: Stmt[]) {
        this.name = name;
        this.params = params;
        this.body = body;
    }
    accept<R>(visitor: StmtVisitor<R>): R {
        return visitor.visitFunctionStmt(this);
    }
}

export class Print implements Stmt {
    expression: Expr;
    constructor(expression: Expr) {
        this.expression = expression;
    }
    accept<R>(visitor: StmtVisitor<R>): R {
        return visitor.visitPrintStmt(this);
    }
}

export class Return implements Stmt {
    keyword: Token;
    value: Expr | null;
    constructor(keyword: Token, value: Expr | null) {
        this.keyword = keyword;
        this.value = value;
    }
    accept<R>(visitor: StmtVisitor<R>): R {
        return visitor.visitReturnStmt(this);
    }
}

export class Var implements Stmt {
    name: Token;
    initializer: Expr | null;
    constructor(name: Token, initializer: Expr | null) {
        this.name = name;
        this.initializer = initializer;
    }
    accept<R>(visitor: StmtVisitor<R>): R {
        return visitor.visitVarStmt(this);
    }
}

export class If implements Stmt {
    condition: Expr;
    thenBranch: Stmt;
    elseBranch: Stmt | null;
    constructor(condition: Expr, thenBranch: Stmt, elseBranch: Stmt | null) {
        this.condition = condition;
        this.thenBranch = thenBranch;
        this.elseBranch = elseBranch;
    }
    accept<R>(visitor: StmtVisitor<R>): R {
        return visitor.visitIfStmt(this);
    }
}

export class While implements Stmt {
    condition: Expr;
    body: Stmt;
    constructor(condition: Expr, body: Stmt) {
        this.condition = condition;
        this.body = body;
    }
    accept<R>(visitor: StmtVisitor<R>): R {
        return visitor.visitWhileStmt(this);
    }
}

export class ArrayLiteral implements Expr {
    elements: Expr[];
    constructor(elements: Expr[]) {
        this.elements = elements;
    }
    accept<R>(visitor: ExprVisitor<R>): R {
        return visitor.visitArrayLiteralExpr(this);
    }
}

export class IndexGet implements Expr {
    object: Expr;
    index: Expr;
    constructor(object: Expr, index: Expr) {
        this.object = object;
        this.index = index;
    }
    accept<R>(visitor: ExprVisitor<R>): R {
        return visitor.visitIndexGetExpr(this);
    }
}

export class IndexSet implements Expr {
    object: Expr;
    index: Expr;
    value: Expr;
    constructor(object: Expr, index: Expr, value: Expr) {
        this.object = object;
        this.index = index;
        this.value = value;
    }
    accept<R>(visitor: ExprVisitor<R>): R {
        return visitor.visitIndexSetExpr(this);
    }
}
