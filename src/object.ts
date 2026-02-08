import { Chunk } from "./chunk";

export enum ObjType {
    OBJ_FUNCTION,
    OBJ_NATIVE,
    OBJ_CLASS,
    OBJ_INSTANCE
}

export abstract class Obj {
    type: ObjType;
    constructor(type: ObjType) {
        this.type = type;
    }
}

export type Value = number | string | boolean | null | ObjFunction | ObjNative | ObjClass | ObjInstance;

export class ObjFunction {
    arity: number = 0;
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
