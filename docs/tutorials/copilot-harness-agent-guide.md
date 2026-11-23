# Agent guide: building a GitHub Copilot harness with metapilot

> Audience: coding agents (Claude Code, Copilot agent mode, ruflo agents).
> Human-friendly version: [`copilot-harness-tutorial.html`](copilot-harness-tutorial.html).
> Every command below was run against this repository on 2026-11-23 and the
> outputs quoted are real. Upstream: `ruvnet/metaharness` @ `2471c03` (MIT).

## 1. What this repository is

A **Copilot-only slim copy** of the metaharness monorepo. It contains only
what is needed to scaffold, check and run an agent harness for **GitHub
Copilot in VS Code**.

| Path | Package | Role |
|---|---|---|
| `packages/create-agent-harness` | `metaharness` (bins `metaharness`, `harness`) | The CLI. `HOSTS = ['copilot']`. |
| `packages/kernel-js` | `@metaharness/kernel` | Loads the kernel: native → **wasm** → JS. Ships `pkg/ruflo_kernel_wasm_bg.wasm` from npm 0.1.8. |
| `packages/host-copilot` | `@metaharness/host-copilot` | Writes `.vscode/mcp.json`, `.github/copilot-instructions.md`, `install.md`. |
| `packages/horizon` | `@metaharness/horizon` | Long-horizon planner. `wasm/horizon_core.wasm` from npm 0.2.2, no JS fallback. |
| `packages/{harness,weight-eft,turn-credit,redblue,avo,artex-defense}` | support libs | Used by CLI subcommands. |
| `docs/adrs/` | — | Design decisions, verbatim from upstream. Copilot host = `ADR-032`. |

Facts an agent must not "fix":

- There is **no Rust source**. The `.wasm` binaries are prebuilt and taken
  from the npm tarballs (sha256 kernel `1e5e2bdd…f743`, horizon
  `2dbaad3c…f101`). Never try to rebuild them, never delete `pkg/` or `wasm/`.
- The native NAPI kernel is not published; `backend: wasm` is the **expected**
  healthy state. `native unavailable` in `harness diag` is informational.
- The wasm kernel reports `version 0.1.0` from `kernelInfo()` while the
  manifest says `0.1.8`. This is upstream behaviour, not a mismatch.
- Only the `copilot` host exists. Do not pass `--host claude-code` etc.

## 2. Preconditions

- Node.js ≥ 20, npm. VS Code ≥ 1.99 with GitHub Copilot Chat (for step 7 only).
- Network to the npm registry (generated harnesses pull
  `@metaharness/darwin` and, by default, kernel/host-copilot from npm).

## 3. Canonical procedure

Run from the repository root unless stated. `$H` = path of the harness you
generate (keep it **outside** this repo, e.g. `../my-bot`).

```bash
npm ci                 # install workspaces, links bins metaharness + harness
npm run build          # ordered tsc build of all packages
npm test               # expect 0 failures (~1,200 tests, a few skipped)
```

```bash
npx metaharness --help   # usage; last line must read "Hosts: copilot"
npx metaharness --list   # 20 templates: minimal + vertical:*
```

Optional: assess a repo **before** scaffolding (read-only, never executes it):

```bash
npx metaharness score <repo>     # 5-dim scorecard + est. cost per run
npx metaharness analyze <repo>   # recommended agents/commands; writes repo-profile.json + harness-plan.json INTO <repo>
npx metaharness genome <repo>    # 7-section readiness
```

Note: `analyze` writes two JSON files into the target repo. Run it on a
copy or delete them afterwards if the repo must stay clean.

Scaffold:

```bash
npx metaharness my-bot --host copilot --template vertical:coding \
  --description "Coding helper for my project" --target ../my-bot
```

Expected: `Scaffolded my-bot into …`, `Files: 24`. Flags: `--no-darwin`
(skip `npm run evolve`), `--sessions`, `--field-memory`, `--force`
(overwrite), `--wizard` (interactive – avoid in agents).

Install and verify the harness:

```bash
cd ../my-bot
npm install
npm run doctor     # must end: "my-bot: all checks passed (kernel 0.1.0, wasm backend, host copilot)"
npm test           # 4 passed
```

Governance checks (run from this repo root; they take a path):

```bash
npx harness doctor ../my-bot     # Result: HEALTHY
npx harness mcp-scan ../my-bot   # MEDIUM: .env not denied, unpinned ranges (see §5)
npx harness diag ../my-bot       # PASS kernel versions match exactly
npx harness score ../my-bot      # Verdict: A
npx harness validate ../my-bot   # umbrella; "secrets" FAILs without gcloud project (see §5)
```

Prove the MCP server answers (stdio JSON-RPC, no VS Code needed):

```bash
printf '%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","clientInfo":{"name":"t","version":"1"},"capabilities":{}}}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
 '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"harness_info","arguments":{}}}' \
 | timeout 5 node bin/cli.js mcp start
```

Expect three JSON-RPC results; `tools/list` returns one read-only tool,
`harness_info`.

Self-improvement (Darwin Mode, safe by default, no network/API key):

```bash
npm run evolve:dry   # mock sandbox: prints Winner, Lineage, Delta; writes .metaharness/
npm run evolve       # real sandbox, 3 generations × 4 children
```

## 4. Generated harness layout (what to edit)

