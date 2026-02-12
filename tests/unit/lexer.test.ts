import { tokenize } from '../helpers.js';
import { TokenType } from '../../src/token.js';

describe('Lexer', () => {
    describe('Single Character Tokens', () => {
        test('parentheses and operators', () => {
            const tokens = tokenize('(){},.-+;/*');

            expect(tokens[0]!.type).toBe(TokenType.LEFT_PAREN);
            expect(tokens[1]!.type).toBe(TokenType.RIGHT_PAREN);
            expect(tokens[2]!.type).toBe(TokenType.LEFT_BRACE);
            expect(tokens[3]!.type).toBe(TokenType.RIGHT_BRACE);
            expect(tokens[4]!.type).toBe(TokenType.COMMA);
            expect(tokens[5]!.type).toBe(TokenType.DOT);
            expect(tokens[6]!.type).toBe(TokenType.MINUS);
            expect(tokens[7]!.type).toBe(TokenType.PLUS);
            expect(tokens[8]!.type).toBe(TokenType.SEMICOLON);
            expect(tokens[9]!.type).toBe(TokenType.SLASH);
            expect(tokens[10]!.type).toBe(TokenType.STAR);
            expect(tokens[11]!.type).toBe(TokenType.EOF);
        });
    });

    describe('Two Character Tokens', () => {
        test('comparison operators', () => {
            const source = '! != = == > >= < <=';
            const tokens = tokenize(source);

            expect(tokens.length).toBe(9);
            expect(tokens[0]!.type).toBe(TokenType.BANG);
            expect(tokens[1]!.type).toBe(TokenType.BANG_EQUAL);
            expect(tokens[2]!.type).toBe(TokenType.EQUAL);
            expect(tokens[3]!.type).toBe(TokenType.EQUAL_EQUAL);
            expect(tokens[4]!.type).toBe(TokenType.GREATER);
            expect(tokens[5]!.type).toBe(TokenType.GREATER_EQUAL);
            expect(tokens[6]!.type).toBe(TokenType.LESS);
            expect(tokens[7]!.type).toBe(TokenType.LESS_EQUAL);
            expect(tokens[8]!.type).toBe(TokenType.EOF);
        });
    });

    describe('Literals', () => {
        test('numbers', () => {
            const source = '123 123.456';
            const tokens = tokenize(source);

            expect(tokens.length).toBe(3);
            expect(tokens[0]!.type).toBe(TokenType.NUMBER);
            expect(tokens[0]!.literal).toBe(123);
            expect(tokens[1]!.type).toBe(TokenType.NUMBER);
            expect(tokens[1]!.literal).toBe(123.456);
            expect(tokens[2]!.type).toBe(TokenType.EOF);
        });

        test('strings', () => {
            const source = '"hello" "world"';
            const tokens = tokenize(source);

            expect(tokens.length).toBe(3);
            expect(tokens[0]!.type).toBe(TokenType.STRING);
            expect(tokens[0]!.literal).toBe('hello');
            expect(tokens[1]!.type).toBe(TokenType.STRING);
            expect(tokens[1]!.literal).toBe('world');
            expect(tokens[2]!.type).toBe(TokenType.EOF);
        });

        test('identifiers', () => {
            const source = 'foo bar _baz';
            const tokens = tokenize(source);

            expect(tokens.length).toBe(4);
            expect(tokens[0]!.type).toBe(TokenType.IDENTIFIER);
            expect(tokens[0]!.lexeme).toBe('foo');
            expect(tokens[1]!.type).toBe(TokenType.IDENTIFIER);
            expect(tokens[1]!.lexeme).toBe('bar');
            expect(tokens[2]!.type).toBe(TokenType.IDENTIFIER);
            expect(tokens[2]!.lexeme).toBe('_baz');
            expect(tokens[3]!.type).toBe(TokenType.EOF);
        });
    });

    describe('Keywords', () => {
        test('all keywords', () => {
            const source =
                'and class else false for fun if nil or print return super this true var while';
            const tokens = tokenize(source);

            expect(tokens.length).toBe(17);
            expect(tokens[0]!.type).toBe(TokenType.AND);
            expect(tokens[1]!.type).toBe(TokenType.CLASS);
            expect(tokens[15]!.type).toBe(TokenType.WHILE);
        });
    });

    describe('Comments', () => {
        test('skips line comments', () => {
            const source = '// this is a comment\nvar';
            const tokens = tokenize(source);

            expect(tokens.length).toBe(2);
            expect(tokens[0]!.type).toBe(TokenType.VAR);
            expect(tokens[1]!.type).toBe(TokenType.EOF);
        });
    });

    describe('EOF', () => {
        test('always ends with EOF', () => {
            const tokens = tokenize('');
            expect(tokens[0]!.type).toBe(TokenType.EOF);
        });
    });
});
