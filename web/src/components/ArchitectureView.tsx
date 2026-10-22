"use client";

import React, { useState } from "react";
import { OpCode } from "@hypecaves/compiler";
import styles from "./DocsView.module.css";

// Semantic metadata for opcodes
const OPCODE_METADATA: Record<string, { operands: string; category: string; description: string }> = {
  OP_CONSTANT: { operands: "1 byte (index)", category: "Constants", description: "Pushes a constant from chunk constant pool onto the operand stack." },
  OP_NIL: { operands: "none", category: "Constants", description: "Pushes nil onto value stack." },
  OP_TRUE: { operands: "none", category: "Constants", description: "Pushes boolean true onto value stack." },
  OP_FALSE: { operands: "none", category: "Constants", description: "Pushes boolean false onto value stack." },
  OP_POP: { operands: "none", category: "Stack", description: "Pops and discards the top of the operand stack." },
  OP_GET_LOCAL: { operands: "1 byte (slot)", category: "Variables", description: "Reads local variable from current call frame stack slot." },
  OP_SET_LOCAL: { operands: "1 byte (slot)", category: "Variables", description: "Mutates local variable at frame stack slot." },
  OP_GET_GLOBAL: { operands: "1 byte (name)", category: "Variables", description: "Retrieves global variable by string identifier." },
  OP_DEFINE_GLOBAL: { operands: "1 byte (name)", category: "Variables", description: "Assigns top of stack to global variable table." },
  OP_SET_GLOBAL: { operands: "1 byte (name)", category: "Variables", description: "Mutates an existing global variable." },
  OP_EQUAL: { operands: "none", category: "Comparison", description: "Pops b, a. Pushes true if a == b (strict identity/value equality)." },
  OP_GREATER: { operands: "none", category: "Comparison", description: "Pops b, a. Pushes a > b." },
  OP_LESS: { operands: "none", category: "Comparison", description: "Pops b, a. Pushes a < b." },
  OP_ADD: { operands: "none", category: "Arithmetic", description: "Pops b, a. Pushes a + b (numeric addition or string concatenation)." },
  OP_SUBTRACT: { operands: "none", category: "Arithmetic", description: "Pops b, a. Pushes a - b." },
  OP_MULTIPLY: { operands: "none", category: "Arithmetic", description: "Pops b, a. Pushes a * b." },
  OP_DIVIDE: { operands: "none", category: "Arithmetic", description: "Pops b, a. Pushes a / b." },
  OP_NOT: { operands: "none", category: "Logical", description: "Logical NOT with exact truthiness semantics." },
  OP_NEGATE: { operands: "none", category: "Arithmetic", description: "Negates top numeric value on stack." },
  OP_PRINT: { operands: "none", category: "I/O", description: "Pops top value and dispatches to onPrint handler." },
  OP_JUMP: { operands: "2 bytes (offset)", category: "Control Flow", description: "Unconditional forward jump." },
  OP_JUMP_IF_FALSE: { operands: "2 bytes (offset)", category: "Control Flow", description: "Jumps if top of stack is falsey without popping." },
  OP_LOOP: { operands: "2 bytes (offset)", category: "Control Flow", description: "Backward jump for while and for loops with budget check." },
  OP_CALL: { operands: "1 byte (argCount)", category: "Functions", description: "Invokes closure or host native with argCount arguments." },
  OP_RETURN: { operands: "none", category: "Functions", description: "Returns from current call frame to caller." },
  OP_CLASS: { operands: "1 byte (name)", category: "OOP", description: "Creates a new ObjClass on top of stack." },
  OP_GET_PROPERTY: { operands: "1 byte (name)", category: "OOP", description: "Reads property from an ObjInstance." },
  OP_SET_PROPERTY: { operands: "1 byte (name)", category: "OOP", description: "Writes property to an ObjInstance." },
  OP_CLOSURE: { operands: "1 byte + upvalue bytes", category: "Functions", description: "Instantiates a closure and captures open/closed upvalues." },
  OP_GET_UPVALUE: { operands: "1 byte (index)", category: "Closures", description: "Reads upvalue captured from enclosing lexical scope." },
  OP_SET_UPVALUE: { operands: "1 byte (index)", category: "Closures", description: "Mutates upvalue captured from enclosing lexical scope." },
  OP_CLOSE_UPVALUE: { operands: "none", category: "Closures", description: "Closes open upvalues on stack exit." },
  OP_ARRAY: { operands: "1 byte (count)", category: "Collections", description: "Pops count items and constructs an ObjArray on stack." },
  OP_INDEX_GET: { operands: "none", category: "Collections", description: "Array index or map property retrieval (`target[key]`)." },
  OP_INDEX_SET: { operands: "none", category: "Collections", description: "Array index or map property assignment (`target[key] = val`)." },
  OP_MODULO: { operands: "none", category: "Arithmetic", description: "Pops b, a. Pushes a % b (integer remainder)." },
  OP_MAP: { operands: "1 byte (pairCount)", category: "Collections", description: "Pops key-value pairs and constructs an ObjMap on stack." },
};