| File | Purpose | Edit? |
|---|---|---|
| `.vscode/mcp.json` | Copilot MCP registration (`servers` + `mcpServers`) → `node ./bin/mcp.js` | Only to add servers |
| `.github/copilot-instructions.md` | Copilot's always-on instructions | **Yes** – main place for behaviour rules |
| `.harness/mcp-policy.json` | `defaultDeny: true`, no network/shell/file-write, 8 calls/turn, 30 s timeout, audit log | Loosen only with explicit user approval |
| `.harness/manifest.json` + `.sha256` | Integrity manifest checked by `harness doctor` | Never hand-edit; regenerate |
| `bin/cli.js` | `init`, `doctor`, `mcp start`, `--version` | Extend commands here |
| `bin/mcp.js` | Minimal stdio MCP server (`harness_info`) | Add tools here |
| `src/agents/*.ts` | Agent personas (architect, implementer, reviewer, test-writer) | **Yes** |
| `.claude/skills`, `.claude/commands` | Skills/commands (also usable by Claude Code) | Yes |
| `__tests__/smoke.test.ts` | Imports kernel + host-copilot | Keep green |

After any edit: `npm test && npm run doctor && npx harness doctor <path>`
(from this repo). If `manifest hash` fails, you edited a file covered by the
manifest; re-scaffold with `--force` or run `npx harness upgrade <path>`
(drift plan; `--apply` to write).

## 5. Expected warnings and how to treat them

| Signal | Meaning | Action |
|---|---|---|
| `WARN .claude-plugin/plugin.json absent` | Only matters for Claude Code plugins | Ignore for Copilot |
| `mcp-scan [MED] Secrets not denied` | No `permissions.deny Read(./.env*)` | Add the deny rule if the harness will ever get file-read tools |
| `mcp-scan [LOW] unpinned dependency range(s)` | `^0.1.0` ranges | Pin exact versions before publishing |
| `validate … FAIL secrets — no active gcloud project` | GCP Secret Manager check | Expected unless you use GCP; not a harness defect |
| `harness sign` → `WITNESS_SIGNING_KEY env var not set` | Witness signing needs a 64-hex key | Only for signed releases; never invent a key |
| `diag: native unavailable` / `minor-level generator skew` | Wasm backend in use; template newer than manifest | Informational |

## 6. Using this repo's local packages instead of npm

A generated harness depends on `@metaharness/kernel` and
`@metaharness/host-copilot` from npm. To run against the code in this repo,
edit the harness `package.json`:

```json
"dependencies": {
  "@metaharness/kernel": "file:/ABS/PATH/metapilot/packages/kernel-js",
  "@metaharness/host-copilot": "file:/ABS/PATH/metapilot/packages/host-copilot"
},
"overrides": { "@metaharness/kernel": "file:/ABS/PATH/metapilot/packages/kernel-js" }
```

Run `npm run build` in this repo first, then `npm install` in the harness.
`npm run doctor` must still report `wasm backend`.

## 7. Connecting to Copilot (human step, agents explain it)

1. Open the harness folder in VS Code ≥ 1.99, choose **Trust**.
2. Copilot Chat → switch to **Agent** mode → tools icon: `my-bot` server with
   `harness_info` is listed (or run **MCP: List Servers**; start it if stopped).
3. Ask: "Use harness_info to tell me about this harness". Copilot asks
   permission, calls the tool, returns name/version/description.

## 8. Ruflo integration

The ruflo MCP server (`.mcp.json`, `ruflo@3.80.1`) exposes metaharness tools
that wrap the same CLI. Use them instead of parsing CLI text:

| ruflo tool | Equivalent | Verified result on a fresh `vertical:coding` harness |
|---|---|---|
| `metaharness_score { path }` | `metaharness score` | harnessFit 67, compileConfidence 90, taskCoverage 98, toolSafety 95, memoryUsefulness 38, $0.048/run, 6/6 hard constraints |
| `metaharness_genome { path }` | `metaharness genome` | this repo: `node_mcp_ci`, risk 0.275, `local_default_deny`, verdict **ready** |
| `metaharness_mcp_scan` | `harness mcp-scan` | |
| `metaharness_evolve` | Darwin evolve | proposes only – the ruflo promotion gate decides |
| `metaharness_threat_model` | `harness threat-model` | |

`guidance_brain({mode:"recommend", task})` routes these to the
`metaharness-flywheel` domain (risk: reversible). Its guardrails apply:
Darwin proposes, a gate promotes; degraded/fallback runs are evaluation-only;
publishing needs explicit human authorization.

## 9. Agent rules (summary)

1. Build and test this repo before scaffolding; stop on any test failure.
2. Always `--host copilot`; write harnesses outside the repo with `--target`.
3. Done = `npm test` green **and** `npm run doctor` "all checks passed … wasm
   backend, host copilot" **and** `harness doctor` HEALTHY.
4. Keep `defaultDeny: true`. Any grant of shell/network/file-write needs the
   user's explicit approval and a matching `mcp-scan` rerun.
5. Never commit `.env`, signing keys, `node_modules`, `dist`, `.metaharness/`.
6. Do not rebuild or replace `.wasm` files; do not reintroduce Rust crates.
7. Do not run `npm publish`, `harness publish`, or `harness sign` without a
   human-approved release step.
8. Report warnings from §5 honestly; do not claim "secure" from
   `harness score` alone.

## 10. Known limitations

- `metaharness learn` is unavailable (needs a full upstream checkout).
- `harness sign` writes a placeholder witness without a real key.
- Generated harnesses still download `@metaharness/darwin@^0.13` from npm.
- ADRs 229, 246, 247, 279 link to files removed in the slim copy.
- `--with-wasm <crate-path>` needs `wasm-pack` and a Rust crate; not used here.

## References

- `docs/adrs/ADR-032-host-copilot.md` – Copilot host design
- `docs/adrs/ADR-070…076` – Darwin Mode
- `docs/adrs/ADR-031-bundle-json-pattern.md` – `harness diag --bundle`
- `packages/host-copilot/README.md`, `packages/create-agent-harness/README.md`
