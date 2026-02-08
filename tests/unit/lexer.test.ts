import { tokenize } from '../helpers';
import { TokenType } from '../../src/token';

describe('Lexer', () => {
    describe('Single Character Tokens', () => {
        test('parentheses and operators', () => {
            const tokens = tokenize('(){},.-+;/*');
            const types = tokens.slice(0, -1).map(t => t.type);

            expect(types).toEqual([
                TokenType.LEFT_PAREN,
                TokenType.RIGHT_PAREN,
                TokenType.LEFT_BRACE,
                TokenType.RIGHT_BRACE,
                TokenType.COMMA,
                TokenType.DOT,
                TokenType.MINUS,
                TokenType.PLUS,
                TokenType.SEMICOLON,
                TokenType.SLASH,
                TokenType.STAR,
            ]);
        });
    });

    describe('Two Character Tokens', () => {
        test('comparison operators', () => {
            const tokens = tokenize('! != = == < <= > >=');
            const types = tokens.slice(0, -1).map(t => t.type);

            expect(types).toEqual([
                TokenType.BANG,
                TokenType.BANG_EQUAL,
                TokenType.EQUAL,
                TokenType.EQUAL_EQUAL,
                TokenType.LESS,
                TokenType.LESS_EQUAL,
                TokenType.GREATER,
                TokenType.GREATER_EQUAL,
            ]);
        });
    });

    describe('Literals', () => {
        test('numbers', () => {
            const tokens = tokenize('123 45.67');

            expect(tokens[0].type).toBe(TokenType.NUMBER);
            expect(tokens[0].literal).toBe(123);
            expect(tokens[1].type).toBe(TokenType.NUMBER);
            expect(tokens[1].literal).toBe(45.67);
        });

        test('strings', () => {
            const tokens = tokenize('"hello" "world"');

            expect(tokens[0].type).toBe(TokenType.STRING);
            expect(tokens[0].literal).toBe('hello');
            expect(tokens[1].type).toBe(TokenType.STRING);
            expect(tokens[1].literal).toBe('world');
        });

        test('identifiers', () => {
            const tokens = tokenize('foo bar _test');

            expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
            expect(tokens[0].lexeme).toBe('foo');
            expect(tokens[1].lexeme).toBe('bar');
            expect(tokens[2].lexeme).toBe('_test');
        });
    });

    describe('Keywords', () => {
        test('all keywords', () => {
            const tokens = tokenize('and class else false fun for if nil or print return super this true var while');
            const types = tokens.slice(0, -1).map(t => t.type);

            expect(types).toEqual([
                TokenType.AND,
                TokenType.CLASS,
                TokenType.ELSE,
                TokenType.FALSE,
                TokenType.FUN,
                TokenType.FOR,
                TokenType.IF,
                TokenType.NIL,
                TokenType.OR,
                TokenType.PRINT,
                TokenType.RETURN,
                TokenType.SUPER,
                TokenType.THIS,
                TokenType.TRUE,
                TokenType.VAR,
                TokenType.WHILE,
            ]);
        });
    });

    describe('Comments', () => {
        test('skips line comments', () => {
            const tokens = tokenize('var x = 1; // this is a comment\nvar y = 2;');
            const identifiers = tokens.filter(t => t.type === TokenType.IDENTIFIER);

            expect(identifiers.length).toBe(2);
            expect(identifiers[0].lexeme).toBe('x');
            expect(identifiers[1].lexeme).toBe('y');
        });
    });

    describe('EOF', () => {
        test('always ends with EOF', () => {
            const tokens = tokenize('');
            expect(tokens.length).toBe(1);
            expect(tokens[0].type).toBe(TokenType.EOF);
        });
    });
});
