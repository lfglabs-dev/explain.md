"use client";

import React from "react";
import {
  Section,
  SectionTitle,
  Disclosure,
  CodeBlock,
  ExternalLink,
} from "../components";
import { Guarantee } from "./guarantee";

function Hypothesis({
  name,
  constraint,
  source,
  children,
  border = true,
}: {
  name: string;
  constraint: string;
  source: string;
  children: React.ReactNode;
  border?: boolean;
}) {
  return (
    <li className={`list-none ${border ? "border-b border-border/50" : ""}`}>
      <details className="group/hyp">
        <summary className="px-5 py-3 cursor-pointer select-none list-none flex items-center gap-3 [&::-webkit-details-marker]:hidden">
          <svg
            viewBox="0 0 24 24"
            className="w-3.5 h-3.5 text-secondary/50 transition-transform group-open/hyp:rotate-90 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
          <code className="font-mono text-[12px] font-medium">{name}</code>
          <span className="text-secondary text-[13px]">{constraint}</span>
        </summary>
        <div className="px-5 pb-3 pl-12 text-[13px] text-secondary leading-relaxed">
          <p className="mb-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-secondary/60">
              {source}
            </span>
          </p>
          <p>{children}</p>
        </div>
      </details>
    </li>
  );
}

const VERIFY_COMMAND = `git clone https://github.com/lfglabs-dev/verity-benchmark
cd verity-benchmark
./scripts/run_default_agent.sh lido/vaulthub_locked/locked_funds_solvency`;

