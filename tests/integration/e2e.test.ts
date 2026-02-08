import * as fs from 'fs';
import * as path from 'path';
import { run } from '../helpers';
import { InterpretResult } from '../../src/vm';

const fixturesDir = path.join(__dirname, 'fixtures');

describe('Integration Tests (E2E)', () => {
    describe('Arithmetic', () => {
        test('arithmetic.fu runs correctly', () => {
            const source = fs.readFileSync(path.join(fixturesDir, 'arithmetic.fu'), 'utf-8');
            const { result, output } = run(source);

            expect(result).toBe(InterpretResult.OK);
            expect(output).toEqual(['15', '5', '50', '2', '-10']);
        });
    });

    describe('Variables', () => {
        test('variables.fu runs correctly', () => {
            const source = fs.readFileSync(path.join(fixturesDir, 'variables.fu'), 'utf-8');
            const { result, output } = run(source);

            expect(result).toBe(InterpretResult.OK);
            expect(output).toEqual(['1', '2', 'null', 'hello']);
        });
    });

    describe('Control Flow', () => {
        test('control_flow.fu runs correctly', () => {
            const source = fs.readFileSync(path.join(fixturesDir, 'control_flow.fu'), 'utf-8');
            const { result, output } = run(source);

            expect(result).toBe(InterpretResult.OK);
            expect(output).toEqual([
                'if works',
                'else works',
                '0', '1', '2',
                'true', 'false', 'true', 'false'
            ]);
        });
    });

    describe('Functions', () => {
        test('functions.fu runs correctly', () => {
            const source = fs.readFileSync(path.join(fixturesDir, 'functions.fu'), 'utf-8');
            const { result, output } = run(source);

            expect(result).toBe(InterpretResult.OK);
            expect(output).toEqual([
                'Hello, World!',
                '5',
                '120'
            ]);
        });
    });

    describe('For Loops', () => {
        test('for_loop.fu runs correctly', () => {
            const source = fs.readFileSync(path.join(fixturesDir, 'for_loop.fu'), 'utf-8');
            const { result, output } = run(source);

            expect(result).toBe(InterpretResult.OK);
            expect(output).toEqual(['10', '0', '1', '2']);
        });
    });

    describe('Classes', () => {
        test('classes.fu runs correctly', () => {
            const source = fs.readFileSync(path.join(fixturesDir, 'classes.fu'), 'utf-8');
            const { result, output } = run(source);

            expect(result).toBe(InterpretResult.OK);
            expect(output).toEqual(['3', 'Blueberry']);
        });
    });

    describe('All Fixture Files', () => {
        const fixtures = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.fu'));

        test.each(fixtures)('%s runs without errors', (filename) => {
            const source = fs.readFileSync(path.join(fixturesDir, filename), 'utf-8');
            const { result } = run(source);

            expect(result).toBe(InterpretResult.OK);
        });
    });
});
