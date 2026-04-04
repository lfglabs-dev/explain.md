/**
 * Intent DSL Evaluator
 *
 * Evaluates an intent function against decoded calldata parameters
 * to produce an EmittedTemplate — the human-readable transaction intent.
 *
 * This is the TypeScript equivalent of verity/Verity/Intent/Eval.lean:
 *
 *   def evalIntent (spec : IntentSpec) (binding : IntentBinding)
 *       (params : List (String × Value)) (fuel : Nat := 1024)
 *       : Option (List EmittedTemplate)
 *
 * The evaluator walks the statement tree:
 *   1. For `emit` statements: produces a template with resolved holes
 *   2. For `when/otherwise` blocks: evaluates the condition expression
 *      and recurses into the matching branch
 *
 * Template indices are assigned by pre-order AST traversal: the first
 * `emit` in the source is template #0, the second is template #1, etc.
 * This matches the Circom circuit's output commitment.
 *
 * @see verity/Verity/Intent/Eval.lean — evalStmts, evalExpr
 */

import type {
  Value,
  Expr,
  Stmt,
  IntentFn,
  IntentSpec,
  Binding,
  EmittedTemplate,
  ResolvedHole,
  Template,
} from "./types";

// ─── Expression Evaluation ──────────────────────────────────────────────────

/**
 * Evaluate a pure expression to a Value.
 *
 * @param expr - The expression to evaluate
 * @param env - Parameter name → Value mapping
 * @returns The computed value
 * @throws If a referenced parameter is not found in the environment
 */
function evalExpr(expr: Expr, env: Map<string, Value>): Value {
  switch (expr.kind) {
    case "param": {
      const val = env.get(expr.name);
      if (!val) throw new Error(`Unknown parameter: ${expr.name}`);
      return val;
    }

    case "const":
      return { kind: "int", value: expr.value };

    case "eq": {
      const left = evalExpr(expr.left, env);
      const right = evalExpr(expr.right, env);
      return { kind: "bool", value: valuesEqual(left, right) };
    }

    case "index": {
      const arr = evalExpr(expr.array, env);
      if (arr.kind !== "list")
        throw new Error("Cannot index into non-list value");
      return arr.items[expr.index];
    }

    case "lastIndex": {
      const arr = evalExpr(expr.array, env);
      if (arr.kind !== "list")
        throw new Error("Cannot index into non-list value");
      return arr.items[arr.items.length - 1];
    }
  }
}

/** Check structural equality of two Values. */
function valuesEqual(a: Value, b: Value): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "int":
      return a.value === (b as typeof a).value;
    case "bool":
      return a.value === (b as typeof a).value;
    case "address":
      return a.value.toLowerCase() === (b as typeof a).value.toLowerCase();
    case "list":
      return false; // Lists are not comparable in the DSL
  }
}

// ─── Template Collection ────────────────────────────────────────────────────

/**
 * Collect all templates from a statement tree in pre-order.
 *
 * Template indices are assigned by source order (AST walk), not by
 * execution order. This is critical for matching the circuit output:
 * the Circom circuit assigns indices the same way.
 *
 * For a when/otherwise block with:
 *   when ... => emit "A"       ← template #0
 *   otherwise => emit "B"      ← template #1
 */
export function collectAllTemplates(stmts: Stmt[]): Template[] {
  const templates: Template[] = [];

  function walk(stmt: Stmt) {
    switch (stmt.kind) {
      case "emit":
        templates.push(stmt.template);
        break;
      case "when":
        stmt.then.forEach(walk);
        stmt.otherwise.forEach(walk);
        break;
    }
  }

  stmts.forEach(walk);
  return templates;
}

// ─── Statement Evaluation ───────────────────────────────────────────────────

/**
 * Counter for tracking template indices during evaluation.
 * Mirrors the AST-walk ordering from collectAllTemplates.
 */
type EvalState = {
  templateCounter: number;
};

/**
 * Evaluate a list of statements, producing emitted templates.
 *
 * @returns Array of emitted templates (typically exactly one)
 */
