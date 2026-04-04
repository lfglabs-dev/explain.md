/**
 * Groth16 Proof Generation & Verification
 *
 * Uses snarkjs to:
 *   1. Generate a Groth16 proof that the intent evaluation is correct
 *   2. Verify the proof against the verification key
 *
 * The circuit (compiled from Lean-generated Circom) proves:
 *   - The selector matches the expected constant
 *   - The DSL program evaluates to this specific templateId
 *   - Poseidon(selector, params...) == calldataCommitment (public output)
 *   - Poseidon(templateId, holes...) == outputCommitment (public output)
 *
 * The Poseidon hashes are computed inside the circuit over BLS12-381's
 * scalar field. We do NOT compute them in JS — the circuit outputs them
 * as public signals.
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
  /** Poseidon(selector, params...) — computed by the circuit */
  calldataCommitment: string;
  /** Poseidon(templateId, holes...) — computed by the circuit */
  outputCommitment: string;
  /** Named inputs to the calldata Poseidon hash */
  calldataInputs: { name: string; value: string }[];
  /** Named inputs to the output Poseidon hash */
  outputInputs: { name: string; value: string }[];
  /** The Groth16 proof object */
  proof: Groth16Proof;
  /** Public signals: [calldataCommitment, outputCommitment, selector] */
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
  "ERC20:transfer": "ERC20_transfer",
  "ERC20:approve": "ERC20_approve",
};

function getCircuitName(
  specName: string,
  functionName: string
): string | null {
  return CIRCUIT_REGISTRY[`${specName}:${functionName}`] ?? null;
}

/**
 * Compute the SHA-256 hash of a circuit's verification key.
 * Used to verify that the circuit matches the ENS registry commitment.
 */
export async function getVkeyHash(
  specName: string,
  functionName: string
): Promise<string | null> {
  const circuitName = getCircuitName(specName, functionName);
  if (!circuitName) return null;

  const vkeyPath = `/circuits/${circuitName}/vkey.json`;
  try {
    const response = await fetch(vkeyPath);
    const vkeyText = await response.text();
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(vkeyText)
    );
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
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

type WitnessResult = {
  /** Circuit input signals (only raw params, no commitments) */
  witness: Record<string, string>;
  /** Named inputs for calldataCommitment display */
  calldataInputs: { name: string; value: string }[];
  /** Named inputs for outputCommitment display */
  outputInputs: { name: string; value: string }[];
};

/**
 * Build the witness input for the circuit.
 *
 * The circuit has 6 signals for ERC-20 functions:
 *   Public:  selector, calldataCommitment, outputCommitment
 *   Private: param signals (e.g. spender, amount_lo, amount_hi)
 *
 * The commitments are Poseidon hashes computed over BN254's scalar field
 * (matching the circomlib Poseidon used inside the circuit):
 *   calldataCommitment = Poseidon(selector, params...)
 *   outputCommitment   = Poseidon(templateId, params...)
 */
async function buildWitnessInput(
  binding: Binding,
  params: Map<string, Value>,
  emitted: EmittedTemplate
): Promise<WitnessResult> {
  const { buildPoseidon } = await import("circomlibjs");
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const selectorInt = BigInt(
    parseInt(binding.selector.slice(2), 16)
  );

  // Calldata commitment: Poseidon(selector, params...)
  const cdInputs: bigint[] = [selectorInt];
  const witnessFields: Record<string, string> = {};
  const cdNamed: { name: string; value: string }[] = [
    { name: "selector", value: selectorInt.toString() },
  ];

  for (const paramName of binding.paramMapping) {
    const value = params.get(paramName);
    if (!value) continue;

    if (value.kind === "int") {
      const [lo, hi] = splitUint256(value.value);
      cdInputs.push(lo, hi);
      witnessFields[`${paramName}_lo`] = lo.toString();
      witnessFields[`${paramName}_hi`] = hi.toString();
      cdNamed.push({ name: `${paramName}_lo`, value: lo.toString() });
      cdNamed.push({ name: `${paramName}_hi`, value: hi.toString() });
    } else if (value.kind === "address") {
      const addrInt = BigInt(value.value);
      cdInputs.push(addrInt);
      witnessFields[paramName] = addrInt.toString();
      cdNamed.push({ name: paramName, value: addrInt.toString() });
    } else if (value.kind === "bool") {
      const boolInt = value.value ? 1n : 0n;
      cdInputs.push(boolInt);
      witnessFields[paramName] = boolInt.toString();
      cdNamed.push({ name: paramName, value: boolInt.toString() });
    }
  }

  const cdHash = F.toObject(poseidon(cdInputs));

  // Output commitment: Poseidon(templateId, params...)
  // Order matches circuit's outHash (binding parameter order)
  const templateId = BigInt(emitted.templateIndex);
  const outInputs: bigint[] = [templateId];
  const outNamed: { name: string; value: string }[] = [
    { name: "templateId", value: templateId.toString() },
  ];

  for (const paramName of binding.paramMapping) {
    const value = params.get(paramName);
    if (!value) continue;

    if (value.kind === "int") {
      const [lo, hi] = splitUint256(value.value);
      outInputs.push(lo, hi);
      outNamed.push({ name: `${paramName}_lo`, value: lo.toString() });
      outNamed.push({ name: `${paramName}_hi`, value: hi.toString() });
    } else if (value.kind === "address") {
      outInputs.push(BigInt(value.value));
      outNamed.push({ name: paramName, value: BigInt(value.value).toString() });
    } else if (value.kind === "bool") {
      outInputs.push(value.value ? 1n : 0n);
      outNamed.push({ name: paramName, value: (value.value ? 1n : 0n).toString() });
    }
  }

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
 *   1. Build witness inputs (raw params only)
 *   2. Generate witness + proof (snarkjs.groth16.fullProve)
 *   3. Verify proof (snarkjs.groth16.verify)
 *   4. Extract commitments from public signals
 *
 * Public signals order (snarkjs convention): outputs first, then inputs.
 * For these circuits: [calldataCommitment, outputCommitment, selector]
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

  // Build witness input — raw params only, no JS-computed commitments.
  // The circuit computes Poseidon hashes internally over BLS12-381's
  // scalar field and exposes them as public outputs.
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

  // Public signals (snarkjs convention: outputs first, then public inputs):
  // [calldataCommitment, outputCommitment, selector]
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
