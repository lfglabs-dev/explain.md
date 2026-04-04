/**
 * Address Resolver
 *
 * Progressively resolves Ethereum addresses to human-readable names.
 *
 * This simulates the "registry query" step in clear signing:
 *   1. The intent evaluator produces a template with raw addresses
 *   2. The resolver queries known registries for each address
 *   3. Addresses are progressively replaced with names as they resolve
 *
 * In production, this would query on-chain registries (ENS, token lists)
 * or the Verity spec metadata. For this demo, we use a hardcoded registry
 * of well-known Ethereum mainnet addresses.
 *
 * The flow described in the spec:
 *   Template: "Swap ETH for 0xA0b8..."
 *   Query → 0xA0b8... → Spec says "USDC"
 *   Display: "Swap ETH for USDC"
 *
 *   Template: "Send USDC to 0xd8dA..."
 *   Query → 0xd8dA... → Unknown
 *   Display: "Send USDC to 0xd8dA..."
 */

import type { KnownAddress } from "./types";

// ─── Known Address Registry ─────────────────────────────────────────────────

/**
 * Well-known Ethereum mainnet addresses.
 *
 * In production, these would come from:
 *   - Token lists (Uniswap, CoinGecko)
 *   - ENS reverse resolution
 *   - Verity spec metadata (contract names)
 *   - ERC-7730 clear signing registries
 */
const KNOWN_ADDRESSES: KnownAddress[] = [
  // ── Stablecoins ──
  {
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    name: "USDC",
    type: "token",
    decimals: 6,
    symbol: "USDC",
  },
  {
    address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    name: "USDT",
    type: "token",
    decimals: 6,
    symbol: "USDT",
  },
  {
    address: "0x6b175474e89094c44da98b954eedeac495271d0f",
    name: "DAI",
    type: "token",
    decimals: 18,
    symbol: "DAI",
  },

  // ── Major tokens ──
  {
    address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    name: "WETH",
    type: "token",
    decimals: 18,
    symbol: "WETH",
  },
  {
    address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    name: "WBTC",
    type: "token",
    decimals: 8,
    symbol: "WBTC",
  },
  {
    address: "0x514910771af9ca656af840dff83e8264ecf986ca",
    name: "LINK",
    type: "token",
    decimals: 18,
    symbol: "LINK",
  },
  {
    address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
    name: "UNI",
    type: "token",
    decimals: 18,
    symbol: "UNI",
  },

  // ── Protocols ──
  {
    address: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
    name: "Uniswap V2 Router",
    type: "protocol",
  },
  {
    address: "0xe592427a0aece92de3edee1f18e0157c05861564",
    name: "Uniswap V3 Router",
    type: "protocol",
  },

  // ── Well-known addresses (for demo) ──
  {
    address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
    name: "vitalik.eth",
    type: "ens",
  },
];

/** Index for O(1) lookups by lowercase address. */
const ADDRESS_INDEX = new Map<string, KnownAddress>(
  KNOWN_ADDRESSES.map((a) => [a.address.toLowerCase(), a])
);

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Resolve an address to its known identity.
 *
 * @param address - Ethereum address (any case)
 * @returns The known address entry, or null if unknown
 */
export function resolveAddress(address: string): KnownAddress | null {
  return ADDRESS_INDEX.get(address.toLowerCase()) ?? null;
}

/**
 * Simulate async address resolution with a delay.
 *
 * In production, this would make network calls to ENS, token lists, etc.
 * For the demo, we add an artificial delay to show the progressive
 * resolution animation.
 *
 * @param address - Ethereum address to resolve
 * @param delayMs - Artificial delay in milliseconds
 * @returns Promise resolving to the known address or null
 */
export async function resolveAddressAsync(
  address: string,
  delayMs: number = 600
): Promise<KnownAddress | null> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return resolveAddress(address);
}

/**
 * Format an address for display.
 *
 * If the address is known, returns the human-readable name.
 * Otherwise, returns a truncated address (0xAbCd...1234).
 *
 * @param address - Raw Ethereum address
 * @param resolved - Optional pre-resolved identity
 */
export function formatAddress(
  address: string,
  resolved?: KnownAddress | null
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
