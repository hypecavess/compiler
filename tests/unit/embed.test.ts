import { Fradual, run, toValue, fromValue } from '../../src/index.js';
import { ObjArray, ObjMap } from '../../src/object.js';

describe('Embedding API (Fradual Engine)', () => {
    describe('One-shot run()', () => {
        test('evaluates simple expressions and returns value', () => {
            const result = run('return 2 + 3 * 4;');
            expect(result.ok).toBe(true);
            expect(result.status).toBe('ok');
            expect(result.value).toBe(14);
            expect(result.diagnostics).toEqual([]);
        });

        test('returns nil as null', () => {
            const result = run('return nil;');
            expect(result.ok).toBe(true);
            expect(result.value).toBeNull();
        });

        test('returns arrays as JS arrays', () => {
            const result = run('return [1, "two", true];');
            expect(result.ok).toBe(true);
            expect(result.value).toEqual([1, 'two', true]);
        });
    });

    describe('Engine Instance & Globals', () => {
        test('passes JS objects and primitives to script via globals option', () => {
            const engine = new Fradual({
                globals: {
                    x: 10,
                    user: { name: 'Alice', active: true },
                },
            });

            const result = engine.run(`
                if (user.active) {
                    return user.name + " is active";
                }
                return "inactive";
            `);

            expect(result.ok).toBe(true);
            expect(result.value).toBe('Alice is active');
        });

        test('persists variables across multiple run() calls', () => {
            const engine = new Fradual();
            engine.run('var count = 0;');
            engine.run('count = count + 10;');
            const res = engine.run('return count + 5;');
            expect(res.ok).toBe(true);
            expect(res.value).toBe(15);
            expect(engine.get('count')).toBe(10);
        });

        test('set() and get() dynamically manage globals from host', () => {
            const engine = new Fradual();
            engine.set('multiplier', 3);
            const res = engine.run('return 7 * multiplier;');
            expect(res.value).toBe(21);
            engine.run('multiplier = 10;');
            expect(engine.get('multiplier')).toBe(10);
        });
    });

    describe('Host Native Functions', () => {
        test('can call host functions defined in options', () => {
            const calls: string[] = [];
            const engine = new Fradual({
                natives: {
                    log: (msg: string) => {
                        calls.push(msg);
                    },
                    add: (a: number, b: number) => a + b,
                },
            });

            const res = engine.run(`
                log("computing...");
                return add(100, 25);
            `);

            expect(res.ok).toBe(true);
            expect(res.value).toBe(125);
            expect(calls).toEqual(['computing...']);
        });

        test('exceptions thrown by host functions become script runtime errors', () => {
            const engine = new Fradual({
                natives: {
                    fail: () => {
                        throw new Error('Database connection failed');
                    },
                },
            });

            const res = engine.run('fail();');
            expect(res.ok).toBe(false);
            expect(res.status).toBe('runtime_error');
            expect(res.diagnostics.length).toBe(1);
            expect(res.diagnostics[0]?.message).toContain('Database connection failed');
        });

        test('define() adds host function after construction', () => {
            const engine = new Fradual();
            engine.define('greet', (name: string) => 'Hello, ' + name + '!');
            const res = engine.run('return greet("World");');
            expect(res.value).toBe('Hello, World!');
        });
    });

    describe('Compilation Caching & Program', () => {
        test('compiles once and runs many times with different host states', () => {
            const engine = new Fradual();
            const compiled = engine.compile('return a * 2;');
            expect(compiled.ok).toBe(true);
            expect(compiled.program).not.toBeNull();

            const program = compiled.program!;

            engine.set('a', 5);
            expect(engine.run(program).value).toBe(10);

            engine.set('a', 20);
            expect(engine.run(program).value).toBe(40);
        });

        test('program.disassemble() returns string representation of bytecode', () => {
            const engine = new Fradual();
            const compiled = engine.compile('var x = 1 + 2;');
            expect(compiled.ok).toBe(true);
            const disasm = compiled.program!.disassemble();
            expect(disasm).toContain('== script ==');
            expect(disasm).toContain('OP_CONSTANT');
            expect(disasm).toContain('OP_ADD');
        });
    });

    describe('Security & Governance', () => {
        test('maxInstructions budget halts infinite loops deterministically', () => {
            const engine = new Fradual({
                maxInstructions: 50,
            });

            const res = engine.run('while (true) {}');
            expect(res.ok).toBe(false);
            expect(res.status).toBe('runtime_error');
            expect(res.diagnostics[0]?.message).toContain('Instruction limit exceeded');
        });

        test('onPrint captures script print statements without touching console', () => {
            const output: string[] = [];
            const engine = new Fradual({
                onPrint: (text) => output.push(text),
            });

            engine.run('print "first line"; print 42;');
            expect(output).toEqual(['first line', '42']);
        });

        test('syntax error returns structured compile_error diagnostics', () => {
            const engine = new Fradual();
            const res = engine.run('var = 123;');
            expect(res.ok).toBe(false);
            expect(res.status).toBe('compile_error');
            expect(res.diagnostics.length).toBeGreaterThan(0);
            expect(res.diagnostics[0]?.kind).toBe('syntax');
        });
    });

    describe('Value Bridge (toValue / fromValue)', () => {
        test('converts nested structures and preserves cycles', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cyclic: any = { name: 'cycle' };
            cyclic.self = cyclic;

            const val = toValue(cyclic);
            expect(val).toBeInstanceOf(ObjMap);

            const back = fromValue(val) as typeof cyclic;
            expect(back.name).toBe('cycle');
            expect(back.self).toBe(back);
        });

        test('converts nested arrays', () => {
            const raw = [1, [2, [3]]];
            const val = toValue(raw);
            expect(val).toBeInstanceOf(ObjArray);
            expect(fromValue(val)).toEqual(raw);
        });

        test('allowGetters: false never executes getter functions', () => {
            let getterInvoked = false;
            const objWithGetter = {
                normal: 'yes',
                get dynamic() {
                    getterInvoked = true;
                    return 'invoked';
                },
            };

            const map = toValue(objWithGetter, {
                allowGetters: false,
                failurePolicy: 'null',
            }) as ObjMap;
            expect(getterInvoked).toBe(false);
            expect(map.entries.get('normal')).toBe('yes');
            expect(map.entries.get('dynamic')).toBe(null);
        });

        test('symmetrical omit policy in toValue and fromValue on depth exceeded', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const deepObj: any = { level1: { level2: { level3: 'too deep' } } };

            // toValue with maxDepth: 1 and failurePolicy: omit
            const map = toValue(deepObj, { maxDepth: 1, failurePolicy: 'omit' }) as ObjMap;
            expect(map.entries.has('level1')).toBe(true);
            const level1Map = map.entries.get('level1') as ObjMap;
            // level2 exceeds depth 1, so it is omitted from level1Map
            expect(level1Map.entries.has('level2')).toBe(false);

            // fromValue with maxDepth: 1 and failurePolicy: omit
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const back: any = fromValue(map, { maxDepth: 1, failurePolicy: 'omit' });
            expect(back.level1).toBeDefined();
            expect(back.level1.level2).toBeUndefined();
        });
    });

    describe('Cooperative Cancellation', () => {
        test('AbortSignal interrupts infinite loop cleanly', () => {
            const controller = new AbortController();
            const engine = new Fradual({ abortSignal: controller.signal });

            let count = 0;
            engine.define('tick', () => {
                count++;
                if (count === 5) controller.abort('Cancelled by host controller');
            });

            const res = engine.run('while(true) { tick(); }');
            expect(res.ok).toBe(false);
            expect(res.status).toBe('runtime_error');
            expect(res.diagnostics[0]?.message).toContain('Cancelled by host controller');
            expect(count).toBe(5);
        });

        test('engine.abort() stops execution during native callback', () => {
            const engine = new Fradual();
            let steps = 0;
            engine.define('step', () => {
                steps++;
                if (steps === 3) engine.abort('Manual stop requested');
            });

            const res = engine.run('while (true) { step(); }');
            expect(res.ok).toBe(false);
            expect(res.diagnostics[0]?.message).toContain('Manual stop requested');
            expect(steps).toBe(3);
        });

        test('pre-run abort halts immediately without running any code', () => {
            const engine = new Fradual();
            let nativeRan = false;
            engine.define('bad', () => {
                nativeRan = true;
            });

            engine.abort('Pre-run abort');
            const res = engine.run('bad();');
            expect(res.ok).toBe(false);
            expect(res.diagnostics[0]?.message).toContain('Pre-run abort');
            expect(nativeRan).toBe(false);
        });

        test('resetAbort() allows engine reuse after cancellation', () => {
            const engine = new Fradual();
            engine.abort('First run cancelled');

            const res1 = engine.run('return 10;');
            expect(res1.ok).toBe(false);

            engine.resetAbort();
            const res2 = engine.run('return 20;');
            expect(res2.ok).toBe(true);
            expect(res2.value).toBe(20);
        });

        test('aborted engine prevents entering new host native function call', () => {
            const controller = new AbortController();
            const engine = new Fradual({ abortSignal: controller.signal });

            let secondNativeRan = false;
            engine.define('first', () => {
                controller.abort('Abort in first');
            });
            engine.define('second', () => {
                secondNativeRan = true;
            });

            const res = engine.run('first(); second();');
            expect(res.ok).toBe(false);
            expect(secondNativeRan).toBe(false);
        });
    });

    describe('Engine Lifecycle & Re-entrancy', () => {
        test('sequential script executions on the same engine maintain independent stacks', () => {
            const engine = new Fradual();
            const r1 = engine.run('return 10 + 20;');
            expect(r1.ok).toBe(true);
            expect(r1.value).toBe(30);

            const r2 = engine.run('return 40 * 2;');
            expect(r2.ok).toBe(true);
            expect(r2.value).toBe(80);

            const r3 = engine.run('return "hello " + "world";');
            expect(r3.ok).toBe(true);
            expect(r3.value).toBe('hello world');
        });

        test('stack is cleanly reset after runtime error on reused engine', () => {
            const engine = new Fradual();
            // First run fails with runtime error
            const r1 = engine.run('var a = 10; return a + "bad" - 5;');
            expect(r1.ok).toBe(false);
            expect(r1.status).toBe('runtime_error');

            // Second run succeeds with clean operand stack
            const r2 = engine.run('return 42;');
            expect(r2.ok).toBe(true);
            expect(r2.value).toBe(42);
        });

        test('abort status is persistent across runs until explicitly reset', () => {
            const engine = new Fradual();
            engine.abort('Permanent stop');

            // Consecutive runs all fail
            const r1 = engine.run('return 1;');
            expect(r1.ok).toBe(false);
            expect(r1.diagnostics[0]?.message).toContain('Permanent stop');

            const r2 = engine.run('return 2;');
            expect(r2.ok).toBe(false);
            expect(r2.diagnostics[0]?.message).toContain('Permanent stop');

            // Resetting restores engine usability
            engine.resetAbort();
            const r3 = engine.run('return 3;');
            expect(r3.ok).toBe(true);
            expect(r3.value).toBe(3);
        });

        test('nested host calls on the same engine preserve outer IP, frames, locals and stack', () => {
            const engine = new Fradual();

            engine.define('reentrantCompute', (n: number) => {
                // Call run() on the EXACT SAME engine instance while outer script is suspended!
                const innerRes = engine.run(`
                    var factor = 3;
                    return ${n} * factor;
                `);
                return innerRes.value;
            });

            const script = `
                var a = 10;
                var b = 20;
                var res = reentrantCompute(a + b);
                var c = 5;
                return res + a + b + c;
            `;

            const res = engine.run(script);
            expect(res.ok).toBe(true);
            // res = (10 + 20) * 3 = 90
            // total = 90 + 10 + 20 + 5 = 125
            expect(res.value).toBe(125);
        });

        test('inner re-entrant error does not corrupt outer execution state', () => {
            const engine = new Fradual();

            engine.define('safeInnerEval', (code: string) => {
                const innerRes = engine.run(code);
                if (!innerRes.ok) return -1;
                return innerRes.value;
            });

            const script = `
                var x = 100;
                var fallback = safeInnerEval("var broken = 1 / nil;");
                return x + fallback;
            `;

            const res = engine.run(script);
            expect(res.ok).toBe(true);
            expect(res.value).toBe(99); // 100 + (-1) = 99
        });

        test('aborting during re-entrant execution halts both inner and outer executions', () => {
            const controller = new AbortController();
            const abortEngine = new Fradual({ abortSignal: controller.signal });
            let outerPostCallRan = false;

            abortEngine.define('haltInside', () => {
                controller.abort('Abort triggered from re-entrant level');
                abortEngine.run('var a = 1;');
            });
            abortEngine.define('postStep', () => {
                outerPostCallRan = true;
            });

            const res = abortEngine.run('haltInside(); postStep();');
            expect(res.ok).toBe(false);
            expect(outerPostCallRan).toBe(false);
            expect(res.diagnostics[0]?.message).toContain('Abort triggered from re-entrant level');
        });

        test('max re-entrant execution depth is safely capped independently from maxFrames', () => {
            const engine = new Fradual({ maxFrames: 256, maxReentrantDepth: 5 });

            engine.define('recurse', () => {
                const res = engine.run('recurse();');
                if (!res.ok) throw new Error(res.diagnostics[0]?.message);
                return res.value;
            });

            const res = engine.run('recurse();');
            expect(res.ok).toBe(false);
            expect(res.diagnostics[0]?.message).toContain(
                'Maximum re-entrant execution depth (5) exceeded',
            );
        });

        test('re-entrant execution budget accumulates across outer and inner scripts', () => {
            const engine = new Fradual({ maxInstructions: 50 });

            engine.define('heavyInner', () => {
                const res = engine.run(
                    'var sum = 0; for (var i = 0; i < 10; i = i + 1) sum = sum + i; return sum;',
                );
                if (!res.ok) throw new Error(res.diagnostics[0]?.message);
                return res.value;
            });

            const res = engine.run(`
                var total = 0;
                for (var j = 0; j < 5; j = j + 1) {
                    total = total + heavyInner();
                }
                return total;
            `);
            expect(res.ok).toBe(false);
            expect(res.diagnostics[0]?.message).toContain('Instruction limit exceeded');
        });

        test('inner script cannot mutate outer variables, operand stack or call frames', () => {
            const engine = new Fradual();

            engine.define('mutateAttempt', () => {
                engine.run(`
                    fun nested() { return [1, 2, 3]; }
                    var temp = nested();
                    for (var i = 0; i < 50; i = i + 1) push(temp, i);
                    return len(temp);
                `);
                return 42;
            });

            const script = `
                var outerA = 100;
                var outerB = [10, 20];
                var callResult = mutateAttempt();
                return outerA + outerB[0] + callResult;
            `;

            const res = engine.run(script);
            expect(res.ok).toBe(true);
            expect(res.value).toBe(100 + 10 + 42); // 152
        });

        test('resetAbort() cleanly detaches stale AbortSignal and allows fresh signals', () => {
            const c1 = new AbortController();
            const engine = new Fradual({ abortSignal: c1.signal });

            c1.abort('First controller abort');
            const res1 = engine.run('return 10;');
            expect(res1.ok).toBe(false);
            expect(res1.diagnostics[0]?.message).toContain('First controller abort');

            // Resetting without arguments detaches stale aborted signal
            engine.resetAbort();
            const res2 = engine.run('return 20;');
            expect(res2.ok).toBe(true);
            expect(res2.value).toBe(20);

            // Attaching a fresh second AbortSignal via resetAbort(signal)
            const c2 = new AbortController();
            engine.resetAbort(c2.signal);

            const res3 = engine.run('return 30;');
            expect(res3.ok).toBe(true);
            expect(res3.value).toBe(30);

            c2.abort('Second controller abort');
            const res4 = engine.run('return 40;');
            expect(res4.ok).toBe(false);
            expect(res4.diagnostics[0]?.message).toContain('Second controller abort');
        });

        test('resetAbort() with already-aborted signal keeps engine aborted and rejects execution', () => {
            const engine = new Fradual();

            const deadSignal = AbortSignal.abort('Pre-dead signal');
            engine.resetAbort(deadSignal);

            const res = engine.run('return 42;');
            expect(res.ok).toBe(false);
            expect(res.diagnostics[0]?.message).toContain('Pre-dead signal');
        });

        test('operand stack and frames are completely clean on next run after abort or error', () => {
            const engine = new Fradual();
            let steps = 0;

            engine.define('tick', () => {
                steps++;
                if (steps === 3) engine.abort('Killed midway');
            });

            // Run 1: aborted mid-loop while stack contains active loop values
            const r1 = engine.run('while (true) { tick(); }');
            expect(r1.ok).toBe(false);

            // Reset engine
            engine.resetAbort();

            // Run 2: returns a fresh value from top level
            const r2 = engine.run('return [1, 2, 3];');
            expect(r2.ok).toBe(true);
            expect(r2.value).toEqual([1, 2, 3]);

            // Run 3: trigger a division/type error
            const r3 = engine.run('return 10 - "invalid";');
            expect(r3.ok).toBe(false);

            // Run 4: next run executes cleanly
            const r4 = engine.run('return 99;');
            expect(r4.ok).toBe(true);
            expect(r4.value).toBe(99);
        });

        test('complex nested conversion with circular references and depth limit respects policies symmetrically', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const complex: any = {
                id: 'root',
                child: {
                    id: 'child_1',
                    valid: true,
                },
            };
            // Create circular link
            complex.child.parent = complex;

            // toValue with maxDepth: 1 and failurePolicy: null
            // Depth 0: complex (id: root, child: Object)
            // Depth 1: child (id: child_1, valid: true, parent: points to complex via seen map)
            // Depth 2: would exceed maxDepth if recursed, but cycle map intercepts parent immediately!
            const converted = toValue(complex, { maxDepth: 2, failurePolicy: 'null' }) as ObjMap;
            expect(converted).toBeInstanceOf(ObjMap);

            // fromValue exports back to JS preserving cycle
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const exported: any = fromValue(converted, { maxDepth: 2, failurePolicy: 'null' });
            expect(exported.id).toBe('root');
            expect(exported.child.id).toBe('child_1');
            expect(exported.child.parent).toBe(exported);
        });
    });
});