export default function LidoVaultSolvency() {
  return (
    <main className="font-serif max-w-[680px] mx-auto px-6 py-20 md:py-32">
      <header className="mb-6">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight leading-tight">
          Lido V3 Vault Solvency Guarantee
          <span className="relative inline-block ml-2 translate-y-[5px] group cursor-default">
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6 md:w-7 md:h-7 text-black/25"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2.5 py-1 rounded text-xs font-sans font-normal text-white bg-neutral-800 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              Formally proven
            </span>
          </span>
        </h1>
      </header>

      {/* The Guarantee */}
      <Section className="mb-16">
        <Guarantee />

        <p className="text-secondary text-[15px] leading-relaxed">
          Lido V3 introduced StakingVaults, which allow stETH to be
          minted against ETH held in isolated vaults. The VaultHub
          contract enforces overcollateralization: part of the
          vault&apos;s value must remain locked, covering the
          outstanding stETH liability plus a reserve buffer.
        </p>
        <p className="mt-2 text-secondary text-[15px]">
          <ExternalLink href="https://docs.lido.fi/run-on-lido/stvaults/tech-documentation/tech-design/">
            View technical design
          </ExternalLink>
        </p>
      </Section>

      {/* Why this matters */}
      <Section>
        <SectionTitle>Why this matters</SectionTitle>
        <p className="leading-relaxed mb-6">
          VaultHub only allows minting when{" "}
          <code className="font-mono text-[13px]">
            totalValue ≥ _locked()
          </code>
          . If{" "}
          <code className="font-mono text-[13px]">_locked()</code>{" "}
          didn&apos;t satisfy this inequality (due to an overflow,
          rounding error, or edge case), a vault could pass that check
          while locking less ETH than the stETH minted against it.
        </p>
        <Disclosure title="What this invariant covers">
          <p className="mb-3 text-secondary">
            This proof covers the <em>formula</em>: for any inputs,{" "}
            <code className="font-mono text-[12px]">_locked()</code>{" "}
            never underestimates how much ETH should be locked.
          </p>
          <p className="text-secondary">
            It does not cover whether the vault <em>actually holds</em>{" "}
            that much ETH. That is enforced at runtime: VaultHub
            checks{" "}
            <code className="font-mono text-[12px]">
              totalValue ≥ locked
            </code>{" "}
            at mint time. If a validator is slashed between oracle
            reports, the vault may temporarily be under-collateralized.
            The contract handles this through forced validator exits
            (EIP-7002) and permissionless{" "}
            <code className="font-mono text-[12px]">forceRebalance()</code>.
          </p>
        </Disclosure>
      </Section>

      {/* How this was proven */}
      <Section>
        <SectionTitle>How this was proven</SectionTitle>
        <p className="leading-relaxed mb-4">
          The{" "}
          <code className="font-mono text-[13px]">_locked()</code>{" "}
          function uses non-linear{" "}
          <code className="font-mono text-[13px]">uint256</code>{" "}
          arithmetic (multiplications, ceiling division,{" "}
          <code className="font-mono text-[13px]">max()</code>)
          that standard verification tools cannot reason about.
          This property was flagged as unproven (finding F-01) in
          Certora&apos;s formal verification report.
        </p>
        <p className="leading-relaxed mb-4">
          The contract logic was modeled in{" "}
          <ExternalLink href="https://github.com/lfglabs-dev/verity-benchmark/blob/main/Benchmark/Cases/Lido/VaulthubLocked/Contract.lean">
            Verity
          </ExternalLink>
          , a framework for expressing smart contract logic in a way
          that allows mathematical proofs. The theorem was given to
          AI agents as a benchmark task. A proof was generated by
          GPT 5.4 for ~$45 (3M tokens) and is provided as{" "}
          <ExternalLink href="https://github.com/lfglabs-dev/verity-benchmark/blob/main/Benchmark/Cases/Lido/VaulthubLocked/Proofs.lean">
            reference
          </ExternalLink>
          .
        </p>
        <p className="leading-relaxed mb-4">
          The proof is checked by Lean 4&apos;s kernel, a small
          program that accepts or rejects proofs deterministically.
          If the proof were wrong, it would not compile.
        </p>
        <Disclosure title="Verify it yourself" className="mb-4">
          <CodeBlock>{VERIFY_COMMAND}</CodeBlock>
          <p className="mt-3 text-secondary">
            If the build succeeds, the proof is correct.{" "}
            <ExternalLink href="https://github.com/lfglabs-dev/verity-benchmark">
              Source repository
            </ExternalLink>
          </p>
        </Disclosure>
        <p className="text-secondary text-[14px] leading-relaxed">
          Note: the current proof is neither optimized for performance
          nor elegance. It may be replaced by a cleaner version as
          the benchmark is run with more models.
        </p>
      </Section>

      {/* Hypotheses */}
      <Section>
        <SectionTitle>Hypotheses</SectionTitle>
        <p className="leading-relaxed mb-4 text-secondary text-[15px]">
          The proof uses zero axioms. The theorem requires these
          hypotheses, which encode assumptions about valid protocol
          states:
        </p>
        <ul className="space-y-0 border border-border rounded overflow-hidden text-[14px]">
          <Hypothesis
            name="hMaxLS"
            constraint="maxLiabilityShares ≥ liabilityShares"
            source="Certora P-VH-04, verified"
          >
            Core invariant maintained by VaultHub&apos;s minting and
            reporting logic.{" "}
            <code className="font-mono text-[12px]">_locked()</code>{" "}
            is computed from{" "}
            <code className="font-mono text-[12px]">maxLiabilityShares</code>{" "}
            (worst-case), not current shares. Without this, the locked
            amount wouldn&apos;t cover the real liability.
          </Hypothesis>
          <Hypothesis
            name="hRR_pos"
            constraint="reserveRatioBP > 0"
            source="Certora P-VH-03, verified"
          >
            Enforced by{" "}
            <code className="font-mono text-[12px]">connectVault()</code>.
            A zero reserve ratio would make the overcollateralization
            trivial but the proof structure requires it for the
            algebra to work out.
          </Hypothesis>
          <Hypothesis
            name="hRR_lt"
            constraint="reserveRatioBP < 10000"
            source="Certora P-VH-03, verified"
          >
            Critical. If{" "}
            <code className="font-mono text-[12px]">reserveRatioBP ≥ 10000</code>,
            the subtraction{" "}
            <code className="font-mono text-[12px]">BP − RR</code>{" "}
            underflows in{" "}
            <code className="font-mono text-[12px]">uint256</code>,
            producing a nonsensical denominator. On-chain, Solidity
            0.8+ would revert; in the Lean model, it wraps.
          </Hypothesis>
          <Hypothesis
            name="hTS"
            constraint="totalShares > 0"
            source="Lido base assumption"
          >
            Required for share-to-ETH conversion. If{" "}
            <code className="font-mono text-[12px]">totalShares = 0</code>,{" "}
            <code className="font-mono text-[12px]">ceilDiv</code>{" "}
            divides by zero and underestimates the liability. In
            practice, always true after Lido&apos;s bootstrap deposit.
          </Hypothesis>
          <Hypothesis
            name="hTPE"
            constraint="totalPooledEther > 0"
            source="Lido base assumption"
            border={false}
          >
            Unused by the proof (prefixed with{" "}
            <code className="font-mono text-[12px]">_</code> in Lean).
            Included for specification completeness: a pool with shares
            but no ether would be nonsensical.
          </Hypothesis>
        </ul>
        <p className="mt-2 text-secondary text-[13px] leading-relaxed">
          Five additional{" "}
          <code className="font-mono text-[12px]">hNoOverflow</code>{" "}
          hypotheses guard that intermediate{" "}
          <code className="font-mono text-[12px]">uint256</code>{" "}
          products stay below 2<sup>256</sup>. With Lido&apos;s total
          staked ETH at ~30M ETH (~2<sup>85</sup> wei), products reach
          ~2<sup>170</sup>, far below the 2<sup>256</sup> limit.
        </p>
        <p className="mt-3 text-secondary text-sm space-x-4">
          <ExternalLink href="https://github.com/lfglabs-dev/verity-benchmark/blob/main/Benchmark/Cases/Lido/VaulthubLocked/Specs.lean#L30-L52">
            View in Lean
          </ExternalLink>
          <ExternalLink href="https://github.com/lidofinance/audits/blob/main/Certora%20Lido%20V3%20Formal%20Verification%20Report%20-%2012-2025.pdf">
            Certora report
          </ExternalLink>
        </p>
      </Section>

      {/* Learn more */}
      <Section>
        <SectionTitle>Learn more</SectionTitle>
        <p className="leading-relaxed">
          <a
            href="/"
            className="underline underline-offset-3 hover:text-foreground transition-colors"
          >
            What is a formal proof?
          </a>
          {" "}A short explanation for non-specialists.
        </p>
      </Section>

      <footer className="mt-12 pt-8 border-t border-border">
        <p className="text-secondary text-sm">
          Part of the{" "}
          <a
            href="https://github.com/lfglabs-dev/verity-benchmark"
            className="underline underline-offset-3 hover:text-foreground transition-colors"
          >
            Verity benchmark
          </a>{" "}
          initiative
        </p>
      </footer>
    </main>
  );
}
