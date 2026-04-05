"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  ENS_NAME,
  connectWallet,
  writeSpecToEns,
  readSpecFromEns,
  type EnsSpecEntry,
} from "../engine/ens";

// ─── Known contracts to display ─────────────────────────────────────────────

const KNOWN_CONTRACTS = [
  { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", label: "USDC" },
  { address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", label: "Uniswap V2 Router" },
  { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", label: "WETH" },
];

/** Presets without circuit hashes — computed at runtime from local vkey files. */
const PRESET_SPECS_BASE: Record<string, Omit<EnsSpecEntry, "circuits">> = {
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": {
    spec: "ERC20",
    deploy: { symbol: "USDC", decimals: 6 },
  },
  "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D": {
    spec: "UniswapV2Router",
  },
  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2": {
    spec: "ERC20",
    deploy: { symbol: "WETH", decimals: 18 },
  },
};

/** Circuit name mapping: specName:functionName → artifact directory name */
const CIRCUIT_MAP: Record<string, string> = {
  "ERC20:transfer": "ERC20_transfer",
  "ERC20:approve": "ERC20_approve",
};

/** Compute SHA-256 of a vkey.json file */
async function hashVkey(circuitDir: string): Promise<string> {
  const resp = await fetch(`/circuits/${circuitDir}/vkey.json`);
  const text = await resp.text();
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Build a full preset with circuit hashes computed from local vkey files. */
async function buildPreset(address: string): Promise<EnsSpecEntry> {
  const base = PRESET_SPECS_BASE[address];
  if (!base) throw new Error(`No preset for ${address}`);

  const circuits: Record<string, string> = {};
  for (const [key, dir] of Object.entries(CIRCUIT_MAP)) {
    const [specName] = key.split(":");
    if (specName === base.spec) {
      const fnName = key.split(":")[1];
      circuits[fnName] = await hashVkey(dir);
    }
  }

  return {
    ...base,
    circuits: Object.keys(circuits).length > 0 ? circuits : undefined,
  };
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Map<string, EnsSpecEntry | null>>(new Map());
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  // Custom entry form
  const [customAddr, setCustomAddr] = useState("");
  const [customSpecName, setCustomSpecName] = useState("ERC20");
  const [customDecimals, setCustomDecimals] = useState("18");
  const [customSymbol, setCustomSymbol] = useState("");

  // ── Connect wallet ──
  const handleConnect = useCallback(async () => {
    try {
      const p = await connectWallet();
      setProvider(p);
      const signer = await p.getSigner();
      setAccount(await signer.getAddress());
      const network = await p.getNetwork();
      setChainId(network.chainId.toString());
    } catch (e) {
      setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  // ── Load current ENS entries ──
  const refreshEntries = useCallback(async () => {
    setLoading(true);
    const map = new Map<string, EnsSpecEntry | null>();
    for (const c of KNOWN_CONTRACTS) {
      const entry = await readSpecFromEns(c.address);
      map.set(c.address.toLowerCase(), entry);
    }
    setEntries(map);
    setLoading(false);
  }, []);

  // Load entries on mount (effect subscribes to external ENS state)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = new Map<string, EnsSpecEntry | null>();
      for (const c of KNOWN_CONTRACTS) {
        const entry = await readSpecFromEns(c.address);
        map.set(c.address.toLowerCase(), entry);
      }
      if (!cancelled) {
        setEntries(map);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Write a preset entry ──
  const handleWritePreset = useCallback(
    async (address: string) => {
      if (!provider) return;

      setTxStatus(`Computing vkey hashes from local circuit artifacts...`);
      try {
        const entry = await buildPreset(address);
        setTxStatus(`Sending setText for ${address.slice(0, 10)}... (circuits: ${Object.keys(entry.circuits ?? {}).join(", ") || "none"})`);
        const txHash = await writeSpecToEns(provider, address, entry);
        setTxStatus(`Confirmed: ${txHash}`);
        await refreshEntries();
      } catch (e) {
        setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [provider, refreshEntries]
  );

  // ── Write custom entry ──
  const handleWriteCustom = useCallback(async () => {
    if (!provider || !customAddr) return;

    const deploy = (customDecimals || customSymbol)
      ? { decimals: customDecimals ? parseInt(customDecimals) : undefined, symbol: customSymbol || undefined }
      : undefined;
    const entry: EnsSpecEntry = {
      spec: customSpecName,
      deploy,
    };

    setTxStatus(`Sending setText for ${customAddr.slice(0, 10)}...`);
    try {
      const txHash = await writeSpecToEns(provider, customAddr, entry);
      setTxStatus(`Confirmed: ${txHash}`);
      await refreshEntries();
    } catch (e) {
      setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [provider, customAddr, customSpecName, customDecimals, customSymbol, refreshEntries]);

  return (
    <main className="font-serif max-w-[680px] mx-auto px-6 py-20 md:py-32">
      <header className="mb-12">
        <h1 className="text-2xl font-semibold tracking-tight">
          Registry Admin
        </h1>
        <p className="mt-2 text-secondary text-[15px]">
          Manage the ENS spec registry at{" "}
          <span className="font-mono text-[13px]">{ENS_NAME}</span>
        </p>
      </header>

      {/* Wallet connection */}
      <section className="mb-12">
        {!account ? (
          <button
            onClick={handleConnect}
            className="px-5 py-2 text-[14px] font-medium bg-foreground text-background rounded hover:bg-foreground/90 transition-colors cursor-pointer"
          >
            Connect wallet
          </button>
        ) : (
          <div className="text-[13px] font-mono space-y-1">
            <div>
              <span className="text-secondary">Account: </span>
              {account.slice(0, 6)}...{account.slice(-4)}
            </div>
            <div>
              <span className="text-secondary">Chain: </span>
              {chainId === "1" ? "Ethereum Mainnet" : `Chain ${chainId}`}
            </div>
          </div>
        )}
      </section>

      {/* Current registry */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold tracking-tight mb-4">
          Current registry
        </h2>
        {loading ? (
          <p className="text-secondary text-[14px]">Loading from ENS...</p>
        ) : (
          <div className="space-y-3">
            {KNOWN_CONTRACTS.map((c) => {
              const entry = entries.get(c.address.toLowerCase());
              return (
                <div
                  key={c.address}
                  className="border border-border rounded px-4 py-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-[14px]">{c.label}</span>
                    {entry ? (
                      <span className="text-emerald-600 text-[12px] font-mono">
                        registered
                      </span>
                    ) : (
                      <span className="text-secondary text-[12px] font-mono">
                        not registered
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[11px] text-secondary mb-2">
                    {c.address}
                  </div>
                  {entry && (
                    <pre className="bg-surface rounded px-3 py-2 text-[11px] font-mono overflow-x-auto mb-2">
                      {JSON.stringify(entry, null, 2)}
                    </pre>
                  )}
                  {account && (
                    <button
                      onClick={() => handleWritePreset(c.address)}
                      className="px-3 py-1.5 text-[12px] font-mono border border-border rounded hover:bg-surface transition-colors cursor-pointer"
                    >
                      {entry ? "Update" : "Register"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <button
          onClick={refreshEntries}
          className="mt-4 px-3 py-1.5 text-[12px] font-mono border border-border rounded hover:bg-surface transition-colors cursor-pointer"
        >
          Refresh
        </button>
      </section>

      {/* Custom entry */}
      {account && (
        <section className="mb-12">
          <h2 className="text-lg font-semibold tracking-tight mb-4">
            Register custom contract
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-[12px] text-secondary mb-1">
                Contract address
              </label>
              <input
                type="text"
                value={customAddr}
                onChange={(e) => setCustomAddr(e.target.value)}
                placeholder="0x..."
                className="w-full font-mono text-[13px] px-3 py-2 border border-border rounded bg-white"
                spellCheck={false}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] text-secondary mb-1">
                  Spec name
                </label>
                <select
                  value={customSpecName}
                  onChange={(e) => setCustomSpecName(e.target.value)}
                  className="w-full text-[13px] px-3 py-2 border border-border rounded bg-white"
                >
                  <option value="ERC20">ERC20</option>
                  <option value="UniswapV2Router">UniswapV2Router</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] text-secondary mb-1">
                  Decimals
                </label>
                <input
                  type="number"
                  value={customDecimals}
                  onChange={(e) => setCustomDecimals(e.target.value)}
                  className="w-full font-mono text-[13px] px-3 py-2 border border-border rounded bg-white"
                />
              </div>
              <div>
                <label className="block text-[12px] text-secondary mb-1">
                  Symbol
                </label>
                <input
                  type="text"
                  value={customSymbol}
                  onChange={(e) => setCustomSymbol(e.target.value)}
                  placeholder="USDC"
                  className="w-full font-mono text-[13px] px-3 py-2 border border-border rounded bg-white"
                />
              </div>
            </div>
            <button
              onClick={handleWriteCustom}
              className="px-5 py-2 text-[14px] font-medium bg-foreground text-background rounded hover:bg-foreground/90 transition-colors cursor-pointer"
            >
              Register
            </button>
          </div>
        </section>
      )}

      {/* Transaction status */}
      {txStatus && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 max-w-[600px] w-full px-6">
          <div className="bg-surface border border-border rounded-lg px-4 py-3 shadow-lg">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[12px] break-all">{txStatus}</p>
              <button
                onClick={() => setTxStatus(null)}
                className="ml-3 text-secondary hover:text-foreground cursor-pointer"
              >
                &times;
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
