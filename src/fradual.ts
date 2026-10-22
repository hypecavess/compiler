import { Lexer } from './lexer.js';
import { Parser } from './parser.js';
import { Compiler } from './compiler.js';
import { VM, VMOptions, InterpretResult } from './vm.js';
import { Disassembler } from './debug.js';
import { Diagnostic } from './diagnostic.js';
import {
    ObjArray,
    ObjClass,
    ObjClosure,
    ObjFunction,
    ObjInstance,
    ObjMap,
    ObjNative,
    ObjUpvalue,
    Value,
} from './object.js';

/** A host function exposed to scripts. Receives and returns plain JS values. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HostFunction = (...args: any[]) => unknown;

export interface FradualOptions extends VMOptions {
    /** Initial global variables. Plain JS values are converted automatically. */
    globals?: Record<string, unknown>;
    /** Host functions callable from scripts (variadic). */
    natives?: Record<string, HostFunction>;
    /**
     * Allow `return <value>;` at the top level of a script; the value becomes
     * `RunResult.value`. Defaults to true.
     */
    allowTopLevelReturn?: boolean;
    /** Options governing value conversion across the host-script boundary. */
    conversion?: ConversionOptions;
}

export type RunStatus = 'ok' | 'compile_error' | 'runtime_error';

export interface RunResult {
    ok: boolean;
    status: RunStatus;
    /** Value returned by top-level code, converted to a plain JS value. */
    value: unknown;
    diagnostics: Diagnostic[];
}

/** A compiled script that can be run many times without recompiling. */
export class Program {
    constructor(readonly fn: ObjFunction) {}

    /** Human-readable bytecode listing (including nested functions). */
    disassemble(): string {
        return new Disassembler().disassembleFunction(this.fn);
    }
}

export interface CompileResult {
    ok: boolean;
    program: Program | null;
    diagnostics: Diagnostic[];
}

function isRuntimeObject(value: unknown): value is Value {
    return (
        value instanceof ObjArray ||
        value instanceof ObjClass ||
        value instanceof ObjClosure ||
        value instanceof ObjFunction ||
        value instanceof ObjInstance ||
        value instanceof ObjMap ||
        value instanceof ObjNative ||
        value instanceof ObjUpvalue
    );
}

/**
 * Structured error thrown when value conversion between host and Fradual fails.
 * Includes the property path and the underlying cause.
 */
export class ConversionError extends Error {
    constructor(
        message: string,
        public readonly path: string = '',
        public readonly cause?: unknown,
    ) {
        super(path ? `${message} at '${path}'` : message);
        this.name = 'ConversionError';
    }
}

export type ConversionFailurePolicy = 'error' | 'null' | 'omit';

export interface ConversionOptions {
    /** Maximum object nesting depth before triggering failure policy (default: 256). */
    maxDepth?: number;
    /**
     * How to handle unconvertible properties, throwing getters, or exceeding max depth:
     * - 'error': Throws a structured ConversionError with the property path (default).
     * - 'null': Replaces unconvertible property with null.
     * - 'omit': Omits the unconvertible property from the resulting map/object.
     */
    failurePolicy?: ConversionFailurePolicy;
    /** Whether to evaluate host getters. If false, getters are treated as unconvertible (default: true). */
    allowGetters?: boolean;
}

export const DEFAULT_CONVERSION_OPTIONS: Required<ConversionOptions> = {
    maxDepth: 256,
    failurePolicy: 'error',
    allowGetters: true,
};

/**
 * Converts a JS value into a Fradual runtime value.
 * - Supports custom ConversionOptions (maxDepth, failurePolicy, allowGetters).
 * - Distinguishes between normal conversion, unconvertible values, and structured errors.
 * - Cycles are detected and preserved.
 */
export function toValue(
    input: unknown,
    optionsOrSeen?: ConversionOptions | Map<object, Value>,
    seenOrDepth?: Map<object, Value> | number,
    depthOrPath?: number | string,
    currentPath: string = '',
): Value {
    let options: Required<ConversionOptions>;
    let seen: Map<object, Value>;
    let depth: number;
    let path: string;

    if (optionsOrSeen instanceof Map) {
        seen = optionsOrSeen;
        depth = typeof seenOrDepth === 'number' ? seenOrDepth : 0;
        path = typeof depthOrPath === 'string' ? depthOrPath : '';
        options = DEFAULT_CONVERSION_OPTIONS;
    } else {
        options = {
            ...DEFAULT_CONVERSION_OPTIONS,
            ...(optionsOrSeen as ConversionOptions | undefined),
        };
        seen = seenOrDepth instanceof Map ? seenOrDepth : new Map();
        depth = typeof depthOrPath === 'number' ? depthOrPath : 0;
        path = currentPath;
    }

    const result = toValueInternal(input, options, seen, depth, path);
    return result === undefined ? null : result;
}

