/**
 * Clear Signing Engine — Type Definitions
 *
 * These types mirror the Verity Provable Intent DSL defined in:
 *   verity/Verity/Intent/Types.lean
 *
 * The DSL maps (selector, calldata) → (templateId, formatted holes),
 * allowing wallets to display human-readable transaction intent that is
 * backed by a Groth16 zero-knowledge proof of correctness.
 *
 * @see https://github.com/lfglabs-dev/verity/pull/1677
 */

// ─── Values ──────────────────────────────────────────────────────────────────

/** Runtime values produced during evaluation — mirrors Verity/Intent/Eval.lean */
export type Value =
  | { kind: "int"; value: bigint }
  | { kind: "bool"; value: boolean }
  | { kind: "address"; value: string }
  | { kind: "list"; items: Value[] };

// ─── Format Directives ──────────────────────────────────────────────────────

/**
 * Controls how a hole value is rendered in the final display.
 *
 * In the Lean DSL:
 *   {amount:tokenAmount 6 "USDC"}  →  "1.00 USDC"
 *   {to:address}                   →  "vitalik.eth" or "0xd8dA..."
 *   {amount:raw}                   →  "1000000"
 */
export type Format =
  | { kind: "raw" }
  | { kind: "tokenAmount"; decimals: number; symbol?: string }
  | { kind: "address" };

// ─── Templates & Holes ─────────────────────────────────────────────────────

/** A placeholder in a template that gets filled with a formatted value. */
export type Hole = {
  /** Parameter name (e.g. "to", "amount") */
  name: string;
  /** How to display the value */
  format: Format;
};

/** A display template with embedded holes. */
export type Template = {
  /** Template text with {name} placeholders (e.g. "Send {amount} to {to}") */
  text: string;
  /** Ordered list of holes appearing in the text */
  holes: Hole[];
};

// ─── DSL Expressions & Statements ───────────────────────────────────────────

/**
 * Expressions in the intent DSL — pure, no side effects.
 *
 * Mirrors the Expr inductive type in Verity/Intent/Types.lean.
 * Simplified for this demo: we only need param access, constants,
 * equality checks, and array indexing.
 */
export type Expr =
  | { kind: "param"; name: string }
  | { kind: "const"; value: bigint }
  | { kind: "eq"; left: Expr; right: Expr }
  | { kind: "index"; array: Expr; index: number }
  | { kind: "lastIndex"; array: Expr };

/**
 * Statements in the intent DSL.
 *
 * Mirrors the Stmt inductive type in Verity/Intent/Types.lean.
 *   - emit: produce a template (the "output" of intent evaluation)
 *   - when/otherwise: conditional branching
 */
export type Stmt =
  | { kind: "emit"; template: Template }
  | { kind: "when"; condition: Expr; then: Stmt[]; otherwise: Stmt[] };

// ─── Intent Specification ───────────────────────────────────────────────────

/** ABI parameter type */
export type ParamType =
  | "uint256"
  | "address"
  | "bool"
  | "uint24"
  | "uint160"
  | "address[]"
  | "bytes";

/** An intent function: maps decoded parameters to display templates. */
export type IntentFn = {
  name: string;
  params: { name: string; type: ParamType }[];
  body: Stmt[];
};

/**
 * Binding from a Solidity function (identified by its 4-byte selector)
 * to an intent function.
 *
 * In the Lean DSL:
 *   bind "transfer" to transfer
 */
export type Binding = {
  /** 4-byte function selector (e.g. "0xa9059cbb") */
  selector: string;
  /** Human-readable ABI signature (e.g. "transfer(address,uint256)") */
  abiSignature: string;
  /** Name of the intent function to invoke */
  intentFnName: string;
  /** Maps each ABI parameter position to an intent parameter name */
  paramMapping: string[];
};

/**
 * A complete intent specification for a contract.
 *
 * Mirrors Verity/Intent/Types.lean — IntentSpec.
 * One spec per contract address; contains all the information needed to
 * decode any supported function call and produce a human-readable intent.
 */
export type IntentSpec = {
  /** Contract name (e.g. "USDC", "Uniswap V2 Router") */
  contractName: string;
  /** Ethereum address (checksummed) */
  address: string;
  /** Display category for the address */
  type: "token" | "protocol" | "contract" | "ens";
  /** Token decimals (only for tokens) */
  decimals?: number;
  /** Token symbol (only for tokens) */
  symbol?: string;
  /** Named constants used in conditions */
  constants: Record<string, bigint>;
  /** Intent function declarations */
  fns: IntentFn[];
  /** Selector → intent function bindings */
  bindings: Binding[];
};

// ─── Evaluation Output ──────────────────────────────────────────────────────

/** A resolved hole — a hole with its concrete value from calldata. */
export type ResolvedHole = {
  name: string;
  format: Format;
  value: Value;
};

/**
 * The result of evaluating an intent.
 *
 * Mirrors Verity/Intent/Eval.lean — EmittedTemplate.
 * The evaluator walks the DSL statements, checks conditions, and produces
 * exactly one emitted template with resolved holes.
 */
export type EmittedTemplate = {
  /** 0-based index among all possible templates (matches circuit output) */
  templateIndex: number;
  /** Template text with {name} placeholders */
  text: string;
  /** Holes filled with concrete values */
  holes: ResolvedHole[];
};

// ─── Address Resolution ─────────────────────────────────────────────────────

/**
 * Resolved address info, derived from IntentSpec metadata.
 * No separate registry needed — all address info comes from specs.
 */
export type ResolvedAddress = {
  address: string;
  /** Human-readable name from spec's contractName */
  name: string;
  /** Category from spec's type field */
  type: "token" | "protocol" | "contract" | "ens";
  /** Token decimals (only for tokens) */
  decimals?: number;
  /** Token symbol (only for tokens) */
  symbol?: string;
};

