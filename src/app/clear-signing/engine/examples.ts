/**
 * Preset Transaction Examples
 *
 * Each example represents a real-world transaction that can be
 * interpreted by the clear signing engine.
 *
 * The calldata is pre-encoded following Solidity ABI encoding rules.
 * Users can also enter custom calldata in the UI.
 */

import { encodeCalldata } from "./decoder";

export type Example = {
  /** Display label for the button */
  label: string;
  /** Short description */
  description: string;
  /** Target contract address */
  contractAddress: string;
  /** Full calldata (selector + encoded params) */
  calldata: string;
};

// ─── USDC Examples ──────────────────────────────────────────────────────────

const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const UNISWAP_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

/**
 * USDC transfer: send 1,000 USDC to vitalik.eth
 *
 * transfer(address to, uint256 amount)
 * selector: 0xa9059cbb
 * to: 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
 * amount: 1000 × 10^6 = 1,000,000,000 (1000 USDC)
 */
const usdcTransfer: Example = {
  label: "USDC Transfer",
  description: "Send 1,000 USDC to vitalik.eth",
  contractAddress: USDC_ADDRESS,
  calldata: encodeCalldata("0xa9059cbb", [
    {
      type: "address",
      value: { kind: "address", value: VITALIK },
    },
    {
      type: "uint256",
      value: { kind: "int", value: 1_000_000_000n }, // 1000 USDC (6 decimals)
    },
  ]),
};

/**
 * USDC approve: approve Uniswap V2 Router to spend unlimited USDC
 *
 * approve(address spender, uint256 amount)
 * selector: 0x095ea7b3
 * spender: Uniswap V2 Router
 * amount: MAX_UINT256 (unlimited approval)
 */
const usdcApprove: Example = {
  label: "USDC Approve",
  description: "Approve Uniswap to spend unlimited USDC",
  contractAddress: USDC_ADDRESS,
  calldata: encodeCalldata("0x095ea7b3", [
    {
      type: "address",
      value: { kind: "address", value: UNISWAP_ROUTER },
    },
    {
      type: "uint256",
      value: { kind: "int", value: 2n ** 256n - 1n }, // MAX_UINT256
    },
  ]),
};

// ─── Uniswap Examples ───────────────────────────────────────────────────────

const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

/**
 * Uniswap V2: swap 1 WETH for at least 2,000 USDC
 *
 * swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin,
 *   address[] path, address to, uint256 deadline)
 * selector: 0x38ed1739
 * amountIn: 1 × 10^18 = 1,000,000,000,000,000,000 (1 WETH)
 * amountOutMin: 2000 × 10^6 = 2,000,000,000 (2000 USDC)
 * path: [WETH, USDC]
 * to: vitalik.eth
 * deadline: 1735689600 (2025-01-01)
 */
const uniswapSwap: Example = {
  label: "Uniswap Swap",
  description: "Swap 1 WETH for at least 2,000 USDC",
  contractAddress: UNISWAP_ROUTER,
  calldata: encodeCalldata("0x38ed1739", [
    {
      type: "uint256",
      value: { kind: "int", value: 1_000_000_000_000_000_000n }, // 1 WETH
    },
    {
      type: "uint256",
      value: { kind: "int", value: 2_000_000_000n }, // 2000 USDC
    },
    {
      type: "address[]",
      value: {
        kind: "list",
        items: [
          { kind: "address", value: WETH },
          { kind: "address", value: USDC_ADDRESS },
        ],
      },
    },
    {
      type: "address",
      value: { kind: "address", value: VITALIK },
    },
    {
      type: "uint256",
      value: { kind: "int", value: 1735689600n },
    },
  ]),
};

// ─── Export ──────────────────────────────────────────────────────────────────

export const EXAMPLES: Example[] = [
  usdcTransfer,
  usdcApprove,
  uniswapSwap,
];
