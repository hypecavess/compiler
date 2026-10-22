import { Chunk } from './chunk.js';

export type Value =
    | number
    | string
    | boolean
    | null
    | ObjFunction
    | ObjNative
    | ObjClass
    | ObjInstance
    | ObjArray
    | ObjMap
    | ObjClosure
    | ObjUpvalue;

export class ObjFunction {
    arity: number = 0;
    upvalueCount: number = 0;
    chunk: Chunk;
    name: string | null;

    constructor(name: string | null) {
        this.name = name;
        this.chunk = new Chunk();
    }

    toString(): string {
        return `<fn ${this.name}>`;
    }
}

export type NativeFn = (args: Value[]) => Value;

export class ObjNative {
    arity: number;
    name: string;
    function: NativeFn;

    constructor(name: string, arity: number, function_: NativeFn) {
        this.name = name;
        this.arity = arity;
        this.function = function_;
    }

    toString(): string {
        return `<native fn>`;
    }
}

export class ObjClass {
    name: string;

    constructor(name: string) {
        this.name = name;
    }

    toString(): string {
        return this.name;
    }
}

export class ObjInstance {
    class: ObjClass;
    fields: Map<string, Value> = new Map();

    constructor(klass: ObjClass) {
        this.class = klass;
    }

    toString(): string {
        return `${this.class.name} instance`;
    }
}

export class ObjArray {
    elements: Value[] = [];
    constructor(elements: Value[]) {
        this.elements = elements;
    }
    toString(): string {
        return valueToString(this);
    }
}

export class ObjMap {
    entries: Map<string, Value> = new Map();
    constructor(entries?: [string, Value][]) {
        if (entries) {
            this.entries = new Map(entries);
        }
    }
    toString(): string {
        return valueToString(this);
    }
}

/**
 * Converts a runtime value to its canonical user-facing string representation.
 * Guards against cyclic references to prevent unbounded recursion.
 */
export function valueToString(value: Value, seen: Set<object> = new Set()): string {
    if (value === null) return 'nil';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value instanceof ObjArray) {
        if (seen.has(value)) return '[...]';
        seen.add(value);
        const inner = value.elements.map((element) => valueToString(element, seen)).join(', ');
        seen.delete(value);
        return `[${inner}]`;
    }
    if (value instanceof ObjMap) {
        if (seen.has(value)) return '{...}';
        seen.add(value);
        const pairs: string[] = [];
        for (const [k, v] of value.entries) {
            pairs.push(`"${k}": ${valueToString(v, seen)}`);
        }
        seen.delete(value);
        return `{${pairs.join(', ')}}`;
    }
    return value.toString();
}

export class ObjUpvalue {
    location: number;
    closed: Value | null = null;
    next: ObjUpvalue | null = null;

    constructor(location: number) {
        this.location = location;
    }
    toString(): string {
        return 'upvalue';
    }
}

export class ObjClosure {
    function: ObjFunction;
    upvalues: ObjUpvalue[] = [];

    constructor(func: ObjFunction) {
        this.function = func;
    }

    toString(): string {
        return this.function.toString();
    }
}
