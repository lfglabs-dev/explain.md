/**
 * Groth16 Proof Generation & Verification
 *
 * Uses snarkjs and circomlibjs to:
 *   1. Compute Poseidon commitments (calldataHash, outputHash)
 *   2. Generate a Groth16 proof that the intent evaluation is correct
 *   3. Verify the proof against the verification key
 *
 * The circuit proves:
 *   - The selector matches the expected constant
 *   - Poseidon(selector, params...) == calldataCommitment
 *   - The DSL program evaluates to this specific templateId
 *   - Poseidon(templateId, holes...) == outputCommitment
 *
 * Circuit artifacts (.wasm, .zkey, vkey.json) were compiled from
 * Lean-generated Circom using the Verity compiler:
 *   lake build Compiler.CircomTest → circom → snarkjs setup
 *
 * @see verity/scripts/test_circom_e2e.sh
 * @see verity/Compiler/Circom.lean
 */

import type { EmittedTemplate, Value, Binding } from "./types";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ProofResult = {
  /** Poseidon(selector, params...) */
  calldataCommitment: string;
  /** Poseidon(templateId, holes...) */
  outputCommitment: string;
  /** Named inputs to the calldata Poseidon hash */
  calldataInputs: { name: string; value: string }[];
  /** Named inputs to the output Poseidon hash */
  outputInputs: { name: string; value: string }[];
  /** The Groth16 proof object */
  proof: Groth16Proof;
  /** Public signals: [selector, calldataCommitment, outputCommitment] */
  publicSignals: string[];
  /** Whether the proof verified against the vkey */
  verified: boolean;
  /** Time taken for proof generation (ms) */
  proveTimeMs: number;
  /** Time taken for verification (ms) */
  verifyTimeMs: number;
};

export type Groth16Proof = {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol: string;
  curve: string;
};

// ─── Circuit Registry ───────────────────────────────────────────────────────

/**
 * Maps (contractSpec, functionName) to the circuit artifact path.
 *
 * Only ERC-20 circuits are compiled for this demo.
 * The circuit names match the Lean compiler output:
 *   ERC20.transfer → ERC20_transfer
 *   ERC20.approve  → ERC20_approve
 */
const CIRCUIT_REGISTRY: Record<string, string> = {
  "USDC:transfer": "ERC20_transfer",
  "USDC:approve": "ERC20_approve",
};

function getCircuitName(
  specName: string,
  functionName: string
): string | null {
  return CIRCUIT_REGISTRY[`${specName}:${functionName}`] ?? null;
}

// ─── Uint256 Splitting ──────────────────────────────────────────────────────

/**
 * Split a bigint into two 128-bit limbs, matching the Circom convention.
 *
 * In the circuit, uint256 values are represented as two signals:
 *   amount_lo = lower 128 bits
 *   amount_hi = upper 128 bits
 *
 * @see verity/Compiler/Circom.lean — splitUint256
 */
function splitUint256(value: bigint): [bigint, bigint] {
  const mask128 = (1n << 128n) - 1n;
  const lo = value & mask128;
  const hi = (value >> 128n) & mask128;
  return [lo, hi];
}

// ─── Witness Input Construction ─────────────────────────────────────────────

/**
 * Build the witness input JSON for the circuit.
 *
 * The input contains:
 *   - selector: the 4-byte function selector as a decimal string
 *   - calldataCommitment: Poseidon(selector, params...) as decimal
 *   - outputCommitment: Poseidon(templateId, holes...) as decimal
 *   - each parameter as a decimal string (uint256 split into _lo/_hi)
 *
 * @see verity/scripts/test_circom_e2e.sh — compute_inputs.js
 */
type WitnessResult = {
  witness: Record<string, string>;
  calldataInputs: { name: string; value: string }[];
  outputInputs: { name: string; value: string }[];
};

