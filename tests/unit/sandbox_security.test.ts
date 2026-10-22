import { run, Fradual } from '../../src/index.js';

describe('Sandbox Security Audit', () => {
    describe('Prototype Pollution Prevention', () => {
        test('script returning __proto__ key cannot pollute host Object.prototype', () => {
            const script = `
                var evil = { "__proto__": { "injected": true } };
                return evil;
            `;
            const result = run(script);
            expect(result.ok).toBe(true);

            // Verify host Object.prototype is NOT poisoned
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((Object.prototype as any).injected).toBeUndefined();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect(({} as any).injected).toBeUndefined();
        });

        test('cannot access .constructor on primitive strings, numbers or booleans to reach Function', () => {
            const engine = new Fradual();
            // Strings and numbers do not have properties
            const res1 = engine.run('var s = "test"; return s.constructor;');
            expect(res1.ok).toBe(false);
            expect(res1.diagnostics[0]?.message).toContain(
                'Only instances and maps have properties',
            );

            const res2 = engine.run('var n = 123; return n.constructor;');
            expect(res2.ok).toBe(false);
            expect(res2.diagnostics[0]?.message).toContain(
                'Only instances and maps have properties',
            );
        });

        test('cannot access host Object prototype through map .constructor or .__proto__', () => {
            const engine = new Fradual();
            const res = engine.run(`
                var m = {};
                var c = m.constructor;
                var p = m.__proto__;
                return c == nil and p == nil;
            `);
            expect(res.ok).toBe(true);
            expect(res.value).toBe(true);
        });

        test('host globals do not expose inherited prototype properties', () => {
            const proto = { secretMethod: () => 'leak' };
            const hostObj = Object.create(proto);
            hostObj.safeProp = 42;

            const engine = new Fradual({
                globals: { obj: hostObj },
            });

            const res = engine.run(`
                return {
                    safe: obj.safeProp,
                    secret: obj.secretMethod
                };
            `);

            expect(res.ok).toBe(true);
            expect(res.value).toEqual({
                safe: 42,
                secret: null, // Inherited prototype was not copied into the sandbox!
            });
        });
    });

    describe('Resource Governance & Limits', () => {
        test('maxFrames stops deep recursive calls before host stack overflow', () => {
            const engine = new Fradual({ maxFrames: 32 });
            const res = engine.run(`
                fun recurse(n) {
                    return recurse(n + 1);
                }
                recurse(0);
            `);
            expect(res.ok).toBe(false);
            expect(res.status).toBe('runtime_error');
            expect(res.diagnostics[0]?.message).toContain('Stack overflow (max call depth 32)');
        });

        test('maxInstructions counts accurately and halts execution', () => {
            const engine = new Fradual({ maxInstructions: 100 });
            let iterations = 0;
            engine.define('tick', () => {
                iterations++;
            });

            const res = engine.run('while (true) { tick(); }');
            expect(res.ok).toBe(false);
            expect(res.diagnostics[0]?.message).toContain('Instruction limit exceeded');
            expect(iterations).toBeGreaterThan(0);
            expect(iterations).toBeLessThan(100);
        });
    });

    describe('Host Native Sandbox Isolation', () => {
        test('host exceptions never bubble up as unhandled host errors', () => {
            const engine = new Fradual({
                natives: {
                    badNative: () => {
                        throw new RangeError('Native failure');
                    },
                },
            });

            expect(() => {
                const res = engine.run('badNative();');
                expect(res.ok).toBe(false);
                expect(res.diagnostics[0]?.message).toContain('Native failure');
            }).not.toThrow();
        });

        test('natives can safely return nested objects without prototype pollution', () => {
            const engine = new Fradual({
                natives: {
                    fetchUser: () => ({
                        id: 1,
                        roles: ['admin'],
                        meta: { loginCount: 5 },
                    }),
                },
            });

            const res = engine.run(`
                var u = fetchUser();
                u.roles[0] = "superadmin";
                u.meta.loginCount = u.meta.loginCount + 1;
                return u;
            `);

            expect(res.ok).toBe(true);
            expect(res.value).toEqual({
                id: 1,
                roles: ['superadmin'],
                meta: { loginCount: 6 },
            });
        });

        test('cannot use array indexing to access __proto__ or array methods', () => {
            const engine = new Fradual();
            const res = engine.run('var arr = [1, 2, 3]; return arr["__proto__"];');
            expect(res.ok).toBe(false);
            expect(res.diagnostics[0]?.message).toContain('Array index must be an integer');
        });

        test('map keys matching Map.prototype methods do not collide or leak functions', () => {
            const engine = new Fradual();
            const res = engine.run(`
                var m = { "get": 10, "set": 20, "has": 30, "entries": 40, "toString": 50 };
                return m.get + m.set + m.has + m.entries + m.toString;
            `);
            expect(res.ok).toBe(true);
            expect(res.value).toBe(150);
        });

        test('natives returning circular data structures are safely handled by cycle detector', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cyclic: any = { name: 'root' };
            cyclic.self = cyclic;

            const engine = new Fradual({
                natives: {
                    getCyclic: () => cyclic,
                },
            });

            const res = engine.run(`
                var obj = getCyclic();
                return obj.self.self.name;
            `);
            expect(res.ok).toBe(true);
            expect(res.value).toBe('root');
        });

        test('infinite allocation loop is halted deterministically by maxInstructions', () => {
            const engine = new Fradual({ maxInstructions: 500 });
            const res = engine.run(`
                var arr = [];
                while (true) {
                    push(arr, "payload-data");
                }
            `);
            expect(res.ok).toBe(false);
            expect(res.diagnostics[0]?.message).toContain('Instruction limit exceeded');
        });
    });
});
