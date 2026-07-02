# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

We take the security of Compiler seriously.

If you find a vulnerability, please do NOT file a public issue. Instead, please report it privately:

1.  Email us at [hypecavess@gmail.com](mailto:hypecavess@gmail.com).
2.  Provide a detailed description of the vulnerability and steps to reproduce it.

We will acknowledge your report within 48 hours and work with you to fix the issue.

## Runtime Safety Limits

The VM enforces limits to contain runaway programs: a wall-clock execution timeout (5 s default), a maximum call depth (64 frames), a maximum value stack size (16384), and a 1 MiB source file size limit in the CLI. Compile-time errors (including constant pool overflow) prevent execution entirely, and host-side exceptions in native functions are converted into runtime errors instead of crashing the process.

> ⚠️ **Scope:** These limits are guardrails, not a hardened security boundary. The interpreter has not been audited for executing untrusted code. If you need to run untrusted scripts, add OS-level isolation (containers, seccomp, resource limits) around the process.

## Supply Chain

- CI fails on `npm audit` findings of high severity or above.
- CodeQL static analysis runs on every push, pull request, and weekly.
- Dependabot keeps npm and GitHub Actions dependencies up to date.
- GitHub Actions workflows run with least-privilege permissions.
