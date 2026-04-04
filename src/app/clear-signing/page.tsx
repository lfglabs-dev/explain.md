"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { ExternalLink, CodeBlock } from "../components";
import { findSpec } from "./engine/specs";
import { extractSelector, decodeCalldata } from "./engine/decoder";
import { evaluateIntent, collectAllTemplates } from "./engine/evaluator";
import {
  resolveAddressAsync,
  formatAddress,
  formatTokenAmount,
} from "./engine/resolver";
import { EXAMPLES, type Example } from "./engine/examples";
import type {
  IntentSpec,
  Binding,
  EmittedTemplate,
  ResolvedHole,
  Value,
  Template,
  KnownAddress,
  ParamType,
} from "./engine/types";

// ─── Types ──────────────────────────────────────────────────────────────────

type Step =
  | { kind: "spec-match"; spec: IntentSpec | null; address: string }
  | { kind: "function-id"; binding: Binding | null; selector: string }
  | {
      kind: "calldata-decode";
      params: { name: string; type: ParamType; value: Value }[];
    }
  | {
      kind: "intent-eval";
      emitted: EmittedTemplate;
      allTemplates: Template[];
    }
  | {
      kind: "address-resolution";
      resolutions: Map<string, KnownAddress | null>;
      pending: Set<string>;
    }
  | { kind: "verified-display"; text: string };

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Format a Value for display (raw, before address resolution). */
function formatValue(value: Value): string {
  switch (value.kind) {
    case "int":
      return value.value.toString();
    case "bool":
      return value.value ? "true" : "false";
    case "address":
      return value.value;
    case "list":
      return `[${value.items.map(formatValue).join(", ")}]`;
  }
}

/** Collect all address values from resolved holes. */
function collectAddresses(holes: ResolvedHole[]): string[] {
  const addrs: string[] = [];
  for (const hole of holes) {
    if (hole.value.kind === "address") {
      addrs.push(hole.value.value);
    }
  }
  return addrs;
}

/** Render the final intent string with resolved names and formatted amounts. */
function renderIntent(
  emitted: EmittedTemplate,
  resolutions: Map<string, KnownAddress | null>
): string {
  let text = emitted.text;
  for (const hole of emitted.holes) {
    const placeholder = `{${hole.name}}`;
    let display: string;

    switch (hole.format.kind) {
      case "address": {
        const addr = hole.value.kind === "address" ? hole.value.value : "";
        const resolved = resolutions.get(addr.toLowerCase());
        display = formatAddress(addr, resolved);
        break;
      }
      case "tokenAmount": {
        const raw = hole.value.kind === "int" ? hole.value.value : 0n;
        display = formatTokenAmount(
          raw,
          hole.format.decimals,
          hole.format.symbol
        );
        break;
      }
      case "raw": {
        display = formatValue(hole.value);
        break;
      }
    }

    text = text.replace(placeholder, display);
  }
  return text;
}

// ─── Step Components ────────────────────────────────────────────────────────

function StepContainer({
  index,
  title,
  status,
  children,
}: {
  index: number;
  title: string;
  status: "success" | "error" | "pending";
  children: React.ReactNode;
}) {
  const icon =
    status === "success" ? (
      <span className="text-emerald-600">&#10003;</span>
    ) : status === "error" ? (
      <span className="text-red-500">&#10007;</span>
    ) : (
      <span className="text-secondary animate-pulse">...</span>
    );

  return (
    <div className="mb-6 last:mb-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-xs text-secondary">
          {index.toString().padStart(2, "0")}
        </span>
        <span className="text-[15px] font-medium">{title}</span>
        {icon}
      </div>
      <div className="ml-7 text-[14px] leading-relaxed">{children}</div>
    </div>
  );
}

function SpecMatchStep({
  step,
}: {
  step: Extract<Step, { kind: "spec-match" }>;
}) {
  return (
    <StepContainer
      index={1}
      title="Spec matching"
      status={step.spec ? "success" : "error"}
    >
      {step.spec ? (
        <p>
          Contract{" "}
          <span className="font-mono text-[13px]">
            {step.address.slice(0, 6)}...{step.address.slice(-4)}
          </span>{" "}
          matches{" "}
          <strong className="font-semibold">{step.spec.contractName}</strong>{" "}
          spec
        </p>
      ) : (
        <p className="text-red-600">
          No spec found for{" "}
          <span className="font-mono text-[13px]">{step.address}</span>
        </p>
      )}
    </StepContainer>
  );
}

