"use client";

import React, { useState } from "react";
import { Fradual } from "@hypecaves/compiler";
import styles from "./DocsView.module.css";

interface BenchmarkResult {
  coldStartMs: number;
  loopMs: number;
  loopOpsPerSec: number;
  fibMs: number;
  trapMs: number;
  bridgeMs: number;
  timestamp: string;
}

export default function BenchmarksView() {
  const [benchRunning, setBenchRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [results, setResults] = useState<BenchmarkResult | null>(null);

  const runLiveBenchmarks = () => {
    setBenchRunning(true);
    setCurrentStep("Initializing cold engine instance...");

    setTimeout(() => {
      // 1. Cold start
      const t0 = performance.now();
      new Fradual();
      const coldStartMs = Number((performance.now() - t0).toFixed(3));

      // 2. Loop Arithmetic (20,000 iterations in Fradual VM)
      setCurrentStep("Executing 20,000 VM loop dispatches...");
      const t1 = performance.now();
      const loopEngine = new Fradual({ maxInstructions: 500_000 });
      loopEngine.run(`
        var sum = 0;
        for (var i = 0; i < 20000; i = i + 1) {
          sum = sum + (i % 10);
        }
      `);
      const loopMs = Number((performance.now() - t1).toFixed(2));
      const loopOpsPerSec = Math.round((20000 / (loopMs || 1)) * 1000);

      // 3. Recursive Fibonacci (fib 18 in Fradual VM)
      setCurrentStep("Evaluating recursive call-frames (fib 18)...");
      const t2 = performance.now();
      const fibEngine = new Fradual({ maxInstructions: 500_000 });
      fibEngine.run(`
        fun fib(n) {
          if (n <= 1) return n;
          return fib(n - 1) + fib(n - 2);
        }
        fib(18);
      `);
      const fibMs = Number((performance.now() - t2).toFixed(2));

      // 4. Budget Trap Check (infinite loop halted at 10,000 steps)
      setCurrentStep("Testing deterministic budget trap check...");
      const t3 = performance.now();
      const trapEngine = new Fradual({ maxInstructions: 10_000 });
      trapEngine.run(`while (true) {}`);
      const trapMs = Number((performance.now() - t3).toFixed(3));

      // 5. Host Native Bridge Calls (10,000 invocations)
      setCurrentStep("Measuring Host-to-VM function bridge...");
      const t4 = performance.now();
      const bridgeEngine = new Fradual({
        maxInstructions: 500_000,
        natives: {
          square: (x) => Number(x) * Number(x),
        },
      });
      bridgeEngine.run(`
        var total = 0;
        for (var k = 0; k < 5000; k = k + 1) {
          total = total + square(k % 10);
        }
      `);
      const bridgeMs = Number((performance.now() - t4).toFixed(2));

      setResults({
        coldStartMs,
        loopMs,
        loopOpsPerSec,
        fibMs,
        trapMs,
        bridgeMs,
        timestamp: new Date().toLocaleTimeString("en-US"),
      });
      setBenchRunning(false);
      setCurrentStep(null);
    }, 40);
  };

  return (
    <div style={{ maxWidth: 1100, margin: "32px auto 80px", padding: "0 24px" }}>
      <h1 className={styles.docTitle}>Performance &amp; Virtual Machine Benchmarks</h1>
      <p className={styles.docLead}>
        Real-time in-browser benchmarking executing bytecode dispatches directly on your current browser hardware. No simulated metrics.
      </p>

      {/* Live Benchmark Controller */}
      <div id="sec-bench-controls" style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 24, backgroundColor: "#f9fafb", marginBottom: 36 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "#111827" }}>
              Live In-Browser Benchmark Runner
            </h2>
            <p style={{ fontSize: 12.5, color: "#6b7280", margin: "4px 0 0" }}>
              Runs the real @hypecaves/compiler engine inside your browser tab.
            </p>
          </div>

          <button
            type="button"
            onClick={runLiveBenchmarks}
            disabled={benchRunning}
            style={{
              backgroundColor: "#111827",
              color: "#ffffff",
              border: "none",
              padding: "9px 20px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: benchRunning ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              transition: "background-color 0.15s ease",
            }}
          >
            {benchRunning ? (
              <span>Running...</span>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>Run Live Benchmark</span>
              </>
            )}
          </button>
        </div>

        {benchRunning && currentStep && (
          <div style={{ fontSize: 12, color: "#4b5563", background: "#f3f4f6", padding: "8px 12px", borderRadius: 6, marginBottom: 16 }}>
            <span>Active pass: </span>
            <strong>{currentStep}</strong>
          </div>
        )}

        {results ? (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
              <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", fontWeight: 600 }}>Cold Engine Startup</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#059669", marginTop: 4 }}>
                  {results.coldStartMs} <span style={{ fontSize: 13, fontWeight: 400 }}>ms</span>
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>Instantiation latency</div>
              </div>

              <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", fontWeight: 600 }}>VM Loop Dispatch</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#111827", marginTop: 4 }}>
                  {results.loopMs} <span style={{ fontSize: 13, fontWeight: 400 }}>ms</span>
                </div>
                <div style={{ fontSize: 11, color: "#059669", marginTop: 2, fontWeight: 500 }}>
                  ~{results.loopOpsPerSec.toLocaleString("en-US")} ops/sec
                </div>
              </div>

              <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", fontWeight: 600 }}>Call Stack (Fib 18)</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#111827", marginTop: 4 }}>
                  {results.fibMs} <span style={{ fontSize: 13, fontWeight: 400 }}>ms</span>
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>Stack frames &amp; returns</div>
              </div>

              <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", fontWeight: 600 }}>Budget Trap Limit</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#111827", marginTop: 4 }}>
                  {results.trapMs} <span style={{ fontSize: 13, fontWeight: 400 }}>ms</span>
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>Deterministic loop halt</div>
              </div>

              <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", fontWeight: 600 }}>Host JS Bridge</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#111827", marginTop: 4 }}>
                  {results.bridgeMs} <span style={{ fontSize: 13, fontWeight: 400 }}>ms</span>
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>5,000 native calls</div>
              </div>
            </div>

            <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "right" }}>
              Last executed at {results.timestamp} on current browser thread
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: "#6b7280", fontStyle: "italic", padding: "12px 0" }}>
            Click &quot;Run Live Benchmark&quot; to execute all 5 micro-benchmarks on your local CPU.
          </div>
        )}
      </div>

      {/* Architecture Comparison Table (Zero Emojis - Vector Badges) */}
      <h2 id="sec-bench-comparison" className={styles.sectionHeading}>Isolation &amp; Overhead Comparison</h2>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Runtime</th>
              <th>Zero Dependencies</th>
              <th>Instruction Budget</th>
              <th>Host Isolation</th>
              <th>Package Size</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ backgroundColor: "#f0fdf4" }}>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#059669" }} />
                  <strong>Fradual (@hypecaves/compiler)</strong>
                </div>
              </td>
              <td>
                <span style={{ fontSize: 11, background: "#ecfdf5", color: "#059669", padding: "2px 7px", borderRadius: 4, fontWeight: 600 }}>
                  Zero (0 deps)
                </span>
              </td>
              <td>
                <span style={{ fontSize: 11, background: "#ecfdf5", color: "#059669", padding: "2px 7px", borderRadius: 4, fontWeight: 600 }}>
                  Deterministic
                </span>
              </td>
              <td>
                <span style={{ fontSize: 11, background: "#ecfdf5", color: "#059669", padding: "2px 7px", borderRadius: 4, fontWeight: 600 }}>
                  100% Isolated VM
                </span>
              </td>
              <td>
                <strong>~61 kB</strong>
              </td>
            </tr>

            <tr>
              <td>JavaScript <code>eval()</code> / <code>Function</code></td>
              <td>
                <span style={{ fontSize: 11, background: "#f3f4f6", color: "#4b5563", padding: "2px 7px", borderRadius: 4 }}>
                  Zero
                </span>
              </td>
              <td>
                <span style={{ fontSize: 11, background: "#fef2f2", color: "#dc2626", padding: "2px 7px", borderRadius: 4, fontWeight: 500 }}>
                  Unsupported (Process Hangs)
                </span>
              </td>
              <td>
                <span style={{ fontSize: 11, background: "#fef2f2", color: "#dc2626", padding: "2px 7px", borderRadius: 4, fontWeight: 500 }}>
                  Vulnerable (Full Host Access)
                </span>
              </td>
              <td>0 kB</td>
            </tr>

            <tr>
              <td>Node.js <code>node:vm</code> Module</td>
              <td>
                <span style={{ fontSize: 11, background: "#f3f4f6", color: "#4b5563", padding: "2px 7px", borderRadius: 4 }}>
                  Zero
                </span>
              </td>
              <td>
                <span style={{ fontSize: 11, background: "#fffbeb", color: "#b45309", padding: "2px 7px", borderRadius: 4 }}>
                  Wall-clock only
                </span>
              </td>
              <td>
                <span style={{ fontSize: 11, background: "#fffbeb", color: "#b45309", padding: "2px 7px", borderRadius: 4 }}>
                  Prototype Escape Risks
                </span>
              </td>
              <td>Node runtime only</td>
            </tr>

            <tr>
              <td>QuickJS (WebAssembly)</td>
              <td>
                <span style={{ fontSize: 11, background: "#fef2f2", color: "#dc2626", padding: "2px 7px", borderRadius: 4 }}>
                  Native C / Emscripten
                </span>
              </td>
              <td>
                <span style={{ fontSize: 11, background: "#fffbeb", color: "#b45309", padding: "2px 7px", borderRadius: 4 }}>
                  Memory bound
                </span>
              </td>
              <td>
                <span style={{ fontSize: 11, background: "#ecfdf5", color: "#059669", padding: "2px 7px", borderRadius: 4 }}>
                  WASM Sandbox
                </span>
              </td>
              <td>&gt; 1.5 MB binary</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
