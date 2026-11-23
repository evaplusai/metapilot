/* tslint:disable */
/* eslint-disable */

/**
 * Validate an autonomous spec block (ADR-246 §2.2).
 * Returns a JS array of lockstep error strings; empty array = valid.
 */
export function autonomousValidate(spec_json: string): any;

/**
 * Return kernel build metadata as a JS object.
 */
export function kernelInfo(): any;

/**
 * Validate an MCP server spec (returns `null` on success, error string otherwise).
 */
export function mcpValidate(spec_json: string): any;

/**
 * Replay a branch of a JSONL session log.
 * Returns `{ eventCount, stateHash }` on success, error string otherwise.
 */
export function sessionReplay(log_jsonl: string, branch: string): any;

/**
 * Deterministic state hash (lowercase sha256 hex) of a branch lineage
 * in a JSONL session log.
 */
export function sessionStateHash(log_jsonl: string, branch: string): string;

/**
 * Validate a JSONL session log (ADR-246 §2.3).
 * Returns a JS array of 'session: '-prefixed error strings; empty = valid.
 */
export function sessionValidate(log_jsonl: string): any;

/**
 * Returns the package version.
 */
export function version(): string;
