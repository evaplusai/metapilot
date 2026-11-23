#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// Topologically-ordered workspace build. `npm run -ws --if-present build`
// runs in undefined order — when `host-rvm` builds BEFORE `kernel-js` has
// produced its `dist/index.d.ts`, tsc fails with "Cannot find module
// '@metaharness/kernel'". This script fixes the order:
//
//   1. @metaharness/kernel        (everyone depends on it)
//   2. @metaharness/vertical-base (vertical-trading depends on it)
//   3. SDK + host adapters + create-agent-harness (parallel-safe)
//   4. vertical-trading + bench

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

const PHASES = [
  // Slim Copilot-only build. Phase 1: dependency-free packages.
  ['kernel-js', 'harness', 'weight-eft', 'horizon', 'turn-credit'],
  // Phase 2: redblue (-> artex-defense -> harness, artex-defense has no build), avo (-> horizon).
  ['redblue', 'avo'],
  // Phase 3: host adapter + CLI (both depend on kernel-js).
  ['host-copilot', 'create-agent-harness'],
];

const ROOT = process.cwd();
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

async function runOne(pkg) {
  const cwd = `${ROOT}/packages/${pkg}`;
  // Use cmd.exe on Windows to invoke .cmd shims safely (no shell:true =
  // no DEP0190 warning). On POSIX, execFile npm directly.
  const args = ['run', '--if-present', 'build'];
  const [bin, finalArgs] = process.platform === 'win32'
    ? ['cmd.exe', ['/d', '/s', '/c', 'npm', ...args]]
    : ['npm', args];
  try {
    const r = await execFile(bin, finalArgs, {
      cwd,
      maxBuffer: 1024 * 1024 * 32,
      windowsHide: true,
    });
    if (r.stdout.trim()) process.stdout.write(`[${pkg}] ${r.stdout}`);
    return { pkg, ok: true };
  } catch (e) {
    process.stderr.write(`\n[${pkg}] FAILED\n${e.stdout ?? ''}${e.stderr ?? ''}\n`);
    return { pkg, ok: false };
  }
}

async function main() {
  const t0 = process.hrtime.bigint();
  for (const [i, phase] of PHASES.entries()) {
    process.stderr.write(`\n[build-ordered] phase ${i + 1}/${PHASES.length}: ${phase.join(', ')}\n`);
    const results = await Promise.all(phase.map(runOne));
    const failed = results.filter(r => !r.ok);
    if (failed.length > 0) {
      process.stderr.write(`\n[build-ordered] phase ${i + 1} failed: ${failed.map(r => r.pkg).join(', ')}\n`);
      process.exit(1);
    }
  }
  const ms = Number((process.hrtime.bigint() - t0) / 1_000_000n);
  process.stderr.write(`\n[build-ordered] DONE in ${ms}ms\n`);
}

main().catch(err => {
  process.stderr.write(`[build-ordered] unexpected: ${err?.stack ?? err}\n`);
  process.exit(1);
});
