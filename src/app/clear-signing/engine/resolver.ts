/**
 * Address Resolver
 *
 * Resolves Ethereum addresses to human-readable names using the spec registry.
 *
 * Every known address must have a spec entry — there is no separate address
 * registry. This ensures that address metadata is always co-located with
 * the intent specification for that contract.
 *
 * The flow:
 *   Template: "Swap ETH for 0xA0b8..."
 *   Query → 0xA0b8... → Spec "USDC" exists
 *   Display: "Swap ETH for USDC"
 *
 *   Template: "Send USDC to 0xd8dA..."
 *   Query → 0xd8dA... → Spec "vitalik.eth" exists
 *   Display: "Send USDC to vitalik.eth"
 */

import type { ResolvedAddress } from "./types";
import { SPECS } from "./specs";

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Resolve an address to its known identity using the spec registry.
 *
 * @param address - Ethereum address (any case)
 * @returns The resolved address info, or null if no spec exists for this address
 */
export function resolveAddress(address: string): ResolvedAddress | null {
  const spec = SPECS[address.toLowerCase()];
  if (!spec) return null;
  return {
    address: spec.address,
    name: spec.contractName,
    type: spec.type,
    decimals: spec.decimals,
    symbol: spec.symbol,
  };
}

/**
 * Simulate async address resolution with a delay.
 *
 * In production, this would query on-chain spec registries.
 * For the demo, we add an artificial delay to show the progressive
 * resolution animation.
 *
 * @param address - Ethereum address to resolve
 * @param delayMs - Artificial delay in milliseconds
 * @returns Promise resolving to the address info or null
 */
export async function resolveAddressAsync(
  address: string,
  delayMs: number = 600
): Promise<ResolvedAddress | null> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return resolveAddress(address);
}

/**
 * Format an address for display.
 *
 * If the address has a spec, returns the contract name.
 * Otherwise, returns a truncated address (0xAbCd...1234).
 *
 * @param address - Raw Ethereum address
 * @param resolved - Optional pre-resolved identity
 */
export function formatAddress(
  address: string,
  resolved?: ResolvedAddress | null
): string {
  const known = resolved ?? resolveAddress(address);
  if (known) return known.name;

  // Truncate: 0xAbCd...1234
  const clean = address.startsWith("0x") ? address : "0x" + address;
  if (clean.length <= 14) return clean;
  return clean.slice(0, 6) + "..." + clean.slice(-4);
}

/**
 * Format a token amount with decimals.
 *
 * @param raw - Raw token amount as bigint
 * @param decimals - Number of decimal places
 * @param symbol - Optional token symbol to append
 * @returns Formatted string (e.g. "1,000.50 USDC")
 */
export function formatTokenAmount(
  raw: bigint,
  decimals: number,
  symbol?: string
): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;

  // Format with decimal places (trim trailing zeros, keep at least 2)
  const remainderStr = remainder.toString().padStart(decimals, "0");
  const trimmed = remainderStr.replace(/0+$/, "") || "0";
  const decimalPart = trimmed.length < 2 ? trimmed.padEnd(2, "0") : trimmed;

  // Add thousand separators to whole part
  const wholeStr = whole.toLocaleString("en-US");

  const amount =
    remainder === 0n ? wholeStr : `${wholeStr}.${decimalPart}`;

  return symbol ? `${amount} ${symbol}` : amount;
}
