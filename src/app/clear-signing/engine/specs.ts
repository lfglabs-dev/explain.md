/**
 * Hardcoded Intent Specifications
 *
 * These specs define how transaction calldata is interpreted as
 * human-readable intent for supported contracts.
 *
 * Each spec mirrors the Lean DSL defined in verity/Contracts/<name>/Display.lean.
 * For example, the USDC spec corresponds to:
 *
 *   intent_spec "ERC20" where
 *     const MAX_UINT256 := (2^256 - 1)
 *     predicate isMaxUint(v : uint256) := v == MAX_UINT256
 *     intent transfer(to : address, amount : uint256) where
 *       when isMaxUint(amount) =>
 *         emit "Send all USDC to {to:address}"
 *       otherwise =>
 *         emit "Send {amount:tokenAmount 6 "USDC"} to {to:address}"
 *
 * @see verity/Contracts/ERC20/Display.lean
 */

import type { IntentSpec } from "./types";

const MAX_UINT256 = 2n ** 256n - 1n;

// ─── USDC (ERC-20) ──────────────────────────────────────────────────────────

/**
 * USDC intent spec — maps ERC-20 function calls to clear-signed intent.
 *
 * Supported functions:
 *   - transfer(address to, uint256 amount)
 *   - approve(address spender, uint256 amount)
 *
 * The spec handles the MAX_UINT256 edge case:
 *   - amount == MAX → "all tokens" (infinite approval / full balance)
 *   - otherwise → formatted token amount with 6 decimals
 */
export const USDC_SPEC: IntentSpec = {
  contractName: "USDC",
  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  constants: { MAX_UINT256 },
  fns: [
    // ── transfer ──
    // Lean: intent transfer(to : address, amount : uint256) where ...
    {
      name: "transfer",
      params: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      body: [
        {
          kind: "when",
          condition: {
            kind: "eq",
            left: { kind: "param", name: "amount" },
            right: { kind: "const", value: MAX_UINT256 },
          },
          // when isMaxUint(amount) => emit "Send all USDC to {to:address}"
          then: [
            {
              kind: "emit",
              template: {
                text: "Send all USDC to {to}",
                holes: [{ name: "to", format: { kind: "address" } }],
              },
            },
          ],
          // otherwise => emit "Send {amount:tokenAmount 6} to {to:address}"
          otherwise: [
            {
              kind: "emit",
              template: {
                text: "Send {amount} to {to}",
                holes: [
                  {
                    name: "amount",
                    format: { kind: "tokenAmount", decimals: 6, symbol: "USDC" },
                  },
                  { name: "to", format: { kind: "address" } },
                ],
              },
            },
          ],
        },
      ],
    },

    // ── approve ──
    // Lean: intent approve(spender : address, amount : uint256) where ...
    {
      name: "approve",
      params: [
        { name: "spender", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      body: [
        {
          kind: "when",
          condition: {
            kind: "eq",
            left: { kind: "param", name: "amount" },
            right: { kind: "const", value: MAX_UINT256 },
          },
          then: [
            {
              kind: "emit",
              template: {
                text: "Approve {spender} to spend unlimited USDC",
                holes: [{ name: "spender", format: { kind: "address" } }],
              },
            },
          ],
          otherwise: [
            {
              kind: "emit",
              template: {
                text: "Approve {spender} to spend {amount}",
                holes: [
                  { name: "spender", format: { kind: "address" } },
                  {
                    name: "amount",
                    format: { kind: "tokenAmount", decimals: 6, symbol: "USDC" },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  ],
  bindings: [
    {
      selector: "0xa9059cbb",
      abiSignature: "transfer(address,uint256)",
      intentFnName: "transfer",
      paramMapping: ["to", "amount"],
    },
    {
      selector: "0x095ea7b3",
      abiSignature: "approve(address,uint256)",
      intentFnName: "approve",
      paramMapping: ["spender", "amount"],
    },
  ],
};

// ─── Uniswap V2 Router ──────────────────────────────────────────────────────

/**
 * Uniswap V2 Router intent spec — maps swap calls to clear-signed intent.
 *
 * Supported functions:
 *   - swapExactTokensForTokens(uint256, uint256, address[], address, uint256)
 *   - swapExactETHForTokens(uint256, address[], address, uint256)
 *
 * The spec uses array indexing (Phase 2 DSL feature) to extract
 * the input and output tokens from the swap path.
 *
 * Pseudo-Lean (not yet in Verity, but follows the same DSL pattern):
 *
 *   intent_spec "UniswapV2Router" where
 *     intent swapExactTokensForTokens(
 *       amountIn : uint256, amountOutMin : uint256,
 *       path : address[], to : address, deadline : uint256
 *     ) where
 *       emit "Swap {amountIn:raw} of {path[0]:address}
 *             for at least {amountOutMin:raw} of {path[last]:address},
 *             send to {to:address}"
 */
export const UNISWAP_V2_SPEC: IntentSpec = {
  contractName: "Uniswap V2 Router",
  address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  constants: {},
  fns: [
    // ── swapExactTokensForTokens ──
    {
      name: "swapExactTokensForTokens",
      params: [
        { name: "amountIn", type: "uint256" },
        { name: "amountOutMin", type: "uint256" },
        { name: "path", type: "address[]" },
        { name: "to", type: "address" },
        { name: "deadline", type: "uint256" },
      ],
      body: [
        {
          kind: "emit",
          template: {
            text: "Swap {amountIn} of {tokenIn} for at least {amountOutMin} of {tokenOut}, send to {to}",
            holes: [
              { name: "amountIn", format: { kind: "raw" } },
              { name: "tokenIn", format: { kind: "address" } },
              { name: "amountOutMin", format: { kind: "raw" } },
              { name: "tokenOut", format: { kind: "address" } },
              { name: "to", format: { kind: "address" } },
            ],
          },
        },
      ],
    },

    // ── swapExactETHForTokens ──
    {
      name: "swapExactETHForTokens",
      params: [
        { name: "amountOutMin", type: "uint256" },
        { name: "path", type: "address[]" },
        { name: "to", type: "address" },
        { name: "deadline", type: "uint256" },
      ],
      body: [
        {
          kind: "emit",
          template: {
            text: "Swap ETH for at least {amountOutMin} of {tokenOut}, send to {to}",
            holes: [
              { name: "amountOutMin", format: { kind: "raw" } },
              { name: "tokenOut", format: { kind: "address" } },
              { name: "to", format: { kind: "address" } },
            ],
          },
        },
      ],
    },
  ],
  bindings: [
    {
      selector: "0x38ed1739",
      abiSignature:
        "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
      intentFnName: "swapExactTokensForTokens",
      paramMapping: ["amountIn", "amountOutMin", "path", "to", "deadline"],
    },
    {
      selector: "0x7ff36ab5",
      abiSignature:
        "swapExactETHForTokens(uint256,address[],address,uint256)",
      intentFnName: "swapExactETHForTokens",
      paramMapping: ["amountOutMin", "path", "to", "deadline"],
    },
  ],
};

// ─── Spec Registry ──────────────────────────────────────────────────────────

/** All supported specs, keyed by lowercase contract address. */
export const SPECS: Record<string, IntentSpec> = {
  [USDC_SPEC.address.toLowerCase()]: USDC_SPEC,
  [UNISWAP_V2_SPEC.address.toLowerCase()]: UNISWAP_V2_SPEC,
};

/** Find a spec by contract address (case-insensitive). */
export function findSpec(contractAddress: string): IntentSpec | null {
  return SPECS[contractAddress.toLowerCase()] ?? null;
}