function toValueInternal(
    input: unknown,
    options: Required<ConversionOptions>,
    seen: Map<object, Value>,
    depth: number,
    path: string,
): Value | undefined {
    if (input === null || input === undefined) return null;

    if (depth > options.maxDepth) {
        if (options.failurePolicy === 'error') {
            throw new ConversionError(
                `Maximum object conversion depth (${options.maxDepth}) exceeded`,
                path,
            );
        }
        if (options.failurePolicy === 'omit') {
            return undefined;
        }
        return null;
    }

    switch (typeof input) {
        case 'number':
        case 'string':
        case 'boolean':
            return input;
        case 'bigint':
            return Number(input);
        case 'function':
            return wrapHostFunction(input.name || 'native', input as HostFunction, options);
        case 'symbol': {
            if (options.failurePolicy === 'error') {
                throw new ConversionError('Symbols cannot be converted to Fradual values', path);
            }
            return options.failurePolicy === 'omit' ? undefined : null;
        }
        case 'object':
            break;
        default: {
            if (options.failurePolicy === 'error') {
                throw new ConversionError(
                    `Cannot convert ${typeof input} to a Fradual value`,
                    path,
                );
            }
            return options.failurePolicy === 'omit' ? undefined : null;
        }
    }
    if (isRuntimeObject(input)) return input;

    if (input instanceof Date) {
        return isNaN(input.getTime()) ? null : input.toISOString();
    }
    if (input instanceof RegExp) {
        return input.source;
    }

    const obj = input as object;
    const existing = seen.get(obj);
    if (existing !== undefined) return existing;

    if (Array.isArray(obj)) {
        const array = new ObjArray([]);
        seen.set(obj, array);
        for (let i = 0; i < obj.length; i++) {
            const itemPath = path ? `${path}[${i}]` : `[${i}]`;
            const val = toValueInternal(obj[i], options, seen, depth + 1, itemPath);
            if (options.failurePolicy === 'omit' && val === undefined) {
                continue;
            }
            array.elements.push(val === undefined ? null : val);
        }
        return array;
    }

    if (input instanceof Set) {
        const array = new ObjArray([]);
        seen.set(input, array);
        let i = 0;
        for (const item of input.values()) {
            const itemPath = path ? `${path}[${i++}]` : `[${i++}]`;
            const val = toValueInternal(item, options, seen, depth + 1, itemPath);
            if (options.failurePolicy === 'omit' && val === undefined) {
                continue;
            }
            array.elements.push(val === undefined ? null : val);
        }
        return array;
    }

    if (input instanceof Map) {
        const map = new ObjMap();
        seen.set(input, map);
        for (const [key, val] of input.entries()) {
            if (
                typeof key === 'string' &&
                key !== '__proto__' &&
                key !== 'constructor' &&
                key !== 'prototype'
            ) {
                const itemPath = path ? `${path}.${key}` : key;
                const converted = toValueInternal(val, options, seen, depth + 1, itemPath);
                if (options.failurePolicy === 'omit' && converted === undefined) {
                    continue;
                }
                map.entries.set(key, converted === undefined ? null : converted);
            }
        }
        return map;
    }

    const map = new ObjMap();
    seen.set(obj, map);

    let keys: string[];
    try {
        keys = Object.keys(obj);
    } catch (err) {
        if (options.failurePolicy === 'error') {
            throw new ConversionError('Failed to enumerate object keys', path, err);
        }
        return map;
    }

    for (const key of keys) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        const itemPath = path ? `${path}.${key}` : key;

        try {
            const desc = Object.getOwnPropertyDescriptor(obj, key);
            if (!desc || !desc.enumerable) continue;
            let val: unknown;
            if (desc.get) {
                if (!options.allowGetters) {
                    if (options.failurePolicy === 'error') {
                        throw new ConversionError(
                            'Host getters are disabled by conversion options',
                            itemPath,
                        );
                    }
                    if (options.failurePolicy === 'omit') continue;
                    map.entries.set(key, null);
                    continue;
                }
                val = desc.get.call(obj);
            } else {
                val = desc.value;
            }
            const converted = toValueInternal(val, options, seen, depth + 1, itemPath);
            if (options.failurePolicy === 'omit' && converted === undefined) {
                continue;
            }
            map.entries.set(key, converted === undefined ? null : converted);
        } catch (err) {
            if (err instanceof ConversionError) throw err;
            if (options.failurePolicy === 'error') {
                throw new ConversionError(
                    `Property conversion failed: ${err instanceof Error ? err.message : String(err)}`,
                    itemPath,
                    err,
                );
            }
            if (options.failurePolicy === 'omit') continue;
            map.entries.set(key, null);
        }
    }
    return map;
}

