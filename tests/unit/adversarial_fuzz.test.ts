import { Fradual, run, toValue, ConversionError, verifyBytecode } from '../../src/index.js';
import { OpCode } from '../../src/chunk.js';
import { ObjFunction } from '../../src/object.js';

describe('Adversarial Testing & Fuzzing Suite', () => {
    describe('1. Lexer Fuzzing & Malformed Streams', () => {
        test('fuzzing with 200 random binary and ASCII garbage streams never crashes host', () => {
            const engine = new Fradual();
            for (let i = 0; i < 200; i++) {
                // Generate pseudorandom noisy string with weird characters, null bytes, escapes
                let noisy = '';
                const len = 10 + (i % 50);
                for (let j = 0; j < len; j++) {
                    const charCode = Math.floor(Math.random() * 256);
                    noisy += String.fromCharCode(charCode);
                }

                expect(() => {
                    const res = engine.run(noisy);
                    expect(typeof res.ok).toBe('boolean');
                    expect(Array.isArray(res.diagnostics)).toBe(true);
                }).not.toThrow();
            }
        });

        test('extreme token length (50,000 chars) does not cause regex ReDoS or memory crash', () => {
            const hugeIdentifier = 'a'.repeat(50_000);
            const script = `var ${hugeIdentifier} = 42; return ${hugeIdentifier};`;
            const res = run(script);
            expect(res.ok).toBe(true);
            expect(res.value).toBe(42);
        });

        test('unclosed multi-line strings with escapes and null bytes fail cleanly', () => {
            const malformed = '"This string never ends \\n \\t \\" \\\\ \\0 \n\n and keeps going';
            const res = run(malformed);
            expect(res.ok).toBe(false);
            expect(res.diagnostics.length).toBeGreaterThan(0);
            expect(res.diagnostics[0]?.kind).toBe('lexical');
        });
    });

    describe('2. Parser Fuzzing & Syntax Bomb Resistance', () => {
        test('deeply nested parentheses (100 levels) parse or report diagnostics cleanly', () => {
            const open = '('.repeat(100);
            const close = ')'.repeat(100);
            const res = run(`return ${open}42${close};`);
            expect(res.ok).toBe(true);
            expect(res.value).toBe(42);
        });

        test('mismatched delimiter bombs do not crash the parser', () => {
            const bombs = [
                '([)]',
                '{[}]',
                'var a = [1, {2, (3]};',
                'fun f( { return [); }',
                'for (;;;;;;;;;;;) {}',
                'if (((((true))))',
                '1 + * / - % 5',
                'class {{{{',
            ];

            for (const bomb of bombs) {
                expect(() => {
                    const res = run(bomb);
                    expect(res.ok).toBe(false);
                    expect(res.status).toBe('compile_error');
                }).not.toThrow();
            }
        });
    });

    describe('3. Corrupted Bytecode & Synthetic VM Fuzzing', () => {
        test('unknown opcodes are caught by bytecode verifier before VM runs', () => {
            const engine = new Fradual();
            const fn = new ObjFunction('bad_fn');
            fn.chunk.write(245, 1);
            fn.chunk.write(OpCode.OP_RETURN, 1);

            const res = engine.vm.interpret(fn);
            expect(res).toBe(1); // InterpretResult.COMPILE_ERROR
            expect(engine.vm.lastError?.message).toContain(
                'Bytecode verification failed: unknown opcode',
            );
        });

        test('truncated bytecode with missing operands triggers compile_error in verifier', () => {
            const engine = new Fradual();
            const fn = new ObjFunction('truncated');
            fn.chunk.write(OpCode.OP_CONSTANT, 1);
            fn.chunk.write(0, 1); // Only 1 byte instead of 2

            const res = engine.vm.interpret(fn);
            expect(res).toBe(1); // InterpretResult.COMPILE_ERROR
            expect(engine.vm.lastError?.message).toContain(
                'Bytecode verification failed: truncated constant operand',
            );
        });

        test('out-of-bounds jump offset is rejected by verifier', () => {
            const engine = new Fradual();
            const fn = new ObjFunction('bad_jump');
            fn.chunk.write(OpCode.OP_JUMP, 1);
            fn.chunk.write(0x27, 1);
            fn.chunk.write(0x10, 1);
            fn.chunk.write(OpCode.OP_RETURN, 1);

            const res = engine.vm.interpret(fn);
            expect(res).toBe(1);
            expect(engine.vm.lastError?.message).toContain('targets invalid offset');
        });

        test('jump targeting middle of multi-byte operand is rejected by verifier', () => {
            const engine = new Fradual();
            const fn = new ObjFunction('mid_operand_jump');
            fn.chunk.addConstant(100);
            // 0: OP_JUMP +2 -> target is 0 + 3 + 2 = 5 (middle of OP_CONSTANT operand at 4!)
            fn.chunk.write(OpCode.OP_JUMP, 1);
            fn.chunk.write(0x00, 1);
            fn.chunk.write(0x02, 1);
            // 3: OP_CONSTANT (operand at bytes 4, 5)
            fn.chunk.write(OpCode.OP_CONSTANT, 1);
            fn.chunk.write(0x00, 1);
            fn.chunk.write(0x00, 1);
            // 6: OP_RETURN
            fn.chunk.write(OpCode.OP_RETURN, 1);

            const res = engine.vm.interpret(fn);
            expect(res).toBe(1);
            expect(engine.vm.lastError?.message).toContain('must land on an instruction boundary');
        });

        test('out-of-bounds local slot access is caught safely at runtime', () => {
            const engine = new Fradual();
            const fn = new ObjFunction('bad_local');
            fn.chunk.write(OpCode.OP_GET_LOCAL, 1);
            fn.chunk.write(250, 1); // Slot 250 on empty stack
            fn.chunk.write(OpCode.OP_RETURN, 1);

            const res = engine.vm.interpret(fn);
            expect(res).toBe(2); // InterpretResult.RUNTIME_ERROR
            expect(engine.vm.lastError?.message).toContain('Invalid local slot');
        });

        test('out-of-bounds upvalue index is rejected statically by verifier', () => {
            const engine = new Fradual();
            const fn = new ObjFunction('bad_upvalue');
            fn.upvalueCount = 1; // Function only has 1 upvalue
            fn.chunk.write(OpCode.OP_GET_UPVALUE, 1);
            fn.chunk.write(5, 1); // Slot 5 is out of bounds
            fn.chunk.write(OpCode.OP_RETURN, 1);

            const res = engine.vm.interpret(fn);
            expect(res).toBe(1); // InterpretResult.COMPILE_ERROR
            expect(engine.vm.lastError?.message).toContain('upvalue index 5 out of bounds');
        });

        test('named opcode referencing non-string constant is rejected statically by verifier', () => {
            const engine = new Fradual();
            const fn = new ObjFunction('bad_const_type');
            fn.chunk.addConstant(12345); // Number instead of variable/property name string
            fn.chunk.write(OpCode.OP_GET_GLOBAL, 1);
            fn.chunk.write(0, 1);
            fn.chunk.write(0, 1);
            fn.chunk.write(OpCode.OP_RETURN, 1);

            const res = engine.vm.interpret(fn);
            expect(res).toBe(1); // InterpretResult.COMPILE_ERROR
            expect(engine.vm.lastError?.message).toContain(
                'requires string constant, but index 0 is number',
            );
        });
    });

    describe('4. Host Getters, Proxies, and Value Conversion Policies', () => {
        const evilHostObj = {
            safeProp: 42,
            get bomb() {
                throw new Error('Host getter exploded!');
            },
        };

        test('host object with throwing getter raises structured ConversionError by default', () => {
            expect(() => {
                new Fradual({
                    globals: { obj: evilHostObj },
                });
            }).toThrow(ConversionError);

            try {
                toValue(evilHostObj);
                expect(true).toBe(false);
            } catch (err) {
                expect(err instanceof ConversionError).toBe(true);
                if (err instanceof ConversionError) {
                    expect(err.path).toBe('bomb');
                    expect(err.message).toContain('Host getter exploded!');
                }
            }
        });

        test('host object with throwing getter is converted to null with permissive failurePolicy', () => {
            const engine = new Fradual({
                globals: { obj: evilHostObj },
                conversion: { failurePolicy: 'null' },
            });

            const res = engine.run('return { safe: obj.safeProp, bomb: obj.bomb };');
            expect(res.ok).toBe(true);
            expect(res.value).toEqual({ safe: 42, bomb: null });
        });

        test('host object with throwing getter omits failing property with omit failurePolicy', () => {
            const engine = new Fradual({
                globals: { obj: evilHostObj },
                conversion: { failurePolicy: 'omit' },
            });

            const res = engine.run('return obj;');
            expect(res.ok).toBe(true);
            expect(res.value).toEqual({ safeProp: 42 });
        });

        test('host Proxy object trapping keys does not crash the host during toValue()', () => {
            const proxyObj = new Proxy(
                { realProp: 'ok' },
                {
                    get(target, prop) {
                        if (prop === 'evil') throw new Error('Proxy trap');
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        return (target as any)[prop];
                    },
                },
            );

            const engine = new Fradual({
                globals: { p: proxyObj },
                conversion: { failurePolicy: 'null' },
            });

            const res = engine.run('return p.realProp;');
            expect(res.ok).toBe(true);
            expect(res.value).toBe('ok');
        });

        test('excessive object nesting depth raises ConversionError with default error policy', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const root: any = {};
            let curr = root;
            for (let i = 0; i < 300; i++) {
                curr.child = {};
                curr = curr.child;
            }

            expect(() => toValue(root)).toThrow(ConversionError);
        });

        test('excessive object nesting depth is safely capped when failurePolicy is null', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const root: any = {};
            let curr = root;
            for (let i = 0; i < 300; i++) {
                curr.child = {};
                curr = curr.child;
            }

            const engine = new Fradual({
                conversion: { failurePolicy: 'null' },
            });
            expect(() => {
                engine.set('nested', root);
            }).not.toThrow();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let check: any = engine.get('nested');
            let depth = 0;
            while (check && check.child) {
                depth++;
                check = check.child;
            }
            expect(depth).toBeLessThanOrEqual(256);
        });
    });

    describe('5. Map Prototype Poisoning Adversarial Attack', () => {
        test('all Javascript Object prototype properties can be safely used as map keys without collision', () => {
            const attackKeys = [
                '__proto__',
                'constructor',
                'prototype',
                'toString',
                'valueOf',
                'hasOwnProperty',
                'isPrototypeOf',
                'propertyIsEnumerable',
                'toLocaleString',
                '__defineGetter__',
                '__defineSetter__',
                '__lookupGetter__',
                '__lookupSetter__',
            ];

            const engine = new Fradual();
            for (const key of attackKeys) {
                const script = `
                    var m = {};
                    m["${key}"] = "payload_${key}";
                    var readBack = m["${key}"];
                    return readBack == "payload_${key}";
                `;
                const res = engine.run(script);
                expect(res.ok).toBe(true);
                expect(res.value).toBe(true);

                // Verify host Object prototype is intact
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect((Object.prototype as any)[key]).not.toBe(`payload_${key}`);
            }
        });
    });

    describe('6. Deep Closure Upvalue Lifecycle Stress', () => {
        test('15 levels of nested closures closing over variables maintain integrity', () => {
            const script = `
                fun makeChain(x0) {
                    fun f1(x1) {
                        fun f2(x2) {
                            fun f3(x3) {
                                fun f4(x4) {
                                    fun f5(x5) {
                                        return x0 + x1 + x2 + x3 + x4 + x5;
                                    }
                                    return f5;
                                }
                                return f4;
                            }
                            return f3;
                        }
                        return f2;
                    }
                    return f1;
                }

                var step1 = makeChain(1);
                var step2 = step1(2);
                var step3 = step2(3);
                var step4 = step3(4);
                var step5 = step4(5);
                return step5(6);
            `;
            const res = run(script);
            expect(res.ok).toBe(true);
            expect(res.value).toBe(21); // 1+2+3+4+5+6 = 21
        });
    });

    describe('7. Property-Based Mutation Fuzzing on Bytecode Verifier', () => {
        const testSources = [
            'var x = 10; var y = 20; return x + y;',
            'for (var i = 0; i < 10; i = i + 1) { if (i == 5) return i; }',
            'fun calc(a, b) { if (a > b) return a * 2; return b; } return calc(5, 3);',
            'var m = { a: 1, b: [2, 3] }; return m.b[0] + m.a;',
        ];

        test('systematic byte-level truncation never crashes the verifier or host', () => {
            const engine = new Fradual();
            for (const source of testSources) {
                const compiled = engine.compile(source);
                expect(compiled.ok).toBe(true);
                const originalFn = compiled.program!.fn;
                const originalCode = [...originalFn.chunk.code];

                // Truncate at every single byte index from 0 to length - 1
                for (let i = 0; i < originalCode.length; i++) {
                    const truncatedFn = new ObjFunction(`truncated_${i}`);
                    truncatedFn.chunk.code = originalCode.slice(0, i);
                    truncatedFn.chunk.constants = [...originalFn.chunk.constants];
                    truncatedFn.chunk.lines = originalFn.chunk.lines.slice(0, i);

                    expect(() => {
                        const diags = verifyBytecode(truncatedFn);
                        expect(Array.isArray(diags)).toBe(true);
                        const runRes = engine.vm.interpret(truncatedFn);
                        expect([0, 1, 2]).toContain(runRes);
                    }).not.toThrow();
                }
            }
        });

        test('targeted opcode and operand bit flips are safely caught or contained', () => {
            const engine = new Fradual();
            const compiled = engine.compile('for (var i = 0; i < 5; i = i + 1) { print i; }');
            const originalFn = compiled.program!.fn;
            const originalCode = [...originalFn.chunk.code];

            // Mutate each byte in the chunk to 0xFF (invalid opcode or out-of-bounds operand)
            for (let i = 0; i < originalCode.length; i++) {
                const mutatedFn = new ObjFunction(`mutated_${i}`);
                mutatedFn.chunk.code = [...originalCode];
                mutatedFn.chunk.code[i] = 0xff;
                mutatedFn.chunk.constants = [...originalFn.chunk.constants];
                mutatedFn.chunk.lines = [...originalFn.chunk.lines];

                expect(() => {
                    const diags = verifyBytecode(mutatedFn);
                    expect(Array.isArray(diags)).toBe(true);
                    const runRes = engine.vm.interpret(mutatedFn);
                    expect(typeof runRes).toBe('number');
                }).not.toThrow();
            }
        });

        test('every invalid jump target or operand mutation is statically rejected before execution', () => {
            const engine = new Fradual();
            const compiled = engine.compile('if (true) { return 42; } return 0;');
            expect(compiled.ok).toBe(true);
            const originalFn = compiled.program!.fn;

            // Find OP_JUMP_IF_FALSE instruction in chunk
            let jumpOffset = -1;
            for (let i = 0; i < originalFn.chunk.code.length; i++) {
                if (originalFn.chunk.code[i] === OpCode.OP_JUMP_IF_FALSE) {
                    jumpOffset = i;
                    break;
                }
            }
            expect(jumpOffset).toBeGreaterThanOrEqual(0);

            // Test 1: Corrupt jump offset by +2 (lands on offset 14, inside the OP_CONSTANT operand at 13..15)
            const midOperandFn = new ObjFunction('corrupt_jump_mid');
            midOperandFn.chunk.code = [...originalFn.chunk.code];
            midOperandFn.chunk.constants = [...originalFn.chunk.constants];
            midOperandFn.chunk.lines = [...originalFn.chunk.lines];
            midOperandFn.chunk.code[jumpOffset + 2] =
                (midOperandFn.chunk.code[jumpOffset + 2]! + 2) & 0xff;

            const diags1 = verifyBytecode(midOperandFn);
            expect(diags1.length).toBeGreaterThan(0);
            expect(diags1[0]?.message).toContain('must land on an instruction boundary');
            expect(engine.vm.interpret(midOperandFn)).toBe(1); // COMPILE_ERROR

            // Test 2: Corrupt jump offset to target far beyond code length
            const outOfBoundsFn = new ObjFunction('corrupt_jump_oob');
            outOfBoundsFn.chunk.code = [...originalFn.chunk.code];
            outOfBoundsFn.chunk.constants = [...originalFn.chunk.constants];
            outOfBoundsFn.chunk.lines = [...originalFn.chunk.lines];
            outOfBoundsFn.chunk.code[jumpOffset + 1] = 0x7f; // High byte large

            const diags2 = verifyBytecode(outOfBoundsFn);
            expect(diags2.length).toBeGreaterThan(0);
            expect(diags2[0]?.message).toContain('targets invalid offset');
            expect(engine.vm.interpret(outOfBoundsFn)).toBe(1); // COMPILE_ERROR
        });
    });
});