function FunctionIdStep({
  step,
}: {
  step: Extract<Step, { kind: "function-id" }>;
}) {
  return (
    <StepContainer
      index={2}
      title="Function identification"
      status={step.binding ? "success" : "error"}
    >
      {step.binding ? (
        <p>
          Selector{" "}
          <span className="font-mono text-[13px]">{step.selector}</span>
          {" → "}
          <span className="font-mono text-[13px]">
            {step.binding.abiSignature}
          </span>
        </p>
      ) : (
        <p className="text-red-600">
          Unknown selector{" "}
          <span className="font-mono text-[13px]">{step.selector}</span>
        </p>
      )}
    </StepContainer>
  );
}

function CalldataDecodeStep({
  step,
}: {
  step: Extract<Step, { kind: "calldata-decode" }>;
}) {
  return (
    <StepContainer index={3} title="Calldata decoding" status="success">
      <div className="bg-surface border border-border rounded px-4 py-3 font-mono text-[13px] space-y-1">
        {step.params.map((p) => (
          <div key={p.name} className="flex gap-2">
            <span className="text-secondary min-w-[110px]">
              {p.name}
              <span className="text-secondary/60"> ({p.type})</span>
            </span>
            <span className="break-all">{formatValue(p.value)}</span>
          </div>
        ))}
      </div>
    </StepContainer>
  );
}

function IntentEvalStep({
  step,
}: {
  step: Extract<Step, { kind: "intent-eval" }>;
}) {
  return (
    <StepContainer index={4} title="Intent evaluation" status="success">
      <div className="space-y-2">
        {step.allTemplates.map((t, i) => {
          const isActive = i === step.emitted.templateIndex;
          return (
            <div
              key={i}
              className={`px-3 py-2 rounded border text-[13px] font-mono ${
                isActive
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-border bg-white text-secondary line-through"
              }`}
            >
              <span className="text-secondary/60">
                #{i} {isActive ? "(active)" : "(skipped)"}
              </span>
              <div className="mt-0.5">{t.text}</div>
            </div>
          );
        })}
      </div>
    </StepContainer>
  );
}

function AddressResolutionStep({
  step,
}: {
  step: Extract<Step, { kind: "address-resolution" }>;
}) {
  const entries = Array.from(step.resolutions.entries());
  if (entries.length === 0) {
    return (
      <StepContainer index={5} title="Address resolution" status="success">
        <p className="text-secondary">No addresses to resolve</p>
      </StepContainer>
    );
  }

  const allDone = step.pending.size === 0;

  return (
    <StepContainer
      index={5}
      title="Address resolution"
      status={allDone ? "success" : "pending"}
    >
      <div className="space-y-1.5">
        {entries.map(([addr, resolved]) => {
          const isPending = step.pending.has(addr);
          return (
            <div
              key={addr}
              className="flex items-center gap-2 font-mono text-[13px]"
            >
              <span className="text-secondary">
                {addr.slice(0, 6)}...{addr.slice(-4)}
              </span>
              <span className="text-secondary">→</span>
              {isPending ? (
                <span className="text-secondary animate-pulse">
                  resolving...
                </span>
              ) : resolved ? (
                <span className="text-emerald-700 font-semibold">
                  {resolved.name}
                </span>
              ) : (
                <span className="text-amber-600">unknown</span>
              )}
            </div>
          );
        })}
      </div>
    </StepContainer>
  );
}

function VerifiedDisplayStep({
  step,
}: {
  step: Extract<Step, { kind: "verified-display" }>;
}) {
  return (
    <StepContainer index={6} title="Verified display" status="success">
      <div className="border-2 border-emerald-300 bg-emerald-50 rounded-lg px-5 py-4">
        <div className="flex items-start gap-2">
          <span className="text-emerald-600 text-lg leading-none mt-0.5">
            &#10003;
          </span>
          <p className="text-[16px] font-medium text-emerald-900 leading-snug">
            {step.text}
          </p>
        </div>
        <p className="text-[12px] text-emerald-700/70 mt-2 ml-6">
          Intent verified by Groth16 proof: template and values match the
          calldata commitment
        </p>
      </div>
    </StepContainer>
  );
}

// ─── DSL Display ────────────────────────────────────────────────────────────

