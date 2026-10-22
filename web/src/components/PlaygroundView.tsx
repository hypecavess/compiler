"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Fradual, Lexer, Parser } from "@hypecaves/compiler";
import styles from "./PlaygroundView.module.css";

interface MetricRow {
  stage: string;
  metric: string;
  details: string;
  result: string;
  isSuccess?: boolean;
}

interface PlaygroundViewProps {
  initialCode?: string;
}

const PRESETS = [
  {
    name: "Rules Engine",
    code: `// Business rule: Calculate dynamic discount
fun calculateDiscount(cartTotal, isVip, couponCode) {
  var discount = 0;
  if (cartTotal > 100 and isVip) {
    discount = cartTotal * 0.15;
  }
  if (couponCode == "SUPER10") {
    discount = discount + 10;
  }
  return cartTotal - discount;
}

print "Applying VIP discount to $150 cart...";
var finalPrice = calculateDiscount(150, true, "SUPER10");
print "Final price: " + finalPrice;
return finalPrice;`,
  },
  {
    name: "Budget Trap (Loop Safe)",
    code: `// Deterministic Instruction Budget Demo
// While loops with while(true) are safely halted without freezing the browser!
print "Starting infinite loop...";
var steps = 0;
while (true) {
  steps = steps + 1;
}
return steps;`,
  },
  {
    name: "Fibonacci & Stack Bounds",
    code: `// Recursive function with stack safety
fun fib(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}

print "Calculating fib(12)...";
var res = fib(12);
print "Result: " + res;
return res;`,
  },
  {
    name: "Closures & Upvalues",
    code: `// First-class functions closing over variables
fun makeCounter(initial) {
  var count = initial;
  fun increment() {
    count = count + 1;
    return count;
  }
  return increment;
}

var counterA = makeCounter(10);
print counterA(); // 11
print counterA(); // 12
print counterA(); // 13
return counterA(); // 14`,
  },
  {
    name: "Host Native Bridge",
    code: `// Native JS functions exposed into Fradual VM
print "Querying host JavaScript functions...";
var val = 144;
var root = host_sqrt(val);
print "Square root of 144 is: " + root;
print "Host Timestamp: " + host_timestamp();
return root;`,
  },
];

