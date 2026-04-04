/**
 * Intent Specification Registry
 *
 * Specs are resolved from two sources:
 * 1. ENS registry (veryclear.eth) — on-chain source of truth
 * 2. Static fallback — bundled compiler output for offline use
 *
 * ENS records map contract addresses to:
 *   { spec: "ERC20", deploy: { symbol: "USDC", decimals: 6 }, circuits: {...} }
 *
 * The spec name points to a compiler-generated JSON in /public/specs/.
 */

import type { IntentSpec } from "./types";
import { loadIntentSpec } from "./loader";
import { readSpecFromEns, type EnsSpecEntry } from "./ens";
import ERC20_INTENT_JSON from "../../../../public/specs/ERC20.intent.json";
import UNISWAP_V2_INTENT_JSON from "../../../../public/specs/UniswapV2.intent.json";

// ─── Spec JSON index (keyed by spec name from ENS) ──────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const SPEC_JSONS: Record<string, any> = {
  ERC20: ERC20_INTENT_JSON,
  UniswapV2Router: UNISWAP_V2_INTENT_JSON,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Static fallback registry ───────────────────────────────────────────────

const STATIC_SPECS: Record<string, IntentSpec> = {};

function registerStatic(address: string, entry: EnsSpecEntry) {
  const json = SPEC_JSONS[entry.spec];
  if (!json) return;
  STATIC_SPECS[address.toLowerCase()] = loadIntentSpec(json, address, entry);
}

registerStatic("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", {
  spec: "ERC20",
  deploy: { symbol: "USDC", decimals: 6 },
});
registerStatic("0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", {
  spec: "UniswapV2Router",
});
registerStatic("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", {
  spec: "ERC20",
  deploy: { symbol: "WETH", decimals: 18 },
});

export const SPECS = STATIC_SPECS;

// ─── ENS-aware lookup ───────────────────────────────────────────────────────

/**
 * Find a spec by contract address.
 * Tries ENS first (veryclear.eth), falls back to static registry.
 */
export async function findSpecFromEns(
  contractAddress: string
): Promise<IntentSpec | null> {
  const ensEntry = await readSpecFromEns(contractAddress);
  if (ensEntry) {
    const json = SPEC_JSONS[ensEntry.spec];
    if (json) {
      return loadIntentSpec(json, contractAddress, ensEntry);
    }
  }
  return STATIC_SPECS[contractAddress.toLowerCase()] ?? null;
}

/** Synchronous fallback (for non-async contexts). */
export function findSpec(contractAddress: string): IntentSpec | null {
  return STATIC_SPECS[contractAddress.toLowerCase()] ?? null;
}
