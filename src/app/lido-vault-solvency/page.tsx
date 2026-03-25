import katex from "katex";
import { Guarantee } from "./guarantee";

function Equation({ tex, display = false }: { tex: string; display?: boolean }) {
  const html = katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
  });
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function Section({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`mb-20 ${className}`}>{children}</section>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold tracking-tight mb-4">{children}</h2>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-surface border border-border rounded px-5 py-4 text-sm font-mono leading-relaxed overflow-x-auto">
      {children}
    </pre>
  );
}

export default function Home() {
  return (
    <main className="font-serif max-w-[680px] mx-auto px-6 py-20 md:py-32">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight leading-tight">
          Lido V3 Vault Solvency Guarantee
        </h1>
      </header>

      {/* The Guarantee */}
      <Section className="mb-16">
        <Guarantee />

        <p className="text-secondary text-[15px] leading-relaxed">
          Lido V3 introduced StakingVaults, which allow stETH to be
          minted against ETH held in isolated vaults and used for
          validator operations. The VaultHub contract enforces
          overcollateralization by requiring that part of the
          vault&apos;s value remains locked, covering both the
          outstanding liability and an additional reserve providing
          a buffer against losses such as slashing.{" "}
          <a
            href="https://docs.lido.fi/run-on-lido/stvaults/tech-documentation/tech-design/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block align-middle text-secondary hover:text-foreground transition-colors"
            title="Open architecture documentation"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </p>
      </Section>

      {/* Why this matters */}
      <Section>
        <SectionTitle>Why this matters</SectionTitle>
        <ul className="space-y-2 leading-relaxed">
          <li>
            Vault-minted stETH is always redeemable for ETH at 1:1,
            the core invariant of the Lido protocol
          </li>
          <li>
            Losses in one vault never spill over to stETH holders or other vaults
          </li>
          <li>
            The reserve margin creates a buffer before a vault becomes
            unhealthy and is subject to forced rebalancing
          </li>
        </ul>
      </Section>

      {/* Why this is difficult */}
      <Section>
        <SectionTitle>Why this is difficult</SectionTitle>
        <p className="leading-relaxed mb-4">
          The{" "}
          <code className="font-mono text-[13px]">_locked()</code>{" "}
          function uses non-linear{" "}
          <code className="font-mono text-[13px]">uint256</code>{" "}
          arithmetic: multiplications, ceiling division via{" "}
          <code className="font-mono text-[13px]">Math256.ceilDiv</code>,
          and a{" "}
          <code className="font-mono text-[13px]">max()</code>{" "}
          over the reserve and a minimum floor, all within
          2<sup>256</sup> bounds.
        </p>
        <p className="text-secondary leading-relaxed">
          This property was flagged as unproven (finding F-01) in
          Certora&apos;s formal verification report. Standard SMT-based
          tools typically cannot handle non-linear integer reasoning with
          division.
        </p>
      </Section>

      {/* Why you can trust this */}
      <Section>
        <SectionTitle>Why you can trust this</SectionTitle>
        <div className="space-y-4 leading-relaxed">
          <p>
            The proof was generated automatically and checked by the Lean 4
            theorem prover. Every logical step is verified deterministically by
            Lean&apos;s kernel, a small, well-audited program that accepts or
            rejects proofs.
          </p>
          <p>If the proof were incorrect, it would not compile.</p>
          <p className="font-medium">
            You do not need to trust the proof generator.
          </p>
        </div>
      </Section>

      {/* Verify it yourself */}
      <Section>
        <SectionTitle>Verify it yourself</SectionTitle>
        <Code>
          {`git clone https://github.com/lfglabs-dev/verity-benchmark
cd verity-benchmark
./scripts/run_default_agent.sh lido/vaulthub_locked/locked_funds_solvency`}
        </Code>
        <p className="mt-4 leading-relaxed">
          If the build succeeds, the proof is correct. No other check is needed.
        </p>
        <div className="mt-4 text-secondary text-sm space-x-6">
          <a
            href="https://github.com/lfglabs-dev/verity-benchmark"
            className="underline underline-offset-3 hover:text-foreground transition-colors"
          >
            Source repository
          </a>
        </div>
      </Section>

      {/* Trust model */}
      <Section>
        <SectionTitle>Trust model</SectionTitle>
        <div className="border border-border rounded px-6 py-5">
          <p className="leading-relaxed mb-4">
            To trust this result, you only need to trust:
          </p>
          <ul className="space-y-1 leading-relaxed mb-6">
            <li>The Lean proof checker (open source, widely used)</li>
            <li>The stated assumptions (listed below)</li>
          </ul>
          <p className="leading-relaxed">You do <em>not</em> need to trust:</p>
          <ul className="space-y-1 leading-relaxed mt-2">
            <li>The AI that generated the proof</li>
            <li>The authors of this page</li>
          </ul>
        </div>
      </Section>

      {/* Assumptions */}
      <Section>
        <SectionTitle>Assumptions</SectionTitle>
        <p className="leading-relaxed mb-4 text-secondary">
          The proof holds under explicit preconditions, each enforced
          by VaultHub&apos;s connection and minting logic.
        </p>
        <ul className="space-y-3 leading-relaxed">
          <li>
            <strong className="font-medium">Max liability bound</strong>
            <span className="text-secondary">
              {": "}<code className="font-mono text-[13px]">maxLiabilityShares ≥ liabilityShares</code>.
              Enforced by{" "}
              <code className="font-mono text-[13px]">_increaseLiability</code>{" "}
              on every mint. The actual shares minted never exceed the
              per-oracle-period maximum.
            </span>
          </li>
          <li>
            <strong className="font-medium">Reserve ratio bounds</strong>
            <span className="text-secondary">
              {": "}<code className="font-mono text-[13px]">0 &lt; reserveRatioBP &lt; 10000</code>.
              Set at vault connection and validated
              by{" "}
              <code className="font-mono text-[13px]">_connectVault</code>.
              A 30% ratio means 1.43 ETH must be locked per stETH minted.
            </span>
          </li>
          <li>
            <strong className="font-medium">Positive protocol state</strong>
            <span className="text-secondary">
              {": "}<code className="font-mono text-[13px]">totalShares &gt; 0</code> and{" "}
              <code className="font-mono text-[13px]">totalPooledEther &gt; 0</code>.
              Required for share-to-ETH conversion. Always true while
              Lido has active deposits.
            </span>
          </li>
          <li>
            <strong className="font-medium">No arithmetic overflow</strong>
            <span className="text-secondary">
              {": "}intermediate products like{" "}
              <code className="font-mono text-[13px]">
                liabilityShares × totalPooledEther
              </code>{" "}
              and{" "}
              <code className="font-mono text-[13px]">
                liability × reserveRatioBP
              </code>{" "}
              stay within{" "}
              <code className="font-mono text-[13px]">uint256</code>.
            </span>
          </li>
        </ul>
        <p className="mt-4 text-secondary text-sm">
          <a
            href="https://github.com/lfglabs-dev/verity-benchmark/tree/main/Benchmark/Cases/Lido/VaulthubLocked"
            className="underline underline-offset-3 hover:text-foreground transition-colors"
          >
            View full specification →
          </a>
        </p>
      </Section>

      {/* What was proven */}
      <Section>
        <SectionTitle>What was proven</SectionTitle>
        <p className="leading-relaxed mb-4">
          Five theorems, from the core solvency result to supporting lemmas:
        </p>
        <ul className="space-y-3 leading-relaxed">
          <li>
            <strong className="font-medium">locked_funds_solvency</strong>
            <span className="text-secondary">
              {": "}the main result. The output of{" "}
              <code className="font-mono text-[13px]">_locked()</code>,
              scaled by the reserve-ratio complement, always exceeds the
              stETH liability scaled by total basis points.
            </span>
          </li>
          <li>
            <strong className="font-medium">ceildiv_sandwich</strong>
            <span className="text-secondary">
              {": "}rounding up never loses value.{" "}
              <code className="font-mono text-[13px]">ceilDiv(x, d) · d ≥ x</code>.
              Key arithmetic fact used in the main proof.
            </span>
          </li>
          <li>
            <strong className="font-medium">shares_conversion_monotone</strong>
            <span className="text-secondary">
              {": "}if vault A holds more shares than vault B, it also
              owes more ETH.{" "}
              <code className="font-mono text-[13px]">getPooledEthBySharesRoundUp</code>{" "}
              preserves ordering.
            </span>
          </li>
          <li>
            <strong className="font-medium">max_liability_shares_bound</strong>
            <span className="text-secondary">
              {": "}the vault&apos;s current{" "}
              <code className="font-mono text-[13px]">liabilityShares</code>{" "}
              never exceeds{" "}
              <code className="font-mono text-[13px]">maxLiabilityShares</code>,
              as maintained by VaultHub&apos;s minting and reporting logic.
            </span>
          </li>
          <li>
            <strong className="font-medium">reserve_ratio_bounds</strong>
            <span className="text-secondary">
              {": "}the{" "}
              <code className="font-mono text-[13px]">reserveRatioBP</code>{" "}
              is always between 1 and 9999, enforced at vault connection.
            </span>
          </li>
        </ul>
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

      {/* Footer */}
      <footer className="mt-12 pt-8 border-t border-border">
        <p className="text-secondary text-sm">
          Part of the{" "}
          <a
            href="https://verity.labs"
            className="underline underline-offset-3 hover:text-foreground transition-colors"
          >
            Verity
          </a>{" "}
          benchmark initiative
        </p>
      </footer>
    </main>
  );
}
