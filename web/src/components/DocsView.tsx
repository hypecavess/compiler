"use client";

import React, { useState, useEffect } from "react";
import styles from "./DocsView.module.css";

interface DocsViewProps {
  onRunInPlayground?: (code: string) => void;
  onActiveSectionChange?: (id: string) => void;
}

export const DOC_SECTIONS = [
  { id: "sec-quickstart", title: "Quickstart & Setup" },
  { id: "sec-tenets", title: "Architecture & Tenets" },
  { id: "sec-sandbox", title: "Sandbox Quotas & Traps" },
  { id: "sec-grammar", title: "Language Specification" },
  { id: "sec-interop", title: "Host Interoperability" },
  { id: "sec-opcodes", title: "Bytecode ISA Reference" },
  { id: "sec-production", title: "Production & CLI" },
];

export default function DocsView({ onRunInPlayground, onActiveSectionChange }: DocsViewProps) {
  const [activeSection, setActiveSection] = useState<string>("sec-quickstart");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Track active section on scroll
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 140;
      for (const section of DOC_SECTIONS) {
        const el = document.getElementById(section.id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            setActiveSection(section.id);
            if (onActiveSectionChange) onActiveSectionChange(section.id);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [onActiveSectionChange]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const headerOffset = 90;
      const elementPosition = el.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className={styles.docsContainer}>
      {/* Sticky Table of Contents Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>SPECIFICATION INDEX</div>
        <nav className={styles.sidebarNav}>
          {DOC_SECTIONS.map((sec, idx) => {
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                onClick={() => scrollToSection(sec.id)}
              >
                <span>{sec.title}</span>
                <span className={styles.navNumber}>{String(idx + 1).padStart(2, "0")}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Continuous Document Article */}
      <article className={styles.docArticle}>
        <h1 className={styles.docTitle}>Fradual Architecture &amp; Developer Specification</h1>
        <p className={styles.docLead}>
          A comprehensive technical specification for the Fradual embeddable virtual machine and compiler (<code style={{ fontSize: 13, background: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>@hypecaves/compiler@2.0.0</code>).
          Designed for secure multi-tenant rule evaluation, edge function dispatch, and deterministic computational budgets.
        </p>

        {/* SECTION 1: QUICKSTART */}
        <section id="sec-quickstart">
          <h2 className={styles.sectionHeading}>01. Quickstart &amp; Installation</h2>
          <p className={styles.paragraph}>
            Fradual installs as a zero-dependency package compatible with Node.js (&ge; 18.0.0), Next.js (App &amp; Pages Router), Cloudflare Workers, and evergreen browsers.
          </p>

          <div className={styles.codeBlockWrapper}>
            <div className={styles.codeHeader}>
              <span>Terminal</span>
              <button
                type="button"
                className={styles.copyBtn}
                onClick={() => copyToClipboard("npm install @hypecaves/compiler", "install")}
              >
                {copiedId === "install" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className={styles.codeBlock}>npm install @hypecaves/compiler</pre>
          </div>

          <h3 className={styles.subSectionHeading}>30-Second Execution Example</h3>
          <p className={styles.paragraph}>
            The following example instantiates the VM, sets an exact instruction limit of 10,000 steps, binds a native host mathematical function, and evaluates business logic:
          </p>

          <div className={styles.codeBlockWrapper}>
            <div className={styles.codeHeader}>
              <span>embed_example.ts</span>
              <div style={{ display: "flex", gap: 6 }}>
                {onRunInPlayground && (
                  <button
                    type="button"
                    className={styles.runBtnDoc}
                    onClick={() =>
                      onRunInPlayground(`fun evaluateTier(spend, isMember) {
  var discount = 0;
  if (spend > 500 and isMember) {
    discount = spend * 0.20;
  } else if (spend > 200) {
    discount = spend * 0.10;
  }
  return spend - discount;
}

print "Calculating member pricing for $650...";
var net = evaluateTier(650, true);
print "Net total: $" + net;
return net;`)
                    }
                  >
                    Run in Playground
                  </button>
                )}
                <button
                  type="button"
                  className={styles.copyBtn}
                  onClick={() =>
                    copyToClipboard(
                      `import { Fradual } from "@hypecaves/compiler";

const vm = new Fradual({
  maxInstructions: 10000,
  maxExecutionMs: 150,
  natives: {
    host_timestamp: () => Date.now(),
  },
});

const result = vm.run(\`
  fun evaluateTier(spend, isMember) {
    var discount = 0;
    if (spend > 500 and isMember) {
      discount = spend * 0.20;
    }
    return spend - discount;
  }
  return evaluateTier(650, true);
\`);

console.log("Status:", result.status); // "ok"
console.log("Returned:", result.value);  // 520`,
                      "embed_code"
                    )
                  }
                >
                  {copiedId === "embed_code" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <pre className={styles.codeBlock}>{`import { Fradual } from "@hypecaves/compiler";

const vm = new Fradual({
  maxInstructions: 10000,
  maxExecutionMs: 150,
  natives: {
    host_timestamp: () => Date.now(),
  },
});

const result = vm.run(\`
  fun evaluateTier(spend, isMember) {
    var discount = 0;
    if (spend > 500 and isMember) {
      discount = spend * 0.20;
    }
    return spend - discount;
  }
  return evaluateTier(650, true);
\`);

console.log("Status:", result.status); // "ok"
console.log("Returned:", result.value);  // 520`}</pre>
          </div>
        </section>

        <div className={styles.divider} />

        {/* SECTION 2: EXECUTIVE ARCHITECTURE & TENETS */}
        <section id="sec-tenets">
          <h2 className={styles.sectionHeading}>02. Executive Architecture &amp; Design Tenets</h2>
          <p className={styles.paragraph}>
            Embedding dynamic script evaluation in enterprise software traditionally forces an unacceptable compromise:
          </p>

          <div className={styles.grid2}>
            <div className={styles.card}>
              <div className={styles.cardTag} style={{ color: "#dc2626" }}>UNSAFE APPROACH</div>
              <div className={styles.cardTitle}>Native eval() / new Function()</div>
              <p className={styles.cardDesc}>
                Directly shares the host V8 engine context. Vulnerable to prototype pollution, arbitrary code execution, event loop freezing via infinite loops, and unconstrained memory exhaustion.
              </p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardTag} style={{ color: "#d97706" }}>HEAVYWEIGHT APPROACH</div>
              <div className={styles.cardTitle}>V8 Worker Isolates / Docker</div>
              <p className={styles.cardDesc}>
                Requires thread spawning, IPC serialization across boundary buffers, and 25&ndash;45 MB baseline RSS memory per isolate. Cold start latency ranges from 15ms to 80ms.
              </p>
            </div>
          </div>

          <div className={styles.calloutBox}>
            <div className={styles.calloutHeader}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>THE FRADUAL ARCHITECTURAL GUARANTEE</span>
            </div>
            <p className={styles.calloutText}>
              Fradual implements an in-process, pure TypeScript stack virtual machine. It executes in the caller&apos;s thread with a zero-allocation baseline, cold start latency below <strong>0.05 milliseconds</strong>, and a strict deterministic instruction trap that prevents CPU monopolization without workers or native bindings.
            </p>
          </div>

          <h3 className={styles.subSectionHeading}>4-Stage Pipelined Compilation</h3>
          <p className={styles.paragraph}>
            Fradual strictly separates parsing, compilation, verification, and interpretation into distinct, audited stages:
          </p>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Component</th>
                  <th>Responsibility</th>
                  <th>Output Artifact</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>01</code></td>
                  <td><strong>Lexer</strong></td>
                  <td>Tokenizes character stream; tracks line, column, and token kinds</td>
                  <td><code>Token[]</code> stream</td>
                </tr>
                <tr>
                  <td><code>02</code></td>
                  <td><strong>Parser</strong></td>
                  <td>Recursive descent parsing; constructs typed AST nodes</td>
                  <td><code>Stmt.Stmt[]</code> syntax tree</td>
                </tr>
                <tr>
                  <td><code>03</code></td>
                  <td><strong>Compiler</strong></td>
                  <td>Single-pass emitter; resolves locals, calculates jump offsets, upvalues</td>
                  <td><code>ObjFunction</code> bytecode chunk</td>
                </tr>
                <tr>
                  <td><code>04</code></td>
                  <td><strong>Stack VM</strong></td>
                  <td>Dispatches opcodes against value stack; enforces instruction quota</td>
                  <td><code>RunResult</code> + diagnostics</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <div className={styles.divider} />

        {/* SECTION 3: DETERMINISTIC SANDBOX QUOTAS */}
        <section id="sec-sandbox">
          <h2 className={styles.sectionHeading}>03. Sandbox Security &amp; Resource Quotas</h2>
          <p className={styles.paragraph}>
            Untrusted user scripts must never be capable of crashing the host process or causing denial-of-service conditions. Fradual enforces multiple independent layers of defense:
          </p>

          <h3 className={styles.subSectionHeading}>Deterministic Instruction Budget (`maxInstructions`)</h3>
          <p className={styles.paragraph}>
            Unlike time-based limits which vary based on CPU clock frequency and server load, the instruction budget decrements on every single opcode dispatch in the VM loop. A loop like <code>while (true)</code> or an unintended O(N!) recursion halts deterministically at the exact instruction boundary:
          </p>

          <div className={styles.codeBlockWrapper}>
            <div className={styles.codeHeader}>
              <span>infinite_loop_trap.ts</span>
              {onRunInPlayground && (
                <button
                  type="button"
                  className={styles.runBtnDoc}
                  onClick={() =>
                    onRunInPlayground(`// Infinite loop halted safely by instruction counter
print "Starting infinite loop...";
var counter = 0;
while (true) {
  counter = counter + 1;
}
return counter;`)
                  }
                >
                  Run in Playground
                </button>
              )}
            </div>
            <pre className={styles.codeBlock}>{`// Script executes within a strict 5,000 instruction budget
const vm = new Fradual({ maxInstructions: 5000 });
const res = vm.run("while(true) {}");

console.log(res.ok); // false
console.log(res.status); // "runtime_error"
console.log(res.diagnostics[0].message); 
// "Execution halted: instruction limit (5000) exceeded."`}</pre>
          </div>

          <div className={styles.calloutBox} style={{ borderLeftColor: "#059669", backgroundColor: "#f0fdf4" }}>
            <div className={styles.calloutHeader} style={{ color: "#065f46" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>SECURITY SPECIFICATION: ZERO PROTOTYPE POLLUTION</span>
            </div>
            <p className={styles.calloutText}>
              Fradual VM objects (<code>ObjMap</code>, <code>ObjInstance</code>, <code>ObjArray</code>) do not inherit from JavaScript&apos;s <code>Object.prototype</code>. Property accesses like <code>__proto__</code>, <code>constructor</code>, or <code>prototype</code> are strictly treated as inert dictionary keys with no prototype escalation vectors.
            </p>
          </div>

          <h3 className={styles.subSectionHeading}>Call Stack Depth Bounds</h3>
          <p className={styles.paragraph}>
            Recursive functions are bounded by an internal call frame limit (default 64 frames). If a script attempts a stack overflow, the VM traps the execution gracefully with a clean diagnostic error rather than throwing a V8 <code style={{ color: "#dc2626" }}>RangeError: Maximum call stack size exceeded</code>.
          </p>
        </section>

        <div className={styles.divider} />

        {/* SECTION 4: FORMAL LANGUAGE SPECIFICATION */}
        <section id="sec-grammar">
          <h2 className={styles.sectionHeading}>04. Formal Language Specification</h2>
          <p className={styles.paragraph}>
            Fradual implements an expressive, dynamically typed scripting language inspired by modern ECMAScript and Lua.
          </p>

          <h3 className={styles.subSectionHeading}>Data Types &amp; Literals</h3>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Syntax / Literal</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>Number</code></td>
                  <td><code>42</code>, <code>3.14159</code>, <code>-10.5</code></td>
                  <td>Double-precision IEEE 754 floating point numbers</td>
                </tr>
                <tr>
                  <td><code>String</code></td>
                  <td><code>&quot;hello world&quot;</code></td>
                  <td>Immutable UTF-8 strings with escape sequences</td>
                </tr>
                <tr>
                  <td><code>Boolean</code></td>
                  <td><code>true</code>, <code>false</code></td>
                  <td>Exact booleans with short-circuiting <code>and</code> / <code>or</code></td>
                </tr>
                <tr>
                  <td><code>Nil</code></td>
                  <td><code>nil</code></td>
                  <td>Absence of value (corresponds to JS <code>null</code>)</td>
                </tr>
                <tr>
                  <td><code>Array</code></td>
                  <td><code>[1, 2, 3]</code></td>
                  <td>Ordered dynamic collections with index subscripting</td>
                </tr>
                <tr>
                  <td><code>Map</code></td>
                  <td><code>&#123; &quot;key&quot;: &quot;value&quot; &#125;</code></td>
                  <td>Key-value dictionary tables</td>
                </tr>
                <tr>
                  <td><code>Function</code></td>
                  <td><code>fun add(a, b) &#123; return a + b; &#125;</code></td>
                  <td>First-class functions with lexical closures and upvalues</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className={styles.subSectionHeading}>Closures &amp; Lexical Scoping</h3>
          <p className={styles.paragraph}>
            Functions are first-class values and can be returned from outer scopes while retaining access to closed-over variables:
          </p>

          <div className={styles.codeBlockWrapper}>
            <div className={styles.codeHeader}>
              <span>closures.fu</span>
              {onRunInPlayground && (
                <button
                  type="button"
                  className={styles.runBtnDoc}
                  onClick={() =>
                    onRunInPlayground(`fun makeMultiplier(factor) {
  fun multiply(x) {
    return x * factor;
  }
  return multiply;
}

var triple = makeMultiplier(3);
print "3 * 15 = " + triple(15);
return triple(15);`)
                  }
                >
                  Run in Playground
                </button>
              )}
            </div>
            <pre className={styles.codeBlock}>{`fun makeMultiplier(factor) {
  fun multiply(x) {
    return x * factor;
  }
  return multiply;
}

var triple = makeMultiplier(3);
print "3 * 15 = " + triple(15); // 45
return triple(15);`}</pre>
          </div>
        </section>

        <div className={styles.divider} />

        {/* SECTION 5: HOST INTEROPERABILITY */}
        <section id="sec-interop">
          <h2 className={styles.sectionHeading}>05. Host Interoperability &amp; Value Marshalling</h2>
          <p className={styles.paragraph}>
            Fradual provides seamless bidirectional bridging between native JavaScript/TypeScript host code and the sandboxed virtual machine environment.
          </p>

          <h3 className={styles.subSectionHeading}>Bidirectional Type Conversion Rules</h3>
          <p className={styles.paragraph}>
            The engine automatically converts values across the boundary with cycle preservation and configurable depth checks:
          </p>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Host JavaScript / TypeScript</th>
                  <th>Direction</th>
                  <th>Fradual Guest VM Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>number</code></td>
                  <td>&harr;</td>
                  <td><code>Number</code></td>
                </tr>
                <tr>
                  <td><code>string</code></td>
                  <td>&harr;</td>
                  <td><code>String</code></td>
                </tr>
                <tr>
                  <td><code>boolean</code></td>
                  <td>&harr;</td>
                  <td><code>Boolean</code></td>
                </tr>
                <tr>
                  <td><code>null / undefined</code></td>
                  <td>&harr;</td>
                  <td><code>nil</code></td>
                </tr>
                <tr>
                  <td><code>Array&lt;T&gt;</code></td>
                  <td>&harr;</td>
                  <td><code>ObjArray</code></td>
                </tr>
                <tr>
                  <td><code>Record&lt;string, any&gt;</code></td>
                  <td>&harr;</td>
                  <td><code>ObjMap</code></td>
                </tr>
                <tr>
                  <td><code>(...args) =&gt; unknown</code></td>
                  <td>&rarr;</td>
                  <td><code>ObjNative</code></td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className={styles.subSectionHeading}>Cooperative Abortion via AbortSignal</h3>
          <p className={styles.paragraph}>
            Fradual natively hooks into browser and Node.js <code>AbortController</code> signals. If an HTTP request is cancelled or an upstream timeout fires, the script is aborted cooperatively:
          </p>

          <div className={styles.codeBlockWrapper}>
            <div className={styles.codeHeader}>
              <span>abort_controller.ts</span>
            </div>
            <pre className={styles.codeBlock}>{`const controller = new AbortController();
const vm = new Fradual();
vm.setAbortSignal(controller.signal);

// Abort from host after 50ms
setTimeout(() => controller.abort("Request cancelled by client"), 50);

const result = vm.run("while(true) {}");
console.log(result.status); // "runtime_error"
console.log(result.diagnostics[0].message); // "Request cancelled by client"`}</pre>
          </div>
        </section>

        <div className={styles.divider} />

        {/* SECTION 6: BYTECODE INSTRUCTION SET */}
        <section id="sec-opcodes">
          <h2 className={styles.sectionHeading}>06. Virtual Machine &amp; Bytecode Instruction Set</h2>
          <p className={styles.paragraph}>
            The Fradual VM utilizes a dense, 1-byte opcode instruction set. Below is the structural classification of the 37 virtual machine opcodes:
          </p>

          <div className={styles.grid2}>
            <div className={styles.card}>
              <div className={styles.cardTag}>OPCODES 00 &ndash; 05</div>
              <div className={styles.cardTitle}>Constants &amp; Literals</div>
              <p className={styles.cardDesc}><code>OP_CONSTANT</code>, <code>OP_NIL</code>, <code>OP_TRUE</code>, <code>OP_FALSE</code>, <code>OP_POP</code></p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardTag}>OPCODES 06 &ndash; 11</div>
              <div className={styles.cardTitle}>Variables &amp; Scopes</div>
              <p className={styles.cardDesc}><code>OP_GET_LOCAL</code>, <code>OP_SET_LOCAL</code>, <code>OP_GET_GLOBAL</code>, <code>OP_DEFINE_GLOBAL</code>, <code>OP_SET_GLOBAL</code></p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardTag}>OPCODES 12 &ndash; 20</div>
              <div className={styles.cardTitle}>Arithmetic &amp; Logic</div>
              <p className={styles.cardDesc}><code>OP_EQUAL</code>, <code>OP_GREATER</code>, <code>OP_LESS</code>, <code>OP_ADD</code>, <code>OP_SUBTRACT</code>, <code>OP_MULTIPLY</code>, <code>OP_DIVIDE</code>, <code>OP_NOT</code></p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardTag}>OPCODES 21 &ndash; 36</div>
              <div className={styles.cardTitle}>Jumps, Closures &amp; Objects</div>
              <p className={styles.cardDesc}><code>OP_JUMP</code>, <code>OP_LOOP</code>, <code>OP_CALL</code>, <code>OP_CLOSURE</code>, <code>OP_GET_UPVALUE</code>, <code>OP_ARRAY</code>, <code>OP_MAP</code></p>
            </div>
          </div>

          <h3 className={styles.subSectionHeading}>Pre-Execution Bytecode Verifier</h3>
          <p className={styles.paragraph}>
            Before bytecode is ever dispatched by the interpreter, it passes through <code>verifyBytecode(chunk)</code>. This pass verifies that all jump targets reside within valid instruction boundaries, all operand indices align with the constant pool, and operand stack depths will never underflow.
          </p>
        </section>

        <div className={styles.divider} />

        {/* SECTION 7: PRODUCTION HARDENING & CLI */}
        <section id="sec-production">
          <h2 className={styles.sectionHeading}>07. Production Hardening &amp; CLI Tooling</h2>
          <p className={styles.paragraph}>
            Fradual is engineered for zero-maintenance enterprise deployments:
          </p>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Production Metric</th>
                  <th>Value</th>
                  <th>Enterprise Verification</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>External Dependencies</strong></td>
                  <td><code>0 dependencies</code></td>
                  <td>100% clean <code>npm audit</code>; immune to supply-chain attacks</td>
                </tr>
                <tr>
                  <td><strong>Bundle Size</strong></td>
                  <td><code>&lt; 42 KB minified</code></td>
                  <td>Negligible bundle impact in web and serverless bundles</td>
                </tr>
                <tr>
                  <td><strong>Cold Start Latency</strong></td>
                  <td><code>0.04 ms</code></td>
                  <td>Sub-millisecond instant evaluation without thread spinup</td>
                </tr>
                <tr>
                  <td><strong>TypeScript Definitions</strong></td>
                  <td><code>100% strict typing</code></td>
                  <td>Complete <code>.d.ts</code> declarations generated on build</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className={styles.subSectionHeading}>Command Line Interface (CLI)</h3>
          <p className={styles.paragraph}>
            You can run and inspect Fradual script files directly from your terminal using the bundled executable:
          </p>

          <div className={styles.codeBlockWrapper}>
            <div className={styles.codeHeader}>
              <span>CLI Usage</span>
            </div>
            <pre className={styles.codeBlock}>{`# Run a script file
npx @hypecaves/compiler script.fu

# Disassemble and inspect bytecode opcodes
npx @hypecaves/compiler --disassemble script.fu

# Run with custom instruction quota
npx @hypecaves/compiler --max-instructions 20000 script.fu`}</pre>
          </div>
        </section>
      </article>
    </div>
  );
}
