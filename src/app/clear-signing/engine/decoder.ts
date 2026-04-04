/**
 * ABI Calldata Decoder
 *
 * Decodes raw EVM calldata into typed parameter values using ABI definitions
 * from the intent spec bindings.
 *
 * Calldata layout (Solidity ABI encoding):
 *   [4 bytes selector][32 bytes per static param]...[dynamic data]
 *
 * Static types (encoded inline):
 *   - uint256:  32 bytes, big-endian
 *   - address:  32 bytes, left-padded with zeros (last 20 bytes are the address)
 *   - bool:     32 bytes, 0 or 1
 *
 * Dynamic types (encoded via offset):
 *   - address[]: 32-byte offset → [32-byte length][32 bytes per element]
 *
 * @see https://docs.soliditylang.org/en/latest/abi-spec.html
 */

import type { Value, ParamType, IntentFn } from "./types";

/**
 * Extract the 4-byte function selector from calldata.
 *
 * @param calldata - Full calldata hex string (with or without 0x prefix)
 * @returns Lowercase selector (e.g. "0xa9059cbb")
 */
export function extractSelector(calldata: string): string {
  const hex = calldata.startsWith("0x") ? calldata.slice(2) : calldata;
  return "0x" + hex.slice(0, 8).toLowerCase();
}

/**
 * Read a 32-byte word from calldata at a given byte offset.
 *
 * @param hex - Calldata without 0x prefix, starting after the selector
 * @param wordIndex - 0-based word index (each word is 32 bytes = 64 hex chars)
 * @returns The 32-byte word as a hex string (64 chars, no prefix)
 */
function readWord(hex: string, wordIndex: number): string {
  const start = wordIndex * 64;
  return hex.slice(start, start + 64);
}

/**
 * Decode a uint256 from a 32-byte word.
 */
function decodeUint256(word: string): bigint {
  return BigInt("0x" + word);
}

/**
 * Decode an address from a 32-byte word (last 20 bytes).
 */
function decodeAddress(word: string): string {
  // Address is the rightmost 20 bytes (40 hex chars)
  return "0x" + word.slice(24);
}

/**
 * Decode a bool from a 32-byte word.
 */
function decodeBool(word: string): boolean {
  return BigInt("0x" + word) !== 0n;
}

/**
 * Decode a dynamic address[] array from calldata.
 *
 * Layout at the offset position:
 *   [32 bytes: array length N][32 bytes × N: elements]
 *
 * @param hex - Full params hex (after selector)
 * @param offsetWord - The word containing the byte offset to the array data
 */
function decodeAddressArray(hex: string, offsetWord: string): Value {
  // The offset is in bytes from the start of the params section
  const offset = Number(decodeUint256(offsetWord));
  const dataStart = (offset / 32); // Convert byte offset to word index
  const length = Number(decodeUint256(readWord(hex, dataStart)));

  const items: Value[] = [];
  for (let i = 0; i < length; i++) {
    const addr = decodeAddress(readWord(hex, dataStart + 1 + i));
    items.push({ kind: "address", value: addr });
  }

  return { kind: "list", items };
}

/**
 * Decode a single parameter value from calldata.
 *
 * @param hex - Params hex (after selector)
 * @param wordIndex - Current word index for this parameter
 * @param type - ABI type of the parameter
 * @returns Decoded Value
 */
function decodeParam(
  hex: string,
  wordIndex: number,
  type: ParamType
): Value {
  const word = readWord(hex, wordIndex);

  switch (type) {
    case "uint256":
    case "uint24":
    case "uint160":
      return { kind: "int", value: decodeUint256(word) };
    case "address":
      return { kind: "address", value: decodeAddress(word) };
    case "bool":
      return { kind: "bool", value: decodeBool(word) };
    case "address[]":
      return decodeAddressArray(hex, word);
    case "bytes":
      // For simplicity, return raw hex as address-like value
      return { kind: "address", value: "0x" + word };
  }
}

/**
 * Decode all parameters from calldata according to a function's ABI.
 *
 * @param calldata - Full calldata hex string (with 0x prefix)
 * @param intentFn - The intent function definition (provides param types)
 * @param paramMapping - Maps ABI parameter positions to intent param names
 * @returns Map of param name → decoded Value
 */
export function decodeCalldata(
  calldata: string,
  intentFn: IntentFn,
  paramMapping: string[]
): Map<string, Value> {
  const hex = calldata.startsWith("0x") ? calldata.slice(2) : calldata;
  // Skip the 4-byte selector (8 hex chars)
  const paramsHex = hex.slice(8);

  const result = new Map<string, Value>();

  for (let i = 0; i < paramMapping.length; i++) {
    const paramName = paramMapping[i];
    // Find the param type from the intent function definition
    const paramDef = intentFn.params.find((p) => p.name === paramName);
    if (!paramDef) continue;

    const value = decodeParam(paramsHex, i, paramDef.type);
    result.set(paramName, value);
  }

  return result;
}

/**
 * Encode a sample calldata from typed values (for generating examples).
 *
 * @param selector - 4-byte selector hex (e.g. "0xa9059cbb")
 * @param params - Array of (type, value) pairs
 * @returns Full calldata hex string with 0x prefix
 */
export function encodeCalldata(
  selector: string,
  params: { type: ParamType; value: Value }[]
): string {
  const sel = selector.startsWith("0x") ? selector.slice(2) : selector;
  let staticParts: string[] = [];
  let dynamicParts: string[] = [];
  // Track dynamic data offset (starts after all static words)
  let dynamicOffset = params.length * 32;

  for (const { type, value } of params) {
    switch (type) {
      case "uint256":
      case "uint24":
      case "uint160": {
        const v = value.kind === "int" ? value.value : 0n;
        staticParts.push(v.toString(16).padStart(64, "0"));
        break;
      }
      case "address": {
        const addr = value.kind === "address" ? value.value : "0x0";
        const clean = addr.startsWith("0x") ? addr.slice(2) : addr;
        staticParts.push(clean.padStart(64, "0"));
        break;
      }
      case "bool": {
        const b = value.kind === "bool" ? value.value : false;
        staticParts.push((b ? "1" : "0").padStart(64, "0"));
        break;
      }
      case "address[]": {
        // Encode offset to dynamic data
        staticParts.push(dynamicOffset.toString(16).padStart(64, "0"));
        // Encode the array itself
        const items = value.kind === "list" ? value.items : [];
        // Length
        dynamicParts.push(items.length.toString(16).padStart(64, "0"));
        // Elements
        for (const item of items) {
          const addr = item.kind === "address" ? item.value : "0x0";
          const clean = addr.startsWith("0x") ? addr.slice(2) : addr;
          dynamicParts.push(clean.padStart(64, "0"));
        }
        dynamicOffset += (1 + items.length) * 32;
        break;
      }
      case "bytes": {
        staticParts.push("0".padStart(64, "0"));
        break;
      }
    }
  }

  return "0x" + sel + staticParts.join("") + dynamicParts.join("");
}