function evalStmts(
  stmts: Stmt[],
  env: Map<string, Value>,
  state: EvalState
): EmittedTemplate[] {
  const results: EmittedTemplate[] = [];

  for (const stmt of stmts) {
    switch (stmt.kind) {
      case "emit": {
        // Resolve all holes in the template
        const holes: ResolvedHole[] = stmt.template.holes.map((hole) => {
          const value = env.get(hole.name);
          if (!value) throw new Error(`Unresolved hole: ${hole.name}`);
          return { name: hole.name, format: hole.format, value };
        });

        results.push({
          templateIndex: state.templateCounter,
          text: stmt.template.text,
          holes,
        });

        state.templateCounter++;
        break;
      }

      case "when": {
        const condValue = evalExpr(stmt.condition, env);
        const condBool =
          condValue.kind === "bool" ? condValue.value : false;

        if (condBool) {
          // Execute the "then" branch, but still count templates in "otherwise"
          results.push(...evalStmts(stmt.then, env, state));
          // Count templates in the skipped branch (for correct indexing)
          skipCount(stmt.otherwise, state);
        } else {
          // Count templates in the skipped branch
          skipCount(stmt.then, state);
          // Execute the "otherwise" branch
          results.push(...evalStmts(stmt.otherwise, env, state));
        }
        break;
      }
    }
  }

  return results;
}

/** Count templates in a skipped branch without evaluating. */
function skipCount(stmts: Stmt[], state: EvalState) {
  for (const stmt of stmts) {
    switch (stmt.kind) {
      case "emit":
        state.templateCounter++;
        break;
      case "when":
        skipCount(stmt.then, state);
        skipCount(stmt.otherwise, state);
        break;
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Evaluate an intent function with decoded parameters.
 *
 * This is the main entry point — the TypeScript equivalent of
 * `evalIntent` in Verity/Intent/Eval.lean.
 *
 * @param spec - The contract's intent specification
 * @param binding - The selector→function binding that matched
 * @param params - Decoded calldata parameters (name → Value)
 * @returns The emitted template with resolved holes, or null on error
 */
export function evaluateIntent(
  spec: IntentSpec,
  binding: Binding,
  params: Map<string, Value>
): EmittedTemplate | null {
  // Find the intent function declaration
  const fn = spec.fns.find((f) => f.name === binding.intentFnName);
  if (!fn) return null;

  // Build the environment: merge params with derived values
  const env = new Map(params);

  // For Uniswap-style specs: derive tokenIn/tokenOut from path array
  derivePathTokens(fn, env);

  // Add constants to environment (as int values)
  for (const [name, value] of Object.entries(spec.constants)) {
    if (!env.has(name)) {
      env.set(name, { kind: "int", value });
    }
  }

  const state: EvalState = { templateCounter: 0 };
  const results = evalStmts(fn.body, env, state);

  return results.length > 0 ? results[0] : null;
}

/**
 * Derive tokenIn / tokenOut from a path array parameter.
 *
 * When the intent function uses holes named "tokenIn" and "tokenOut"
 * but the parameters include a "path" array, we extract:
 *   - tokenIn = path[0]   (input token)
 *   - tokenOut = path[-1]  (output token)
 */
function derivePathTokens(fn: IntentFn, env: Map<string, Value>) {
  const pathValue = env.get("path");
  if (!pathValue || pathValue.kind !== "list") return;

  // Check if the function uses tokenIn/tokenOut holes
  const usesTokenIn = fn.body.some((s) => stmtUsesHole(s, "tokenIn"));
  const usesTokenOut = fn.body.some((s) => stmtUsesHole(s, "tokenOut"));

  if (usesTokenIn && pathValue.items.length > 0) {
    env.set("tokenIn", pathValue.items[0]);
  }
  if (usesTokenOut && pathValue.items.length > 0) {
    env.set("tokenOut", pathValue.items[pathValue.items.length - 1]);
  }
}

/** Check if a statement uses a hole with the given name. */
function stmtUsesHole(stmt: Stmt, holeName: string): boolean {
  switch (stmt.kind) {
    case "emit":
      return stmt.template.holes.some((h) => h.name === holeName);
    case "when":
      return (
        stmt.then.some((s) => stmtUsesHole(s, holeName)) ||
        stmt.otherwise.some((s) => stmtUsesHole(s, holeName))
      );
  }
}
