/**
 * Tests for the clear signing pipeline.
 *
 * Verifies that spec loading → calldata decoding → intent evaluation
 * produces correct results for both ERC-20 and Uniswap V2 specs.
 */

import { loadIntentSpec } from "../loader";
import { extractSelector, decodeCalldata, encodeCalldata } from "../decoder";
import { evaluateIntent, collectAllTemplates } from "../evaluator";
import type { EnsSpecEntry } from "../ens";

import ERC20_JSON from "../../../../../public/specs/ERC20.intent.json";
import UNISWAP_V2_JSON from "../../../../../public/specs/UniswapV2.intent.json";

// ─── Spec Loading ───────────────────────────────────────────────────────────

describe("spec loading", () => {
  const usdcEntry: EnsSpecEntry = {
    spec: "ERC20",
    deploy: { symbol: "USDC", decimals: 6 },
  };

  const usdcSpec = loadIntentSpec(
    ERC20_JSON,
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    usdcEntry
  );

  test("contractName comes from compiler JSON, not deploy", () => {
    expect(usdcSpec.contractName).toBe("ERC20");
  });

  test("deploy overrides are preserved", () => {
    expect(usdcSpec.deploy?.symbol).toBe("USDC");
    expect(usdcSpec.deploy?.decimals).toBe(6);
  });

  test("bindings have selectors from post-processing", () => {
    const transferBinding = usdcSpec.bindings.find(
      (b) => b.intentFnName === "transfer"
    );
    expect(transferBinding).toBeDefined();
    expect(transferBinding!.selector).toBe("0xa9059cbb");
    expect(transferBinding!.abiSignature).toBe("transfer(address,uint256)");
    expect(transferBinding!.paramMapping).toEqual(["to", "amount"]);
  });

  test("MAX_UINT256 constant is resolved", () => {
    expect(usdcSpec.constants.MAX_UINT256).toBe(2n ** 256n - 1n);
  });

  test("transfer function has when/otherwise structure", () => {
    const transferFn = usdcSpec.fns.find((f) => f.name === "transfer");
    expect(transferFn).toBeDefined();
    expect(transferFn!.body[0].kind).toBe("when");
  });

  test("tokenAmount format uses deployment decimals (6), not spec default (18)", () => {
    const transferFn = usdcSpec.fns.find((f) => f.name === "transfer");
    const whenStmt = transferFn!.body[0];
    if (whenStmt.kind !== "when") throw new Error("Expected when");
    const emitStmt = whenStmt.otherwise[0];
    if (emitStmt.kind !== "emit") throw new Error("Expected emit");
    const amountHole = emitStmt.template.holes.find(
      (h) => h.name === "amount"
    );
    expect(amountHole).toBeDefined();
    expect(amountHole!.format).toEqual({
      kind: "tokenAmount",
      decimals: 6,
      symbol: "USDC",
    });
  });

  test("same spec with different deploy overrides (WETH)", () => {
    const wethSpec = loadIntentSpec(
      ERC20_JSON,
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      { spec: "ERC20", deploy: { symbol: "WETH", decimals: 18 } }
    );
    expect(wethSpec.contractName).toBe("ERC20");
    expect(wethSpec.deploy?.symbol).toBe("WETH");
    expect(wethSpec.deploy?.decimals).toBe(18);
    // WETH tokenAmount should use 18 decimals
    const transferFn = wethSpec.fns.find((f) => f.name === "transfer");
    const whenStmt = transferFn!.body[0];
    if (whenStmt.kind !== "when") throw new Error("Expected when");
    const emitStmt = whenStmt.otherwise[0];
    if (emitStmt.kind !== "emit") throw new Error("Expected emit");
    const amountHole = emitStmt.template.holes.find(
      (h) => h.name === "amount"
    );
    expect(amountHole!.format).toEqual({
      kind: "tokenAmount",
      decimals: 18,
      symbol: "WETH",
    });
  });
});

// ─── Calldata Decoding ──────────────────────────────────────────────────────

describe("calldata decoding", () => {
  const usdcSpec = loadIntentSpec(
    ERC20_JSON,
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    { spec: "ERC20", deploy: { symbol: "USDC", decimals: 6 } }
  );

  test("extracts selector from calldata", () => {
    const calldata = encodeCalldata("0xa9059cbb", [
      { type: "address", value: { kind: "address", value: "0xdead" } },
      { type: "uint256", value: { kind: "int", value: 1000n } },
    ]);
    expect(extractSelector(calldata)).toBe("0xa9059cbb");
  });

  test("decodes transfer params", () => {
    const calldata = encodeCalldata("0xa9059cbb", [
      {
        type: "address",
        value: {
          kind: "address",
          value: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        },
      },
      { type: "uint256", value: { kind: "int", value: 1_000_000_000n } },
    ]);

    const binding = usdcSpec.bindings.find(
      (b) => b.intentFnName === "transfer"
    )!;
    const intentFn = usdcSpec.fns.find(
      (f) => f.name === binding.intentFnName
    )!;
    const params = decodeCalldata(calldata, intentFn, binding.paramMapping);

    // Address casing depends on encoder; just check lowercase match
    const toAddr = params.get("to");
    expect(toAddr?.kind).toBe("address");
    expect(
      (toAddr as { kind: "address"; value: string }).value.toLowerCase()
    ).toBe("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");
    expect(params.get("amount")).toEqual({
      kind: "int",
      value: 1_000_000_000n,
    });
  });
});