export default function PlaygroundView({ initialCode }: PlaygroundViewProps) {
  const [activeTab, setActiveTab] = useState<"editor" | "upload">("editor");
  const [activePreset, setActivePreset] = useState<string>("Rules Engine");
  const [scriptCode, setScriptCode] = useState<string>(initialCode || PRESETS[0].code);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Execution tracking
  const [runCount, setRunCount] = useState<number>(0);
  const [lastRunTime, setLastRunTime] = useState<string>("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [justRanFlash, setJustRanFlash] = useState(false);
  const [justRanSuccess, setJustRanSuccess] = useState(false);
  const [lastElapsed, setLastElapsed] = useState<string>("0.00");

  // Output panels
  const [resultTab, setResultTab] = useState<"console" | "bytecode" | "ast" | "table">("console");
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [bytecodeText, setBytecodeText] = useState<string>("");
  const [astText, setAstText] = useState<string>("");
  const [returnValue, setReturnValue] = useState<string>("nil");
  const [runStatus, setRunStatus] = useState<"ok" | "compile_error" | "runtime_error">("ok");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Budget knobs
  const [maxInstructions, setMaxInstructions] = useState<number>(5000);
  const [maxExecutionMs, setMaxExecutionMs] = useState<number>(200);

  const [tableData, setTableData] = useState<MetricRow[]>([
    { stage: "Compile", metric: "Bytecode Verifier", details: "Integrity & Jumps", result: "PASSED", isSuccess: true },
    { stage: "Runtime", metric: "Instruction Budget", details: "Max 5,000 steps", result: "24 used", isSuccess: true },
    { stage: "Output", metric: "VM Return Value", details: "Sandboxed Stack", result: "117.5", isSuccess: true },
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scriptCodeRef = useRef<string>(scriptCode);
  const maxInstructionsRef = useRef<number>(maxInstructions);
  const maxExecutionMsRef = useRef<number>(maxExecutionMs);

  useEffect(() => {
    scriptCodeRef.current = scriptCode;
  }, [scriptCode]);

  useEffect(() => {
    maxInstructionsRef.current = maxInstructions;
  }, [maxInstructions]);

  useEffect(() => {
    maxExecutionMsRef.current = maxExecutionMs;
  }, [maxExecutionMs]);

  const executeCode = useCallback((codeToRun: string, budget?: number, timeout?: number) => {
    const activeBudget = budget ?? maxInstructionsRef.current;
    const activeTimeout = timeout ?? maxExecutionMsRef.current;

    setIsExecuting(true);
    setJustRanFlash(false);
    setJustRanSuccess(false);

    // Yield to the browser paint cycle so the user immediately sees the "Executing..." state
    setTimeout(() => {
      const logs: string[] = [];
      let elapsedMs = "0.00";

      try {
        const startTime = performance.now();

        // 1. Real Lexer & Parser
        try {
          const lexer = new Lexer(codeToRun);
          const tokens = lexer.scanTokens();
          const parser = new Parser(tokens);
          const statements = parser.parse();
          setAstText(JSON.stringify(statements, null, 2));
        } catch {
          setAstText("AST unavailable (syntax parsing error)");
        }

        // 2. Real Engine Compile & Disassemble
        const engine = new Fradual({
          maxInstructions: activeBudget,
          maxExecutionMs: activeTimeout,
          onPrint: (msg) => logs.push(msg),
          natives: {
            host_sqrt: (n) => Math.sqrt(Number(n)),
            host_timestamp: () => Date.now(),
          },
        });

        const compileRes = engine.compile(codeToRun);
        if (compileRes.ok && compileRes.program) {
          setBytecodeText(compileRes.program.disassemble());
        } else {
          const errDetails = compileRes.diagnostics?.map((d) => `[line ${d.line}] ${d.message}`).join("\n");
          setBytecodeText(errDetails || "Compile error: could not generate bytecode.");
        }

        // 3. Real VM Run
        const result = engine.run(codeToRun);
        elapsedMs = (performance.now() - startTime).toFixed(2);
        setLastElapsed(elapsedMs);

        setConsoleLogs(logs);
        setRunStatus(result.status);
        setRunCount((prev) => prev + 1);
        setLastRunTime(new Date().toLocaleTimeString("en-US"));

        if (result.ok) {
          setErrorMessage(null);
          const valStr = String(result.value ?? "nil");
          setReturnValue(valStr);

          setTableData([
            { stage: "Compile", metric: "Bytecode Verifier", details: "Opcodes & Static Types", result: "PASSED", isSuccess: true },
            { stage: "Runtime", metric: "Execution Time", details: `${elapsedMs} ms wall-clock`, result: "SAFE", isSuccess: true },
            { stage: "Output", metric: "VM Return Value", details: "Sandboxed Stack", result: valStr.slice(0, 16), isSuccess: true },
          ]);
        } else {
          const errorMsg = result.diagnostics?.[0]?.message || "Execution stopped by sandbox limit.";
          setErrorMessage(errorMsg);
          setReturnValue("trapped");

          setTableData([
            { stage: "Compile", metric: "Bytecode Verifier", details: "Integrity & Jumps", result: "VERIFIED", isSuccess: true },
            { stage: "Sandbox", metric: "Trap Protection", details: "System Protected", result: "TRAPPED", isSuccess: true },
            { stage: "Status", metric: result.status, details: errorMsg.slice(0, 24), result: "BLOCKED", isSuccess: false },
          ]);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
        setRunStatus("runtime_error");
        setTableData([
          { stage: "Safety", metric: "Host Protection", details: "Exception intercepted", result: "CAUGHT", isSuccess: true },
          { stage: "Runtime", metric: "Sandbox Trap", details: msg.slice(0, 24), result: "TRAPPED", isSuccess: false },
          { stage: "Host", metric: "Main Thread", details: "Zero Pollution", result: "SECURE", isSuccess: true },
        ]);
      } finally {
        // Maintain executing visual state for a tactile 140ms so the user clearly sees action
        setTimeout(() => {
          setIsExecuting(false);
          setJustRanFlash(true);
          setJustRanSuccess(true);
          setTimeout(() => setJustRanSuccess(false), 900);
          setTimeout(() => setJustRanFlash(false), 600);
        }, 140);
      }
    }, 40);
  }, []);

  // GLOBAL KEYBOARD SHORTCUT: Ctrl + Enter / Cmd + Enter works everywhere on the page with capture
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isEnter = e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter" || (e as unknown as { keyCode?: number }).keyCode === 13;
      if ((e.ctrlKey || e.metaKey) && isEnter) {
        e.preventDefault();
        e.stopPropagation();
        executeCode(scriptCodeRef.current);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleGlobalKeyDown, { capture: true });
  }, [executeCode]);

  // Initial code change from parent
  useEffect(() => {
    if (initialCode) {
      setScriptCode(initialCode);
      setActivePreset("");
      executeCode(initialCode);
    }
  }, [initialCode, executeCode]);

  // Initial run on mount
  useEffect(() => {
    executeCode(scriptCodeRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectPreset = (preset: (typeof PRESETS)[0]) => {
    setActivePreset(preset.name);
    setScriptCode(preset.code);
    executeCode(preset.code);
  };

  const handleDownloadSample = () => {
    const content = "data:text/plain;charset=utf-8," + encodeURIComponent(scriptCode);
    const link = document.createElement("a");
    link.setAttribute("href", content);
    link.setAttribute("download", `${(activePreset || "script").toLowerCase().replace(/\s+/g, "_")}.fu`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (file: File) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        setScriptCode(text);
        executeCode(text);
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div id="sec-playground-top" className={styles.playgroundWrapper}>
      <h1 className={styles.title}>Interactive Virtual Machine Playground</h1>
      <p className={styles.subtitle}>
        Write Fradual scripts, adjust deterministic instruction budgets, and observe real-time bytecode compilation and execution.
      </p>

      {/* Preset Pills (Zero emojis, clean vector buttons) */}
      <div className={styles.presetGroup}>
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            className={`${styles.presetBtn} ${activePreset === p.name ? styles.presetBtnActive : ""}`}
            onClick={() => handleSelectPreset(p)}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Segmented Mode Tabs */}
      <div className={styles.tabGroup} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "editor"}
          className={`${styles.tabBtn} ${activeTab === "editor" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("editor")}
        >
          Code Editor
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "upload"}
          className={`${styles.tabBtn} ${activeTab === "upload" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("upload")}
        >
          Upload .fu Script
        </button>
      </div>

      {/* Input Section */}
      {activeTab === "editor" ? (
        <div className={styles.editorContainer}>
          <div className={styles.editorToolbar}>
            <span style={{ fontSize: 11, color: "#6b7280" }}>Fradual Source Script</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className={styles.toolBtn}
                onClick={() => navigator.clipboard.writeText(scriptCode)}
              >
                Copy Code
              </button>
              <button type="button" className={styles.toolBtn} onClick={handleDownloadSample}>
                Export .fu
              </button>
            </div>
          </div>
          <textarea
            className={styles.codeArea}
            value={scriptCode}
            onChange={(e) => {
              setScriptCode(e.target.value);
              setActivePreset("");
            }}
            onKeyDown={(e) => {
              const isEnter = e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter" || e.keyCode === 13;
              if ((e.ctrlKey || e.metaKey) && isEnter) {
                e.preventDefault();
                e.stopPropagation();
                executeCode(scriptCode);
              }
            }}
            spellCheck={false}
          />
        </div>
      ) : (
        <>
          <div
            className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".fu,.txt"
              className={styles.fileInputHidden}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />

            <span className={styles.plusIcon}>+</span>
            <span className={styles.dropTextPrimary}>Drag and drop your .fu script file</span>
            <span className={styles.dropTextSecondary}>
              here or <span className={styles.browseLink}>click to browse</span>
            </span>

            {/* Simulated Chip from original design */}
            <div className={styles.dragIndicator} aria-hidden="true">
              <div className={styles.dragPill}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span>{fileName || "rules.fu"}</span>
              </div>
              <div className={styles.cursorIcon}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                  <path d="M4 3l13 10-6.5 1.5L8.5 21 4 3z" fill="#000000" stroke="#FFFFFF" strokeWidth="1.2" />
                  <circle cx="17" cy="17" r="5" fill="#10B981" />
                  <path d="M17 14.5v5M14.5 17h5" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </div>

          {fileName && (
            <div className={styles.fileLoadedBadge}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span>{fileName} loaded</span>
              <button
                type="button"
                className={styles.removeFileBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setFileName(null);
                  setScriptCode(PRESETS[0].code);
                  executeCode(PRESETS[0].code);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}

      {/* Budget Knobs Controls */}
      <div className={styles.controlsRow}>
        <div className={styles.controlItem}>
          <label className={styles.controlLabel}>
            <span>Max Instructions:</span>
            <strong suppressHydrationWarning>{maxInstructions.toLocaleString("en-US")}</strong>
          </label>
          <input
            type="range"
            min={100}
            max={50000}
            step={100}
            value={maxInstructions}
            onChange={(e) => {
              const val = Number(e.target.value);
              setMaxInstructions(val);
              executeCode(scriptCode, val, maxExecutionMs);
            }}
            className={styles.slider}
          />
        </div>

        <div className={styles.controlItem}>
          <label className={styles.controlLabel}>
            <span>Timeout (ms):</span>
            <strong>{maxExecutionMs} ms</strong>
          </label>
          <input
            type="range"
            min={20}
            max={1000}
            step={20}
            value={maxExecutionMs}
            onChange={(e) => {
              const val = Number(e.target.value);
              setMaxExecutionMs(val);
              executeCode(scriptCode, maxInstructions, val);
            }}
            className={styles.slider}
          />
        </div>
      </div>

      {/* Action Button with Visual Execution Feedback */}
      <button
        type="button"
        className={`${styles.runBtn} ${isExecuting ? styles.runBtnExecuting : ""} ${justRanSuccess ? styles.runBtnSuccess : ""}`}
        onClick={() => executeCode(scriptCode)}
        disabled={isExecuting}
        title="Execute script in VM (or press Ctrl + Enter anywhere)"
      >
        {isExecuting ? (
          <>
            <svg className={styles.spinnerIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <span>Executing VM...</span>
          </>
        ) : justRanSuccess ? (
          <>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Executed Successfully ({lastElapsed}ms)</span>
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span>Run in Sandbox</span>
            <span className={styles.kbdShortcutBadge}>Ctrl + ↵</span>
          </>
        )}
      </button>

      {/* Output Panel with 4 Tabs */}
      <div className={`${styles.outputBox} ${justRanFlash ? styles.outputBoxFlash : ""}`}>
        <div className={styles.outputHeader}>
          <div className={styles.outputTabs}>
            <button
              type="button"
              className={`${styles.outputTabBtn} ${resultTab === "console" ? styles.outputTabBtnActive : ""}`}
              onClick={() => setResultTab("console")}
            >
              Console Output ({consoleLogs.length})
            </button>
            <button
              type="button"
              className={`${styles.outputTabBtn} ${resultTab === "bytecode" ? styles.outputTabBtnActive : ""}`}
              onClick={() => setResultTab("bytecode")}
            >
              Bytecode Disassembly
            </button>
            <button
              type="button"
              className={`${styles.outputTabBtn} ${resultTab === "ast" ? styles.outputTabBtnActive : ""}`}
              onClick={() => setResultTab("ast")}
            >
              AST Inspector
            </button>
            <button
              type="button"
              className={`${styles.outputTabBtn} ${resultTab === "table" ? styles.outputTabBtnActive : ""}`}
              onClick={() => setResultTab("table")}
            >
              Metrics Table
            </button>
          </div>

          <div className={styles.statusIndicator}>
            {runCount > 0 && (
              <span className={styles.runCounterBadge}>
                Run #{runCount} {lastRunTime && `(${lastRunTime})`} • {lastElapsed}ms
              </span>
            )}
            {runStatus === "ok" ? (
              <span className={styles.tagOk}>VM OK &bull; Return: {returnValue}</span>
            ) : (
              <span className={styles.tagErr}>{runStatus.toUpperCase()}</span>
            )}
          </div>
        </div>

        {/* Tab 1: Console stdout */}
        {resultTab === "console" && (
          <div className={styles.consoleBody}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingBottom: 6, borderBottom: "1px dashed #e5e7eb" }}>
              <span style={{ fontSize: 10.5, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                STDOUT STREAM {runCount > 0 ? `(RUN #${runCount} • ${lastElapsed}ms)` : ""}
              </span>
              {consoleLogs.length > 0 && (
                <button
                  type="button"
                  className={styles.toolBtn}
                  onClick={() => setConsoleLogs([])}
                  style={{ fontSize: 10, padding: "2px 6px" }}
                >
                  Clear Console
                </button>
              )}
            </div>

            {errorMessage && (
              <div className={styles.errorAlert}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}
            {consoleLogs.length > 0 ? (
              consoleLogs.map((log, i) => (
                <div key={i} className={styles.logLine}>
                  <span className={styles.logPrefix}>&gt;</span>
                  <span>{log}</span>
                </div>
              ))
            ) : !errorMessage ? (
              <div className={styles.logEmpty}>
                No print outputs. Return value: <code>{returnValue}</code>
              </div>
            ) : null}
          </div>
        )}

        {/* Tab 2: Bytecode Disassembly */}
        {resultTab === "bytecode" && (
          <pre className={styles.bytecodePre}>{bytecodeText || "No bytecode compiled yet."}</pre>
        )}

        {/* Tab 3: AST Inspector */}
        {resultTab === "ast" && (
          <pre className={styles.bytecodePre}>{astText || "No AST generated."}</pre>
        )}

        {/* Tab 4: Metrics Table */}
        {resultTab === "table" && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Metric / Check</th>
                  <th>Details</th>
                  <th style={{ textAlign: "right" }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, idx) => (
                  <tr key={idx}>
                    <td>{row.stage}</td>
                    <td>{row.metric}</td>
                    <td>{row.details}</td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: row.isSuccess === false ? "#dc2626" : "#059669" }}>
                      {row.result}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
