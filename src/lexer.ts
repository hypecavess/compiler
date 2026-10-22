import { Token, TokenType, LiteralType } from './token.js';
import { Diagnostic, formatDiagnostic } from './diagnostic.js';

export class Lexer {
    private source: string;
    private tokens: Token[] = [];
    private start: number = 0;
    private current: number = 0;
    private line: number = 1;
    readonly diagnostics: Diagnostic[] = [];

    /** Human-readable error messages (formatted diagnostics). */
    get errors(): string[] {
        return this.diagnostics.map(formatDiagnostic);
    }

    get hadError(): boolean {
        return this.diagnostics.length > 0;
    }

    private static readonly keywords: Map<string, TokenType> = new Map([
        ['and', TokenType.AND],
        ['class', TokenType.CLASS],
        ['else', TokenType.ELSE],
        ['false', TokenType.FALSE],
        ['for', TokenType.FOR],
        ['fun', TokenType.FUN],
        ['if', TokenType.IF],
        ['nil', TokenType.NIL],
        ['or', TokenType.OR],
        ['print', TokenType.PRINT],
        ['return', TokenType.RETURN],
        ['super', TokenType.SUPER],
        ['this', TokenType.THIS],
        ['true', TokenType.TRUE],
        ['var', TokenType.VAR],
        ['while', TokenType.WHILE],
    ]);

    constructor(source: string) {
        this.source = source;
    }

    scanTokens(): Token[] {
        while (!this.isAtEnd()) {
            this.start = this.current;
            this.scanToken();
        }

        this.tokens.push(new Token(TokenType.EOF, '', null, this.line));
        return this.tokens;
    }

    private scanToken(): void {
        const c = this.advance();
        switch (c) {
            case '(':
                this.addToken(TokenType.LEFT_PAREN);
                break;
            case ')':
                this.addToken(TokenType.RIGHT_PAREN);
                break;
            case '{':
                this.addToken(TokenType.LEFT_BRACE);
                break;
            case '}':
                this.addToken(TokenType.RIGHT_BRACE);
                break;
            case '[':
                this.addToken(TokenType.LEFT_BRACKET);
                break;
            case ']':
                this.addToken(TokenType.RIGHT_BRACKET);
                break;
            case ',':
                this.addToken(TokenType.COMMA);
                break;
            case '.':
                this.addToken(TokenType.DOT);
                break;
            case '-':
                this.addToken(TokenType.MINUS);
                break;
            case '+':
                this.addToken(TokenType.PLUS);
                break;
            case ':':
                this.addToken(TokenType.COLON);
                break;
            case '%':
                this.addToken(TokenType.PERCENT);
                break;
            case ';':
                this.addToken(TokenType.SEMICOLON);
                break;
            case '*':
                this.addToken(TokenType.STAR);
                break;
            case '!':
                this.addToken(this.match('=') ? TokenType.BANG_EQUAL : TokenType.BANG);
                break;
            case '=':
                this.addToken(this.match('=') ? TokenType.EQUAL_EQUAL : TokenType.EQUAL);
                break;
            case '<':
                this.addToken(this.match('=') ? TokenType.LESS_EQUAL : TokenType.LESS);
                break;
            case '>':
                this.addToken(this.match('=') ? TokenType.GREATER_EQUAL : TokenType.GREATER);
                break;
            case '/':
                if (this.match('/')) {
                    while (this.peek() !== '\n' && !this.isAtEnd()) this.advance();
                } else {
                    this.addToken(TokenType.SLASH);
                }
                break;

            case ' ':
            case '\r':
            case '\t':
                break;

            case '\n':
                this.line++;
                break;

            case '"':
                this.string();
                break;

            default:
                if (this.isDigit(c)) {
                    this.number();
                } else if (this.isAlpha(c)) {
                    this.identifier();
                } else {
                    this.error(`Unexpected character '${c}'.`);
                }
                break;
        }
    }

    private identifier(): void {
        while (this.isAlphaNumeric(this.peek())) this.advance();

        const text = this.source.substring(this.start, this.current);
        const type = Lexer.keywords.get(text) ?? TokenType.IDENTIFIER;
        this.addToken(type);
    }

    private number(): void {
        while (this.isDigit(this.peek())) this.advance();

        if (this.peek() === '.' && this.isDigit(this.peekNext())) {
            this.advance();
            while (this.isDigit(this.peek())) this.advance();
        }

        this.addToken(
            TokenType.NUMBER,
            parseFloat(this.source.substring(this.start, this.current)),
        );
    }

    private string(): void {
        let value = '';
        while (this.peek() !== '"' && !this.isAtEnd()) {
            if (this.peek() === '\n') this.line++;
            if (this.peek() === '\\') {
                this.advance();
                const esc = this.advance();
                switch (esc) {
                    case 'n':
                        value += '\n';
                        break;
                    case 'r':
                        value += '\r';
                        break;
                    case 't':
                        value += '\t';
                        break;
                    case '\\':
                        value += '\\';
                        break;
                    case '"':
                        value += '"';
                        break;
                    case '0':
                        value += '\0';
                        break;
                    default:
                        value += '\\' + esc;
                        break;
                }
            } else {
                value += this.advance();
            }
        }

        if (this.isAtEnd()) {
            this.error('Unterminated string.');
            return;
        }

        this.advance();
        this.addToken(TokenType.STRING, value);
    }

    private match(expected: string): boolean {
        if (this.isAtEnd()) return false;
        if (this.source.charAt(this.current) !== expected) return false;

        this.current++;
        return true;
    }

    private peek(): string {
        if (this.isAtEnd()) return '\0';
        return this.source.charAt(this.current);
    }

    private peekNext(): string {
        if (this.current + 1 >= this.source.length) return '\0';
        return this.source.charAt(this.current + 1);
    }

    private isAlpha(c: string): boolean {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
    }

    private isAlphaNumeric(c: string): boolean {
        return this.isAlpha(c) || this.isDigit(c);
    }

    private isDigit(c: string): boolean {
        return c >= '0' && c <= '9';
    }

    private isAtEnd(): boolean {
        return this.current >= this.source.length;
    }

    private advance(): string {
        return this.source.charAt(this.current++);
    }

    private addToken(type: TokenType, literal: LiteralType = null): void {
        const text = this.source.substring(this.start, this.current);
        this.tokens.push(new Token(type, text, literal, this.line));
    }

    private error(message: string): void {
        this.diagnostics.push({ kind: 'lexical', message, line: this.line });
    }
}