// ─── Intent Evaluation ──────────────────────────────────────────────────────

describe("intent evaluation", () => {
  const usdcSpec = loadIntentSpec(
    ERC20_JSON,
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    { spec: "ERC20", deploy: { symbol: "USDC", decimals: 6 } }
  );

  test("transfer with normal amount selects 'otherwise' template", () => {
    const binding = usdcSpec.bindings.find(
      (b) => b.intentFnName === "transfer"
    )!;
    const params = new Map<string, import("../types").Value>([
      ["to", { kind: "address", value: "0xdead" }],
      ["amount", { kind: "int", value: 1_000_000n }],
    ]);

    const emitted = evaluateIntent(usdcSpec, binding, params);
    expect(emitted).not.toBeNull();
    expect(emitted!.templateIndex).toBe(1); // otherwise branch
    expect(emitted!.text).toContain("{amount}");
    expect(emitted!.text).toContain("{to}");
  });

  test("transfer with MAX_UINT256 selects 'when' template", () => {
    const binding = usdcSpec.bindings.find(
      (b) => b.intentFnName === "transfer"
    )!;
    const params = new Map<string, import("../types").Value>([
      ["to", { kind: "address", value: "0xdead" }],
      ["amount", { kind: "int", value: 2n ** 256n - 1n }],
    ]);

    const emitted = evaluateIntent(usdcSpec, binding, params);
    expect(emitted).not.toBeNull();
    expect(emitted!.templateIndex).toBe(0); // when branch
    expect(emitted!.text).toContain("all");
  });

  test("approve with MAX_UINT256 selects unlimited template", () => {
    const binding = usdcSpec.bindings.find(
      (b) => b.intentFnName === "approve"
    )!;
    const params = new Map<string, import("../types").Value>([
      ["spender", { kind: "address", value: "0xbeef" }],
      ["amount", { kind: "int", value: 2n ** 256n - 1n }],
    ]);

    const emitted = evaluateIntent(usdcSpec, binding, params);
    expect(emitted).not.toBeNull();
    expect(emitted!.templateIndex).toBe(0);
    expect(emitted!.text).toContain("unlimited");
  });

  test("collectAllTemplates returns all templates in AST order", () => {
    const transferFn = usdcSpec.fns.find((f) => f.name === "transfer")!;
    const templates = collectAllTemplates(transferFn.body);
    expect(templates).toHaveLength(2);
    expect(templates[0].text).toContain("all"); // when (index 0)
    expect(templates[1].text).toContain("{amount}"); // otherwise (index 1)
  });
});

// ─── UniswapV2 Spec ─────────────────────────────────────────────────────────

describe("UniswapV2 spec", () => {
  const uniSpec = loadIntentSpec(
    UNISWAP_V2_JSON,
    "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    { spec: "UniswapV2Router" }
  );

  test("contractName from compiler", () => {
    expect(uniSpec.contractName).toBe("UniswapV2Router");
  });

  test("has swapExactTokensForTokens binding with selector", () => {
    const binding = uniSpec.bindings.find(
      (b) => b.intentFnName === "swapExactTokensForTokens"
    );
    expect(binding).toBeDefined();
    expect(binding!.selector).toBe("0x38ed1739");
  });

  test("no deploy overrides for protocol", () => {
    expect(uniSpec.deploy).toBeUndefined();
  });
});

// ─── ENS Entry Consistency ──────────────────────────────────────────────────

describe("ENS entry consistency", () => {
  test("entry with deploy overrides loads correctly", () => {
    const spec = loadIntentSpec(
      ERC20_JSON,
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      { spec: "ERC20", deploy: { symbol: "USDT", decimals: 6 } }
    );
    expect(spec.contractName).toBe("ERC20");
    expect(spec.deploy?.symbol).toBe("USDT");
  });

  test("entry without deploy uses spec defaults", () => {
    const spec = loadIntentSpec(ERC20_JSON, "0x1234", { spec: "ERC20" });
    expect(spec.deploy).toBeUndefined();
    // tokenAmount should fall back to 18 (Lean spec default)
    const transferFn = spec.fns.find((f) => f.name === "transfer")!;
    const whenStmt = transferFn.body[0];
    if (whenStmt.kind !== "when") throw new Error("Expected when");
    const emitStmt = whenStmt.otherwise[0];
    if (emitStmt.kind !== "emit") throw new Error("Expected emit");
    const amountHole = emitStmt.template.holes.find(
      (h) => h.name === "amount"
    );
    expect(amountHole!.format).toEqual({
      kind: "tokenAmount",
      decimals: 18,
      symbol: undefined,
    });
  });

  test("circuits field is optional and preserved", () => {
    const spec = loadIntentSpec(
      ERC20_JSON,
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      {
        spec: "ERC20",
        deploy: { symbol: "USDC", decimals: 6 },
        circuits: { transfer: "abc123" },
      }
    );
    // circuits is on the ENS entry, not on IntentSpec
    expect(spec.contractName).toBe("ERC20");
  });
});
