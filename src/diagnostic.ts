/**
 * Structured error information produced by every stage of the pipeline.
 *
 * Library code never writes to the console; it records diagnostics instead so
 * that embedding hosts decide how (and whether) to surface them.
 */
export type DiagnosticKind = 'lexical' | 'syntax' | 'compile' | 'runtime';

export interface StackFrameInfo {
    /** Function name, or `null` for top-level script code. */
    function: string | null;
    line: number;
}

export interface Diagnostic {
    kind: DiagnosticKind;
    message: string;
    line: number;
    /** Offending token for syntax errors, e.g. `'foo'` or `end`. */
    where?: string;
    /** Call stack (innermost first). Only present for runtime errors. */
    stack?: StackFrameInfo[];
}

/** Formats a diagnostic the same way the CLI prints it. */
export function formatDiagnostic(diagnostic: Diagnostic): string {
    switch (diagnostic.kind) {
        case 'runtime': {
            const lines = [`Runtime Error: ${diagnostic.message}`];
            for (const frame of diagnostic.stack ?? []) {
                const location = frame.function ? `${frame.function}()` : 'script';
                lines.push(`  [line ${frame.line}] in ${location}`);
            }
            return lines.join('\n');
        }
        case 'compile':
            return `[line ${diagnostic.line}] Compile Error: ${diagnostic.message}`;
        case 'syntax':
            return `[line ${diagnostic.line}] Error at ${diagnostic.where ?? 'unknown'}: ${diagnostic.message}`;
        case 'lexical':
            return `[line ${diagnostic.line}] Error: ${diagnostic.message}`;
    }
}