/**
 * Converts a Fradual runtime value into a plain JS value.
 * - Symmetrically enforces maxDepth and failurePolicy.
 * - Preserves cycles via seen map.
 * - Guards against prototype poisoning.
 */
export function fromValue(
    value: Value,
    optionsOrSeen?: ConversionOptions | Map<object, unknown>,
    seenOrDepth?: Map<object, unknown> | number,
    depthOrPath?: number | string,
    currentPath: string = '',
): unknown {
    let options: Required<ConversionOptions>;
    let seen: Map<object, unknown>;
    let depth: number;
    let path: string;

    if (optionsOrSeen instanceof Map) {
        seen = optionsOrSeen;
        depth = typeof seenOrDepth === 'number' ? seenOrDepth : 0;
        path = typeof depthOrPath === 'string' ? depthOrPath : '';
        options = DEFAULT_CONVERSION_OPTIONS;
    } else {
        options = {
            ...DEFAULT_CONVERSION_OPTIONS,
            ...(optionsOrSeen as ConversionOptions | undefined),
        };
        seen = seenOrDepth instanceof Map ? seenOrDepth : new Map();
        depth = typeof depthOrPath === 'number' ? depthOrPath : 0;
        path = currentPath;
    }

    return fromValueInternal(value, options, seen, depth, path);
}

function fromValueInternal(
    value: Value,
    options: Required<ConversionOptions>,
    seen: Map<object, unknown>,
    depth: number,
    path: string,
): unknown {
    if (value === null || typeof value !== 'object') return value;

    if (depth > options.maxDepth) {
        if (options.failurePolicy === 'error') {
            throw new ConversionError(
                `Maximum conversion depth (${options.maxDepth}) exceeded during host export`,
                path,
            );
        }
        if (options.failurePolicy === 'omit') {
            return undefined;
        }
        return null;
    }

    const existing = seen.get(value);
    if (existing !== undefined) return existing;

    if (value instanceof ObjArray) {
        const out: unknown[] = [];
        seen.set(value, out);
        for (let i = 0; i < value.elements.length; i++) {
            const itemPath = path ? `${path}[${i}]` : `[${i}]`;
            const converted = fromValueInternal(
                value.elements[i]!,
                options,
                seen,
                depth + 1,
                itemPath,
            );
            if (options.failurePolicy === 'omit' && converted === undefined) {
                continue;
            }
            out.push(converted);
        }
        return out;
    }

    if (value instanceof ObjMap) {
        const out: Record<string, unknown> = {};
        seen.set(value, out);
        for (const [key, field] of value.entries) {
            const itemPath = path ? `${path}.${key}` : key;
            const converted = fromValueInternal(field, options, seen, depth + 1, itemPath);
            if (options.failurePolicy === 'omit' && converted === undefined) {
                continue;
            }
            if (key === '__proto__') {
                Object.defineProperty(out, key, {
                    value: converted,
                    enumerable: true,
                    writable: true,
                    configurable: true,
                });
            } else {
                out[key] = converted;
            }
        }
        return out;
    }

    if (value instanceof ObjInstance) {
        const out: Record<string, unknown> = {};
        seen.set(value, out);
        for (const [key, field] of value.fields) {
            const itemPath = path ? `${path}.${key}` : key;
            const converted = fromValueInternal(field, options, seen, depth + 1, itemPath);
            if (options.failurePolicy === 'omit' && converted === undefined) {
                continue;
            }
            if (key === '__proto__') {
                Object.defineProperty(out, key, {
                    value: converted,
                    enumerable: true,
                    writable: true,
                    configurable: true,
                });
            } else {
                out[key] = converted;
            }
        }
        return out;
    }

    return value;
}

function wrapHostFunction(
    name: string,
    fn: HostFunction,
    options: Required<ConversionOptions> = DEFAULT_CONVERSION_OPTIONS,
): ObjNative {
    return new ObjNative(name, -1, (args) => {
        const result = fn(...args.map((arg) => fromValue(arg, options)));
        if (result instanceof Promise) {
            throw new Error(
                `Native '${name}' returned a Promise; async natives are not supported yet.`,
            );
        }
        return toValue(result, options);
    });
}

