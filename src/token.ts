export enum TokenType {
    // Single-character tokens.
    LEFT_PAREN,
    RIGHT_PAREN,
    LEFT_BRACE,
    RIGHT_BRACE,
    LEFT_BRACKET,
    RIGHT_BRACKET,
    COMMA,
    DOT,
    MINUS,
    PLUS,
    SEMICOLON,
    SLASH,
    STAR,

    // One or two character tokens.
    BANG,
    BANG_EQUAL,
    EQUAL,
    EQUAL_EQUAL,
    GREATER,
    GREATER_EQUAL,
    LESS,
    LESS_EQUAL,

    // Literals.
    IDENTIFIER,
    STRING,
    NUMBER,

    // Keywords.
    AND,
    CLASS,
    ELSE,
    FALSE,
    FUN,
    FOR,
    IF,
    NIL,
    OR,
    PRINT,
    RETURN,
    SUPER, // Reserved for future inheritance support (not yet implemented in parser/compiler/VM)
    THIS,
    TRUE,
    VAR,
    WHILE,

    EOF,
}

export type LiteralType = string | number | boolean | null;

export class Token {
    type: TokenType;
    lexeme: string;
    literal: LiteralType;
    line: number;

    constructor(type: TokenType, lexeme: string, literal: LiteralType, line: number) {
        this.type = type;
        this.lexeme = lexeme;
        this.literal = literal;
        this.line = line;
    }

    toString(): string {
        return `${TokenType[this.type]} ${this.lexeme} ${this.literal}`;
    }
}