async function buildWitnessInput(
  binding: Binding,
  params: Map<string, Value>,
  emitted: EmittedTemplate
): Promise<WitnessResult> {
  // Dynamic import of circomlibjs (heavy, only load when needed)
  const { buildPoseidon } = await import("circomlibjs");
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const selectorInt = BigInt(
    parseInt(binding.selector.slice(2), 16)
  );

  // Build the list of signal values for the calldata commitment
  // Order: selector, then each param in binding order
  const cdInputs: bigint[] = [selectorInt];
  const cdNamed: { name: string; value: string }[] = [
    { name: "selector", value: selectorInt.toString() },
  ];
  const witnessFields: Record<string, string> = {};

  for (const paramName of binding.paramMapping) {
    const value = params.get(paramName);
    if (!value) continue;

    if (value.kind === "int") {
      const [lo, hi] = splitUint256(value.value);
      cdInputs.push(lo, hi);
      cdNamed.push({ name: `${paramName}_lo`, value: lo.toString() });
      cdNamed.push({ name: `${paramName}_hi`, value: hi.toString() });
      witnessFields[`${paramName}_lo`] = lo.toString();
      witnessFields[`${paramName}_hi`] = hi.toString();
    } else if (value.kind === "address") {
      const addrInt = BigInt(value.value);
      cdInputs.push(addrInt);
      cdNamed.push({ name: paramName, value: addrInt.toString() });
      witnessFields[paramName] = addrInt.toString();
    } else if (value.kind === "bool") {
      const boolInt = value.value ? 1n : 0n;
      cdInputs.push(boolInt);
      cdNamed.push({ name: paramName, value: boolInt.toString() });
      witnessFields[paramName] = boolInt.toString();
    }
  }

  // Compute calldataCommitment = Poseidon(selector, params...)
  const cdHash = F.toObject(poseidon(cdInputs));

  // Build the output commitment inputs.
  // CRITICAL: The order must match the circuit's outHash ordering, which is
  // first-occurrence dedup across ALL emit templates (AST walk order).
  // For ERC-20 specs, this matches the parameter declaration order because
  // the "then" branch hole (to) appears before the "else" branch holes.
  //
  // The circuit computes: Poseidon(templateId, to, amount_lo, amount_hi)
  // NOT: Poseidon(templateId, amount_lo, amount_hi, to) ← wrong
  //
  // We use the binding's parameter order which matches the circuit signals.
  const templateId = BigInt(emitted.templateIndex);
  const outInputs: bigint[] = [templateId];
  const outNamed: { name: string; value: string }[] = [
    { name: "templateId", value: templateId.toString() },
  ];

  // Use parameter order from binding (matches circuit signal declaration order)
  for (const paramName of binding.paramMapping) {
    const value = params.get(paramName);
    if (!value) continue;

    if (value.kind === "int") {
      const [lo, hi] = splitUint256(value.value);
      outInputs.push(lo, hi);
      outNamed.push({ name: `${paramName}_lo`, value: lo.toString() });
      outNamed.push({ name: `${paramName}_hi`, value: hi.toString() });
    } else if (value.kind === "address") {
      const addrInt = BigInt(value.value);
      outInputs.push(addrInt);
      outNamed.push({ name: paramName, value: addrInt.toString() });
    } else if (value.kind === "bool") {
      outInputs.push(value.value ? 1n : 0n);
      outNamed.push({ name: paramName, value: (value.value ? 1n : 0n).toString() });
    }
  }

  // Compute outputCommitment = Poseidon(templateId, params...)
  const outHash = F.toObject(poseidon(outInputs));

  return {
    witness: {
      selector: selectorInt.toString(),
      calldataCommitment: cdHash.toString(),
      outputCommitment: outHash.toString(),
      ...witnessFields,
    },
    calldataInputs: cdNamed,
    outputInputs: outNamed,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Check if a circuit is available for the given spec + function.
 */
export function hasCircuit(
  specName: string,
  functionName: string
): boolean {
  return getCircuitName(specName, functionName) !== null;
}

/**
 * Generate and verify a Groth16 proof for the intent evaluation.
 *
 * Full pipeline:
 *   1. Compute Poseidon commitments (circomlibjs)
 *   2. Generate witness + proof (snarkjs.groth16.fullProve)
 *   3. Verify proof (snarkjs.groth16.verify)
 *
 * @param specName - The contract spec name (e.g. "USDC")
 * @param binding - The selector binding that matched
 * @param params - Decoded calldata parameters
 * @param emitted - The evaluated intent template
 * @returns ProofResult with proof data and verification status
 */
export async function generateAndVerifyProof(
  specName: string,
  binding: Binding,
  params: Map<string, Value>,
  emitted: EmittedTemplate
): Promise<ProofResult> {
  const circuitName = getCircuitName(specName, binding.intentFnName);
  if (!circuitName) {
    throw new Error(
      `No circuit available for ${specName}:${binding.intentFnName}`
    );
  }

  // Dynamic import snarkjs (heavy library)
  const snarkjs = await import("snarkjs");

  // Build witness input with Poseidon commitments
  const { witness, calldataInputs, outputInputs } = await buildWitnessInput(binding, params, emitted);

  // Circuit artifact paths (served from /public)
  const wasmPath = `/circuits/${circuitName}/circuit.wasm`;
  const zkeyPath = `/circuits/${circuitName}/circuit_final.zkey`;
  const vkeyPath = `/circuits/${circuitName}/vkey.json`;

  // Generate proof
  const proveStart = performance.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    witness,
    wasmPath,
    zkeyPath
  );
  const proveTimeMs = performance.now() - proveStart;

  // Load verification key and verify
  const verifyStart = performance.now();
  const vkeyResponse = await fetch(vkeyPath);
  const vkey = await vkeyResponse.json();
  const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  const verifyTimeMs = performance.now() - verifyStart;

  return {
    calldataCommitment: witness.calldataCommitment,
    outputCommitment: witness.outputCommitment,
    calldataInputs,
    outputInputs,
    proof: proof as Groth16Proof,
    publicSignals,
    verified,
    proveTimeMs,
    verifyTimeMs,
  };
}
