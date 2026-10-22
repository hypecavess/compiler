/**
 * Real-world Example: Safe Formula & Calculator Engine
 *
 * Demonstrates embedding Fradual to safely evaluate mathematical expressions,
 * custom financial equations, or user-provided formulas without using risky `eval()`.
 */
import { Fradual } from '../src/index.js';

// Setup sandboxed math engine with custom math host natives and strict instruction governance
const engine = new Fradual({
    maxInstructions: 10_000,
    maxExecutionMs: 100,
    natives: {
        sqrt: (x: number) => Math.sqrt(x),
        pow: (base: number, exp: number) => Math.pow(base, exp),
        abs: (x: number) => Math.abs(x),
        round: (x: number, decimals: number = 0) => {
            const factor = Math.pow(10, decimals);
            return Math.round(x * factor) / factor;
        },
        min: (a: number, b: number) => Math.min(a, b),
        max: (a: number, b: number) => Math.max(a, b),
    },
});

function evaluateFormula(formula: string, variables: Record<string, number>): number | null {
    // Inject dynamic variables into the engine
    for (const [key, val] of Object.entries(variables)) {
        engine.set(key, val);
    }

    const script = `return ${formula};`;
    const result = engine.run(script);

    if (result.ok && typeof result.value === 'number') {
        return result.value;
    }

    console.error('Formula evaluation error:', result.diagnostics);
    return null;
}

console.log('--- 1. Loan Monthly Payment Formula (EMI) ---');
// EMI Formula: P * r * (1 + r)^n / ((1 + r)^n - 1)
// Using helper variables in script:
const loanCalculationScript = `
    var monthlyRate = annualInterestRate / 12 / 100;
    var compound = pow(1 + monthlyRate, loanMonths);
    var monthlyPayment = loanAmount * monthlyRate * compound / (compound - 1);
    var totalCost = monthlyPayment * loanMonths;
    var totalInterest = totalCost - loanAmount;

    return {
        monthlyPayment: round(monthlyPayment, 2),
        totalCost: round(totalCost, 2),
        totalInterest: round(totalInterest, 2)
    };
`;

engine.set('loanAmount', 250_000);
engine.set('annualInterestRate', 6.5);
engine.set('loanMonths', 360); // 30-year mortgage

const loanResult = engine.run(loanCalculationScript);
if (loanResult.ok) {
    console.log('Mortgage Calculation Result:', loanResult.value);
}

console.log('\n--- 2. Direct Formula Evaluation ---');
const hypotenuse = evaluateFormula('sqrt(pow(a, 2) + pow(b, 2))', { a: 3, b: 4 });
console.log('Hypotenuse (3, 4) =', hypotenuse); // Expected: 5

console.log('\n--- 3. Sandboxing Malicious Formula ---');
// An untrusted user tries to create an infinite loop in a formula
const maliciousFormula = 'while(true) {}';
const attackResult = engine.run(maliciousFormula);
console.log('Attack blocked successfully:', {
    ok: attackResult.ok,
    status: attackResult.status,
    diagnostic: attackResult.diagnostics[0]?.message,
});