function DslDisplay({ spec }: { spec: IntentSpec }) {
  const lines: string[] = [];
  lines.push(`intent_spec "${spec.contractName}" where`);

  for (const [name, value] of Object.entries(spec.constants)) {
    lines.push(`  const ${name} := ${value === 2n ** 256n - 1n ? "(2^256 - 1)" : value.toString()}`);
  }

  if (Object.keys(spec.constants).length > 0) {
    // Check for MAX_UINT256 predicate pattern
    if (spec.constants.MAX_UINT256 !== undefined) {
      lines.push("");
      lines.push(`  predicate isMaxUint(v : uint256) :=`);
      lines.push(`    v == MAX_UINT256`);
    }
  }

  for (const fn of spec.fns) {
    lines.push("");
    const params = fn.params
      .filter(p => p.name !== "deadline") // Skip noise params
      .map((p) => `${p.name} : ${p.type}`)
      .join(", ");
    lines.push(`  intent ${fn.name}(${params}) where`);

    function renderStmts(stmts: typeof fn.body, indent: number) {
      for (const stmt of stmts) {
        const pad = " ".repeat(indent);
        if (stmt.kind === "emit") {
          lines.push(`${pad}emit "${stmt.template.text}"`);
        } else if (stmt.kind === "when") {
          lines.push(`${pad}when isMaxUint(amount) =>`);
          renderStmts(stmt.then, indent + 2);
          lines.push(`${pad}otherwise =>`);
          renderStmts(stmt.otherwise, indent + 2);
        }
      }
    }

    renderStmts(fn.body, 4);
  }

  return <CodeBlock>{lines.join("\n")}</CodeBlock>;
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ClearSigningPage() {
  // ── Input state ──
  const [contractAddress, setContractAddress] = useState("");
  const [calldata, setCalldata] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeSpec, setActiveSpec] = useState<IntentSpec | null>(null);
  const abortRef = useRef(false);

  // ── Load an example ──
  const loadExample = useCallback((example: Example) => {
    setContractAddress(example.contractAddress);
    setCalldata(example.calldata);
    setSteps([]);
    setActiveSpec(null);
  }, []);

  // ── Run interpretation ──
  const interpret = useCallback(async () => {
    if (!contractAddress || !calldata) return;
    abortRef.current = false;
    setIsRunning(true);
    setSteps([]);
    setActiveSpec(null);

    const addStep = (step: Step) => {
      if (abortRef.current) return;
      setSteps((prev) => [...prev, step]);
    };

    const delay = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    try {
      // Step 1: Spec matching
      await delay(300);
      const spec = findSpec(contractAddress);
      addStep({ kind: "spec-match", spec, address: contractAddress });
      if (spec) setActiveSpec(spec);
      if (!spec) {
        setIsRunning(false);
        return;
      }

      // Step 2: Function identification
      await delay(400);
      const selector = extractSelector(calldata);
      const binding = spec.bindings.find(
        (b) => b.selector.toLowerCase() === selector.toLowerCase()
      );
      addStep({ kind: "function-id", binding: binding ?? null, selector });
      if (!binding) {
        setIsRunning(false);
        return;
      }

      // Step 3: Calldata decoding
      await delay(400);
      const intentFn = spec.fns.find(
        (f) => f.name === binding.intentFnName
      );
      if (!intentFn) {
        setIsRunning(false);
        return;
      }
      const params = decodeCalldata(calldata, intentFn, binding.paramMapping);
      const paramsList = Array.from(params.entries()).map(([name, value]) => ({
        name,
        type: intentFn.params.find((p) => p.name === name)?.type ?? ("uint256" as ParamType),
        value,
      }));
      addStep({ kind: "calldata-decode", params: paramsList });

      // Step 4: Intent evaluation
      await delay(500);
      const emitted = evaluateIntent(spec, binding, params);
      if (!emitted) {
        setIsRunning(false);
        return;
      }
      const allTemplates = collectAllTemplates(intentFn.body);
      addStep({ kind: "intent-eval", emitted, allTemplates });

      // Step 5: Address resolution (progressive)
      const addresses = collectAddresses(emitted.holes);
      if (addresses.length > 0) {
        await delay(300);
        const resolutions = new Map<string, KnownAddress | null>();
        const pending = new Set(addresses.map((a) => a.toLowerCase()));
        for (const addr of addresses) {
          resolutions.set(addr.toLowerCase(), null);
        }
        addStep({ kind: "address-resolution", resolutions, pending });

        // Resolve each address progressively
        for (const addr of addresses) {
          if (abortRef.current) break;
          const resolved = await resolveAddressAsync(addr, 500 + Math.random() * 400);
          const newResolutions = new Map(resolutions);
          newResolutions.set(addr.toLowerCase(), resolved);
          // Update the source maps for next iteration
          resolutions.set(addr.toLowerCase(), resolved);
          const newPending = new Set(pending);
          newPending.delete(addr.toLowerCase());
          pending.delete(addr.toLowerCase());
          setSteps((prev) => {
            const updated = [...prev];
            const idx = updated.findIndex(
              (s) => s.kind === "address-resolution"
            );
            if (idx >= 0) {
              updated[idx] = {
                kind: "address-resolution",
                resolutions: new Map(newResolutions),
                pending: new Set(newPending),
              };
            }
            return updated;
          });
        }
      }

      // Step 6: Verified display
      await delay(400);
      const resMap = new Map<string, KnownAddress | null>();
      for (const addr of addresses) {
        const stepData = steps.find((s) => s.kind === "address-resolution");
        if (stepData && stepData.kind === "address-resolution") {
          const resolved = stepData.resolutions.get(addr.toLowerCase());
          if (resolved !== undefined) resMap.set(addr.toLowerCase(), resolved);
        }
      }
      // Re-resolve synchronously for the final text
      const finalResolutions = new Map<string, KnownAddress | null>();
      for (const addr of addresses) {
        const { resolveAddress } = await import("./engine/resolver");
        finalResolutions.set(addr.toLowerCase(), resolveAddress(addr));
      }
      const finalText = renderIntent(emitted, finalResolutions);
      addStep({ kind: "verified-display", text: finalText });
    } catch (e) {
      console.error("Interpretation error:", e);
    } finally {
      setIsRunning(false);
    }
  }, [contractAddress, calldata]);

  // Auto-run when an example is loaded
  const prevCalldataRef = useRef(calldata);
  useEffect(() => {
    if (
      calldata &&
      contractAddress &&
      calldata !== prevCalldataRef.current
    ) {
      prevCalldataRef.current = calldata;
      // Small delay to let state settle
      const timer = setTimeout(() => interpret(), 100);
      return () => clearTimeout(timer);
    }
  }, [calldata, contractAddress, interpret]);

  return (
    <main className="font-serif max-w-[680px] mx-auto px-6 py-20 md:py-32">
      {/* ── Header ── */}
      <header className="mb-16">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight leading-tight">
          Clear Signing
        </h1>
        <p className="mt-3 text-secondary text-base leading-relaxed">
          Natural language interpretation of transaction intent, backed by
          zero-knowledge proofs.
        </p>
      </header>

      {/* ── Explanation ── */}
      <section className="mb-16 leading-relaxed space-y-4">
        <p>
          When you sign an Ethereum transaction, your wallet shows you raw
          calldata, a hex blob that means nothing to a human. Clear signing
          translates this into a sentence you can read and verify.
        </p>
        <p>
          The translation is not just a best-effort label. It is derived from a{" "}
          <ExternalLink href="https://github.com/lfglabs-dev/verity/pull/1677">
            formally defined intent spec
          </ExternalLink>{" "}
          and proven correct with a Groth16 zero-knowledge proof. The proof
          guarantees: <em>this sentence is a valid interpretation of this
          calldata according to this spec</em>.
        </p>
      </section>

      {/* ── How it works ── */}
      <section className="mb-16">
        <h2 className="text-lg font-semibold tracking-tight mb-4">
          How it works
        </h2>
        <div className="leading-relaxed space-y-4 text-[15px]">
          <ol className="list-decimal list-inside space-y-2">
            <li>
              <strong className="font-medium">Spec matching</strong>: the
              contract address is matched to a known intent specification
              (USDC, Uniswap, etc.)
            </li>
            <li>
              <strong className="font-medium">Function identification</strong>:
              the 4-byte selector identifies which function is being called
            </li>
            <li>
              <strong className="font-medium">Calldata decoding</strong>: raw
              bytes are decoded into typed parameters using the ABI
            </li>
            <li>
              <strong className="font-medium">Intent evaluation</strong>: the
              DSL program selects a template and fills its holes with parameter
              values
            </li>
            <li>
              <strong className="font-medium">Address resolution</strong>:
              raw addresses are progressively resolved to known names (tokens,
              ENS, protocols)
            </li>
            <li>
              <strong className="font-medium">Verified display</strong>: the
              final sentence is displayed with a proof that it matches the
              calldata commitment
            </li>
          </ol>
        </div>
      </section>

      {/* ── Active Spec Display ── */}
      {activeSpec && (
        <section className="mb-16">
          <h2 className="text-lg font-semibold tracking-tight mb-4">
            Loaded spec: {activeSpec.contractName}
          </h2>
          <p className="text-[15px] text-secondary mb-4 leading-relaxed">
            The intent DSL definition that governs how this contract&apos;s
            transactions are interpreted. This is the TypeScript equivalent of
            the{" "}
            <ExternalLink href="https://github.com/lfglabs-dev/verity/pull/1677">
              Lean definition
            </ExternalLink>{" "}
            in Verity.
          </p>
          <DslDisplay spec={activeSpec} />
        </section>
      )}

      {/* ── Demo ── */}
      <section className="mb-16">
        <h2 className="text-lg font-semibold tracking-tight mb-4">
          Try it
        </h2>

        {/* Preset examples */}
        <div className="flex flex-wrap gap-2 mb-6">
          {EXAMPLES.map((example) => (
            <button
              key={example.label}
              onClick={() => loadExample(example)}
              className="px-3 py-1.5 text-[13px] font-mono border border-border rounded hover:bg-surface transition-colors cursor-pointer"
              title={example.description}
            >
              {example.label}
            </button>
          ))}
        </div>

        {/* Input fields */}
        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-[13px] font-medium text-secondary mb-1.5">
              Contract address
            </label>
            <input
              type="text"
              value={contractAddress}
              onChange={(e) => setContractAddress(e.target.value)}
              placeholder="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
              className="w-full font-mono text-[13px] px-4 py-2.5 border border-border rounded bg-white focus:outline-none focus:border-foreground/30 transition-colors"
              spellCheck={false}
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-secondary mb-1.5">
              Calldata{" "}
              <span className="font-normal text-secondary/60">
                (selector + encoded params)
              </span>
            </label>
            <textarea
              value={calldata}
              onChange={(e) => setCalldata(e.target.value)}
              placeholder="0xa9059cbb000000000000000000000000..."
              rows={3}
              className="w-full font-mono text-[13px] px-4 py-2.5 border border-border rounded bg-white focus:outline-none focus:border-foreground/30 transition-colors resize-none break-all"
              spellCheck={false}
            />
          </div>
          <button
            onClick={interpret}
            disabled={isRunning || !contractAddress || !calldata}
            className="px-5 py-2 text-[14px] font-medium bg-foreground text-background rounded hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {isRunning ? "Interpreting..." : "Interpret transaction"}
          </button>
        </div>

        {/* Steps output */}
        {steps.length > 0 && (
          <div className="border border-border rounded-lg px-6 py-5">
            {steps.map((step, i) => {
              switch (step.kind) {
                case "spec-match":
                  return <SpecMatchStep key={i} step={step} />;
                case "function-id":
                  return <FunctionIdStep key={i} step={step} />;
                case "calldata-decode":
                  return <CalldataDecodeStep key={i} step={step} />;
                case "intent-eval":
                  return <IntentEvalStep key={i} step={step} />;
                case "address-resolution":
                  return <AddressResolutionStep key={i} step={step} />;
                case "verified-display":
                  return <VerifiedDisplayStep key={i} step={step} />;
              }
            })}
          </div>
        )}
      </section>

      {/* ── Verification ── */}
      <section className="mb-16">
        <h2 className="text-lg font-semibold tracking-tight mb-4">
          Proof verification
        </h2>
        <div className="leading-relaxed space-y-4 text-[15px]">
          <p>
            The clear signing process is not just template matching. It is backed
            by a Groth16 zero-knowledge proof. The proof guarantees:
          </p>
          <div className="border border-border rounded px-6 py-5 space-y-3 text-[14px]">
            <div>
              <strong className="font-medium">Calldata commitment:</strong>{" "}
              <span className="text-secondary">
                Poseidon(selector, params...) = calldataHash
              </span>
            </div>
            <div>
              <strong className="font-medium">Output commitment:</strong>{" "}
              <span className="text-secondary">
                Poseidon(templateId, holes...) = outputHash
              </span>
            </div>
            <div>
              <strong className="font-medium">Circuit proves:</strong>{" "}
              <span className="text-secondary">
                The DSL program, given these params, produces exactly this
                template with these hole values
              </span>
            </div>
          </div>
          <p>
            The circuit is compiled from the same Lean DSL definition shown
            above. A Circom circuit of ~600 constraints is generated for each
            function, and the Groth16 proof can be verified on-chain for ~200K
            gas.
          </p>
          <p className="text-secondary text-[14px]">
            Proof size: 128 bytes. Constraint counts: ERC-20 transfer ~605,
            approve ~605, transferFrom ~653.
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="mt-12 pt-8 border-t border-border">
        <p className="text-secondary text-sm">
          Part of the{" "}
          <ExternalLink href="https://verity.labs">Verity</ExternalLink>{" "}
          benchmark initiative.{" "}
          <ExternalLink href="https://github.com/lfglabs-dev/verity/pull/1677">
            View the Provable Intent DSL
          </ExternalLink>
        </p>
      </footer>
    </main>
  );
}
