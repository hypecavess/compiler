import { run } from '../../src/index.js';

describe('Language Extensions (Maps, Modulo, Strings)', () => {
    describe('Map / Dictionary Literals', () => {
        test('creates map with string keys and accesses via bracket and dot', () => {
            const res = run(`
                var user = { "name": "Alice", "score": 95 };
                return user.name + ": " + user["score"];
            `);
            expect(res.ok).toBe(true);
            expect(res.value).toBe('Alice: 95');
        });

        test('supports unquoted identifier keys', () => {
            const res = run(`
                var config = { host: "localhost", port: 8080, secure: false };
                return config.host + ":" + config.port;
            `);
            expect(res.ok).toBe(true);
            expect(res.value).toBe('localhost:8080');
        });

        test('empty map creates empty object', () => {
            const res = run(`
                var m = {};
                return len(m);
            `);
            expect(res.ok).toBe(true);
            expect(res.value).toBe(0);
        });

        test('modifying map properties via dot and bracket notation', () => {
            const res = run(`
                var data = { a: 1 };
                data.b = 2;
                data["c"] = 3;
                data.a = 100;
                return data;
            `);
            expect(res.ok).toBe(true);
            expect(res.value).toEqual({ a: 100, b: 2, c: 3 });
        });

        test('len() returns number of entries in map', () => {
            const res = run(`
                var m = { a: 1, b: 2, c: 3 };
                return len(m);
            `);
            expect(res.ok).toBe(true);
            expect(res.value).toBe(3);
        });

        test('missing map key returns nil', () => {
            const res = run(`
                var m = { a: 1 };
                return m.nonexistent == nil and m["missing"] == nil;
            `);
            expect(res.ok).toBe(true);
            expect(res.value).toBe(true);
        });

        test('nested maps work seamlessly', () => {
            const res = run(`
                var org = {
                    title: "TechCorp",
                    lead: {
                        name: "Bob",
                        skills: ["compiler", "vm"]
                    }
                };
                return org.lead.name + " works at " + org.title + " with " + org.lead.skills[0];
            `);
            expect(res.ok).toBe(true);
            expect(res.value).toBe('Bob works at TechCorp with compiler');
        });
    });

    describe('Modulo Operator (%)', () => {
        test('computes integer remainder', () => {
            const res = run(`
                return 17 % 5;
            `);
            expect(res.ok).toBe(true);
            expect(res.value).toBe(2);
        });

        test('works in complex arithmetic expressions', () => {
            const res = run(`
                return (10 + 5) % 4 * 2;
            `);
            expect(res.ok).toBe(true);
            expect(res.value).toBe(6);
        });

        test('error when operand is not a number', () => {
            const res = run(`
                return "10" % 3;
            `);
            expect(res.ok).toBe(false);
            expect(res.status).toBe('runtime_error');
        });
    });

    describe('String Escape Sequences', () => {
        test('handles newline, tab, quotes, and backslash', () => {
            const res = run(`
                return "line1\\nline2\\t\\"quoted\\"\\\\done";
            `);
            expect(res.ok).toBe(true);
            expect(res.value).toBe('line1\nline2\t"quoted"\\done');
        });
    });

    describe('String Concatenation Ergonomics', () => {
        test('automatically coerces numbers, booleans, arrays and nil when concatenated with string', () => {
            const res = run(`
                var out = "";
                out = out + "Score: " + 100;
                out = out + ", Active: " + true;
                out = out + ", Empty: " + nil;
                out = out + ", List: " + [1, 2];
                return out;
            `);
            expect(res.ok).toBe(true);
            expect(res.value).toBe('Score: 100, Active: true, Empty: nil, List: [1, 2]');
        });

        test('preserves type error when neither operand is a string', () => {
            const res = run(`
                return 10 + true;
            `);
            expect(res.ok).toBe(false);
            expect(res.status).toBe('runtime_error');
        });
    });
});