export default function ArchitectureView() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");

  // Derive all active opcodes dynamically from real compiler enum
  const activeOpcodes = Object.keys(OpCode)
    .filter((k) => isNaN(Number(k)))
    .map((name) => {
      const id = OpCode[name as keyof typeof OpCode] as number;
      const meta = OPCODE_METADATA[name] || {
        operands: "variable",
        category: "General",
        description: `Opcode ${name} (id: ${id})`,
      };
      return {
        id,
        name,
        operands: meta.operands,
        category: meta.category,
        description: meta.description,
      };
    })
    .sort((a, b) => a.id - b.id);

  const categories = ["ALL", ...Array.from(new Set(activeOpcodes.map((o) => o.category)))];

  const filtered = activeOpcodes.filter((op) => {
    const matchesCat = selectedCategory === "ALL" || op.category === selectedCategory;
    const matchesSearch =
      op.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      op.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(op.id).includes(searchTerm);
    return matchesCat && matchesSearch;
  });

  return (
    <div style={{ maxWidth: 1100, margin: "32px auto 80px", padding: "0 24px" }}>
      <h1 className={styles.docTitle}>Bytecode Architecture &amp; Virtual Machine Specification</h1>
      <p className={styles.docLead}>
        Fradual compiles source text into dense chunks of bytecode instructions executed by an explicit stack-based virtual machine. Every opcode is statically verified before execution.
      </p>

      {/* 4 Pipeline Stages */}
      <h2 id="sec-pipeline" className={styles.sectionHeading}>4-Stage Compilation &amp; Execution Pipeline</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 36 }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, backgroundColor: "#ffffff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#059669", background: "#ecfdf5", padding: "2px 6px", borderRadius: 4 }}>STAGE 1</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 6 }}>Lexer Scanner</div>
          <p style={{ fontSize: 12, color: "#6b7280", margin: 0, lineHeight: 1.5 }}>
            Transforms UTF-8 character stream into typed tokens with exact line and column tracking.
          </p>
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, backgroundColor: "#ffffff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#059669", background: "#ecfdf5", padding: "2px 6px", borderRadius: 4 }}>STAGE 2</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 6 }}>Pratt Parser</div>
          <p style={{ fontSize: 12, color: "#6b7280", margin: 0, lineHeight: 1.5 }}>
            Top-down operator precedence parser constructs abstract syntax trees with syntax recovery.
          </p>
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, backgroundColor: "#ffffff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#059669", background: "#ecfdf5", padding: "2px 6px", borderRadius: 4 }}>STAGE 3</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 6 }}>Bytecode Verifier</div>
          <p style={{ fontSize: 12, color: "#6b7280", margin: 0, lineHeight: 1.5 }}>
            Validates jump targets, chunk boundaries, and operand sizes statically before VM launch.
          </p>
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, backgroundColor: "#ffffff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#059669", background: "#ecfdf5", padding: "2px 6px", borderRadius: 4 }}>STAGE 4</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 6 }}>Virtual Machine</div>
          <p style={{ fontSize: 12, color: "#6b7280", margin: 0, lineHeight: 1.5 }}>
            Direct-threaded dispatch loop enforcing strict instruction budgets, stack frames, and closures.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div id="sec-opcodes-table" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <h2 className={styles.sectionHeading} style={{ margin: 0 }}>
            Live Opcode Enum ({filtered.length} of {activeOpcodes.length})
          </h2>
          <span style={{ fontSize: 12, color: "#6b7280" }}>Directly generated from @hypecaves/compiler OpCode enum</span>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="Search opcode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              border: "1px solid #d1d5db",
              borderRadius: 6,
              outline: "none",
              width: 180,
            }}
          />
        </div>
      </div>

      {/* Category Pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setSelectedCategory(c)}
            style={{
              border: "1px solid #e5e7eb",
              background: selectedCategory === c ? "#111827" : "#ffffff",
              color: selectedCategory === c ? "#ffffff" : "#4b5563",
              fontSize: 11,
              padding: "4px 9px",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: selectedCategory === c ? 600 : 400,
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 60 }}>Byte</th>
              <th>Opcode</th>
              <th>Category</th>
              <th>Operands</th>
              <th>Instruction Semantics</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((op) => (
              <tr key={op.name}>
                <td style={{ fontFamily: "ui-monospace, monospace", color: "#6b7280", fontSize: 11 }}>
                  0x{op.id.toString(16).padStart(2, "0")}
                </td>
                <td>
                  <code style={{ fontWeight: 600, color: "#1e40af" }}>{op.name}</code>
                </td>
                <td>
                  <span style={{ fontSize: 11, background: "#f3f4f6", padding: "2px 6px", borderRadius: 4, color: "#4b5563" }}>
                    {op.category}
                  </span>
                </td>
                <td style={{ color: "#6b7280", fontSize: 11.5 }}>{op.operands}</td>
                <td style={{ fontSize: 12 }}>{op.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
