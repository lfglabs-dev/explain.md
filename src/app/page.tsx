export default function WhatIsAFormalProof() {
  return (
    <main className="font-serif max-w-[680px] mx-auto px-6 py-20 md:py-32">
      <header className="mb-20">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight leading-tight">
          What is a formal proof?
        </h1>
        <p className="mt-3 text-secondary text-base">
          A short explanation for non-specialists
        </p>
      </header>

      <section className="mb-16 leading-relaxed space-y-4">
        <p>
          A formal proof is a program that a computer can check. Either the
          proof is accepted, or it is rejected. There is no middle ground.
        </p>
        <p>
          A test checks that code works for a few examples. A formal proof
          checks that it works for <em>every possible input</em>.
        </p>
      </section>

      <section className="mb-16">
        <h2 className="text-lg font-semibold tracking-tight mb-4">
          A concrete example
        </h2>
        <p className="leading-relaxed mb-6">
          Consider a simplified ERC-20 token. The contract stores balances and
          a total supply. Here is the transfer function written in{" "}
          <a
            href="https://github.com/Th0rgal/verity"
            className="underline underline-offset-3 hover:text-foreground transition-colors"
          >
            Verity
          </a>
          , a framework for formally verified smart contracts:
        </p>

        {/* Contract definition */}
        <div className="bg-[#faf4ed] rounded-lg px-6 py-5 overflow-x-auto text-[13.5px] leading-[1.7] font-mono">
          <div className="text-[#9893a5]">-- Contract storage</div>
          <div>
            <span className="text-[#907aa9]">verity_contract</span>{" "}
            <span className="text-[#286983]">ERC20</span>{" "}
            <span className="text-[#907aa9]">where</span>
          </div>
          <div>
            {"  "}<span className="text-[#907aa9]">storage</span>
          </div>
          <div>
            {"    "}<span className="text-[#575279]">totalSupplySlot</span>{" "}
            <span className="text-[#797593]">:</span>{" "}
            <span className="text-[#ea9d34]">Uint256</span>{" "}
            <span className="text-[#797593]">:=</span>{" "}
            <span className="text-[#575279]">slot 1</span>
          </div>
          <div>
            {"    "}<span className="text-[#575279]">balancesSlot</span>{" "}
            <span className="text-[#797593]">:</span>{" "}
            <span className="text-[#ea9d34]">Address → Uint256</span>{" "}
            <span className="text-[#797593]">:=</span>{" "}
            <span className="text-[#575279]">slot 2</span>
          </div>
          <div className="mt-3 text-[#9893a5]">
            -- Transfer tokens from sender to recipient
          </div>
          <div>
            {"  "}<span className="text-[#907aa9]">function</span>{" "}
            <span className="text-[#286983]">transfer</span>{" "}
            <span className="text-[#575279]">
              (to : Address, amount : Uint256) : Unit
            </span>{" "}
            <span className="text-[#797593]">:=</span>{" "}
            <span className="text-[#907aa9]">do</span>
          </div>
          <div>
            {"    "}<span className="text-[#907aa9]">let</span>{" "}
            <span className="text-[#575279]">sender ← msgSender</span>
          </div>
          <div>
            {"    "}<span className="text-[#907aa9]">let</span>{" "}
            <span className="text-[#575279]">
              senderBalance ← getMapping balancesSlot sender
            </span>
          </div>
          <div>
            {"    "}<span className="text-[#907aa9]">require</span>{" "}
            <span className="text-[#575279]">
              (senderBalance {">"}= amount)
            </span>{" "}
            <span className="text-[#56949f]">
              &quot;Insufficient balance&quot;
            </span>
          </div>
          <div>
            {"    "}<span className="text-[#575279]">setMapping balancesSlot sender</span>{" "}
            <span className="text-[#575279]">(sub senderBalance amount)</span>
          </div>
          <div>
            {"    "}<span className="text-[#907aa9]">let</span>{" "}
            <span className="text-[#575279]">
              recipientBalance ← getMapping balancesSlot to
            </span>
          </div>
          <div>
            {"    "}<span className="text-[#575279]">setMapping balancesSlot to</span>{" "}
            <span className="text-[#575279]">(add recipientBalance amount)</span>
          </div>
        </div>

        <p className="leading-relaxed mt-6 mb-6 text-secondary text-[15px]">
          This reads like pseudocode, but it compiles to real EVM bytecode. Now
          we state a property we want to guarantee:
        </p>

        <p className="leading-relaxed mb-3 font-medium">
          &ldquo;Calling transfer never changes the total supply.&rdquo;
        </p>

        {/* Invariant definition */}
        <div className="bg-[#faf4ed] rounded-lg px-6 py-5 overflow-x-auto text-[13.5px] leading-[1.7] font-mono">
          <div className="text-[#9893a5]">
            -- The sum of all balances equals total supply
          </div>
          <div>
            <span className="text-[#907aa9]">def</span>{" "}
            <span className="text-[#286983]">supply_matches_balances</span>{" "}
            <span className="text-[#575279]">(s : ContractState)</span>{" "}
            <span className="text-[#797593]">:</span>{" "}
            <span className="text-[#ea9d34]">Prop</span>{" "}
            <span className="text-[#797593]">:=</span>
          </div>
          <div>
            {"  "}<span className="text-[#575279]">totalBalance s = s.storage 1</span>
          </div>
          <div className="mt-3 text-[#9893a5]">
            -- Transfer preserves the sum of all balances
          </div>
          <div>
            <span className="text-[#907aa9]">def</span>{" "}
            <span className="text-[#286983]">transfer_preserves_total</span>{" "}
            <span className="text-[#575279]">(s s&apos; : ContractState)</span>{" "}
            <span className="text-[#797593]">:</span>{" "}
            <span className="text-[#ea9d34]">Prop</span>{" "}
            <span className="text-[#797593]">:=</span>
          </div>
          <div>
            {"  "}<span className="text-[#575279]">totalBalance s&apos; = totalBalance s</span>
          </div>
        </div>

        <p className="leading-relaxed mt-6 mb-6 text-secondary text-[15px]">
          And we prove it:
        </p>

        {/* Proof */}
        <div className="bg-[#faf4ed] rounded-lg px-6 py-5 overflow-x-auto text-[13.5px] leading-[1.7] font-mono">
          <div>
            <span className="text-[#907aa9]">theorem</span>{" "}
            <span className="text-[#56949f]">
              transfer_preserves_totalSupply
            </span>
          </div>
          <div>
            {"    "}<span className="text-[#575279]">
              (s : ContractState) (to : Address) (amount : Uint256)
            </span>
          </div>
          <div>
            {"    "}<span className="text-[#575279]">
              (h_balance : s.storageMap 2 s.sender ≥ amount)
            </span>
          </div>
          <div>
            {"    "}<span className="text-[#797593]">:</span>{" "}
            <span className="text-[#ea9d34]">
              transfer_preserves_total s (transfer to amount).runState s
            </span>
            {" "}<span className="text-[#797593]">:=</span>{" "}
            <span className="text-[#907aa9]">by</span>
          </div>
          <div className="mt-1 text-[#9893a5]">
            {"  "}<span>-- unfold the transfer function and simplify</span>
          </div>
          <div>
            {"  "}<span className="text-[#907aa9]">have</span>{" "}
            <span className="text-[#575279]">h := transfer_meets_spec s to amount h_balance</span>
          </div>
          <div className="text-[#9893a5]">
            {"  "}<span>-- extract that storage slot 1 (totalSupply) is unchanged</span>
          </div>
          <div>
            {"  "}<span className="text-[#907aa9]">exact</span>{" "}
            <span className="text-[#575279]">h.2.2.2.2.1</span>
          </div>
        </div>

        <p className="leading-relaxed mt-6 text-secondary text-[15px]">
          The <span className="font-mono text-[13px]">theorem</span>{" "}keyword
          tells Lean: &ldquo;I claim this is true, and here is my
          proof.&rdquo; The{" "}
          <span className="font-mono text-[13px]">by</span> block contains
          the actual proof steps. If any step has a gap or error, Lean refuses
          to compile.
        </p>
      </section>

      <section className="mb-16">
        <h2 className="text-lg font-semibold tracking-tight mb-4">
          How does the checking work?
        </h2>
        <div className="leading-relaxed space-y-4">
          <p>
            Lean has a small, well-audited <em>kernel</em> that accepts or
            rejects proofs. Every proof must pass through this kernel. It does
            not care how the proof was found&mdash;by a human, an AI, or an
            automated solver. What matters is that each step is valid.
          </p>
          <p className="font-medium">
            If the proof compiles, it is correct. If it doesn&apos;t, it
            isn&apos;t.
          </p>
        </div>
      </section>

      <section className="mb-16">
        <h2 className="text-lg font-semibold tracking-tight mb-4">
          Tests vs. formal proofs
        </h2>
        <div className="border border-border rounded px-6 py-5 leading-relaxed">
          <p className="mb-4">
            <strong className="font-medium">A test</strong> says: &ldquo;I
            transferred 50 tokens from Alice to Bob and the total supply didn&apos;t
            change.&rdquo;
          </p>
          <p>
            <strong className="font-medium">A formal proof</strong> says:
            &ldquo;For <em>every</em> sender, <em>every</em> recipient, and{" "}
            <em>every</em>{" "}amount, transfer preserves total supply.&rdquo;
          </p>
        </div>
      </section>

      <section className="mb-16">
        <h2 className="text-lg font-semibold tracking-tight mb-4">
          Why does this matter for smart contracts?
        </h2>
        <div className="leading-relaxed space-y-4">
          <p>
            Smart contracts handle real money. A bug in token arithmetic can
            drain millions. Tests catch some bugs, audits catch more, but
            neither can guarantee correctness for all possible states.
          </p>
          <p>
            A formal proof can. It is a mathematical certificate that the
            property holds in every case, not just the ones the auditor thought
            to check.
          </p>
        </div>
      </section>

      <section className="mb-16">
        <h2 className="text-lg font-semibold tracking-tight mb-6">
          See it in practice
        </h2>
        <p className="leading-relaxed">
          <a
            href="/lido-vault-solvency"
            className="underline underline-offset-3 hover:text-foreground transition-colors"
          >
            Lido V3 Vault Solvency Guarantee
          </a>
          {" "}. A formally verified property of a production smart contract.
        </p>
      </section>

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
