/**
 * Preset Transaction Example
 *
 * The demo uses a single USDC approve transaction to demonstrate
 * the full clear signing pipeline including proof generation.
 */

import { encodeCalldata } from "./decoder";

export type Example = {
  /** Display label */
  label: string;
  /** Short description */
  description: string;
  /** Target contract address */
  contractAddress: string;
  /** Full calldata (selector + encoded params) */
  calldata: string;
};

// ─── USDC Approve ──────────────────────────────────────────────────────────

const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const UNISWAP_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

/**
 * USDC approve: approve Uniswap V2 Router to spend unlimited USDC
 *
 * approve(address spender, uint256 amount)
 * selector: 0x095ea7b3
 * spender: Uniswap V2 Router
 * amount: MAX_UINT256 (unlimited approval)
 */
export const DEMO_EXAMPLE: Example = {
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