/**
 * High-level, embeddable Fradual engine.
 *
 * Globals persist across `run()` calls on the same engine, so it can be used
 * like a REPL session or to load a library once and call into it many times.
 *
 * ```ts
 * const engine = new Fradual({ globals: { user: { score: 42 } } });
 * engine.run('if (user.score > 40) return "VIP"; return "normal";').value; // "VIP"
 * ```
 */
export class Fradual {
    readonly vm: VM;
    readonly conversionOptions: Required<ConversionOptions>;
    private readonly allowTopLevelReturn: boolean;

    constructor(options: FradualOptions = {}) {
        const { globals, natives, allowTopLevelReturn, conversion, ...vmOptions } = options;
        this.vm = new VM(vmOptions);
        this.allowTopLevelReturn = allowTopLevelReturn ?? true;
        this.conversionOptions = {
            ...DEFAULT_CONVERSION_OPTIONS,
            ...conversion,
        };

        for (const [name, value] of Object.entries(globals ?? {})) this.set(name, value);
        for (const [name, fn] of Object.entries(natives ?? {})) this.define(name, fn);
    }

    /** Lexes, parses and compiles `source` without running it. */
    compile(source: string): CompileResult {
        const lexer = new Lexer(source);
        const parser = new Parser(lexer.scanTokens());
        const statements = parser.parse();

        const diagnostics = [...lexer.diagnostics, ...parser.diagnostics];
        if (diagnostics.length > 0) return { ok: false, program: null, diagnostics };

        const compiler = new Compiler({ allowTopLevelReturn: this.allowTopLevelReturn });
        const fn = compiler.compile(statements);
        if (compiler.hadError) {
            return { ok: false, program: null, diagnostics: [...compiler.diagnostics] };
        }
        return { ok: true, program: new Program(fn), diagnostics: [] };
    }

    /** Compiles (if needed) and executes a script. Never throws for script errors. */
    run(source: string | Program): RunResult {
        let program: Program;
        if (typeof source === 'string') {
            const compiled = this.compile(source);
            if (!compiled.program) {
                return {
                    ok: false,
                    status: 'compile_error',
                    value: undefined,
                    diagnostics: compiled.diagnostics,
                };
            }
            program = compiled.program;
        } else {
            program = source;
        }

        const result = this.vm.interpret(program.fn);
        if (result === InterpretResult.OK) {
            return {
                ok: true,
                status: 'ok',
                value: fromValue(this.vm.lastResult, this.conversionOptions),
                diagnostics: [],
            };
        }
        return {
            ok: false,
            status: 'runtime_error',
            value: undefined,
            diagnostics: this.vm.lastError ? [this.vm.lastError] : [],
        };
    }

    /** Sets a global variable (plain JS values are converted). */
    set(name: string, value: unknown, options?: ConversionOptions): this {
        const opts = options ? { ...this.conversionOptions, ...options } : this.conversionOptions;
        this.vm.setGlobal(name, toValue(value, opts));
        return this;
    }

    /** Reads a global variable as a plain JS value (`undefined` if not defined). */
    get(name: string): unknown {
        const value = this.vm.getGlobal(name);
        return value === undefined ? undefined : fromValue(value, this.conversionOptions);
    }

    /** Exposes a host function to scripts. Arguments and result are converted. */
    define(name: string, fn: HostFunction): this {
        this.vm.setGlobal(name, wrapHostFunction(name, fn, this.conversionOptions));
        return this;
    }

    /** Cooperatively halts ongoing or future script execution on this engine. */
    abort(reason: string = 'Execution aborted.'): this {
        this.vm.abort(reason);
        return this;
    }

    /** Sets or replaces the AbortSignal for this engine. */
    setAbortSignal(signal?: AbortSignal): this {
        this.vm.setAbortSignal(signal);
        return this;
    }

    /**
     * Resets the abort state so the engine instance can be reused for subsequent executions.
     * - Resets the internal `isAborted` flag.
     * - If the previously attached `AbortSignal` is already aborted, it is detached
     *   to prevent the engine from being permanently blocked.
     * - Optionally accepts a fresh `AbortSignal` for subsequent runs.
     */
    resetAbort(newSignal?: AbortSignal): this {
        this.vm.resetAbort(newSignal);
        return this;
    }
}

/** One-shot convenience: runs `source` on a fresh engine. */
export function run(source: string, options: FradualOptions = {}): RunResult {
    return new Fradual(options).run(source);
}
