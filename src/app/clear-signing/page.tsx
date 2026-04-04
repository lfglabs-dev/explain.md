"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { ExternalLink, Disclosure } from "../components";
import { findSpec } from "./engine/specs";
import { extractSelector, decodeCalldata } from "./engine/decoder";
import { evaluateIntent, collectAllTemplates } from "./engine/evaluator";
import {
  resolveAddressAsync,
  formatAddress,
  formatTokenAmount,
} from "./engine/resolver";
import {
  hasCircuit,
  generateAndVerifyProof,
  type ProofResult,
} from "./engine/prover";
import { EXAMPLES, type Example } from "./engine/examples";
import type {
  IntentSpec,
  Binding,
  EmittedTemplate,
  ResolvedHole,
  Value,
  Template,
  ResolvedAddress,
  ParamType,
  Stmt,
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
      resolutions: Map<string, ResolvedAddress | null>;
      pending: Set<string>;
    }
  | { kind: "verified-display"; text: string }
  | {
      kind: "proof";
      status: "pending" | "success" | "error" | "unavailable";
      result: ProofResult | null;
      error?: string;
    };

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function collectAddresses(holes: ResolvedHole[]): string[] {
  const addrs: string[] = [];
  for (const hole of holes) {
    if (hole.value.kind === "address") {
      addrs.push(hole.value.value);
    }
  }
  return addrs;
}

function renderIntent(
  emitted: EmittedTemplate,
  resolutions: Map<string, ResolvedAddress | null>
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

// ─── DSL Pretty-Print ───────────────────────────────────────────────────────

function specToString(spec: IntentSpec): string {
  const lines: string[] = [];
  lines.push(`intent_spec "${spec.contractName}" where`);

  for (const [name, value] of Object.entries(spec.constants)) {
    lines.push(
      `  const ${name} := ${value === 2n ** 256n - 1n ? "(2^256 - 1)" : value.toString()}`
    );
  }

  if (spec.constants.MAX_UINT256 !== undefined) {
    lines.push("");
    lines.push(`  predicate isMaxUint(v : uint256) :=`);
    lines.push(`    v == MAX_UINT256`);
  }

  for (const fn of spec.fns) {
    lines.push("");
    const params = fn.params
      .filter((p) => p.name !== "deadline")
      .map((p) => `${p.name} : ${p.type}`)
      .join(", ");
    lines.push(`  intent ${fn.name}(${params}) where`);

    function renderStmts(stmts: Stmt[], indent: number) {
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

  return lines.join("\n");
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
  spec,
}: {
  step: Extract<Step, { kind: "spec-match" }>;
  spec: IntentSpec | null;
}) {
  return (
    <StepContainer
      index={1}
      title="Spec matching"
      status={step.spec ? "success" : "error"}
    >
      {step.spec ? (
        <>
          <p>
            Contract{" "}
            <span className="font-mono text-[13px]">
              {step.address.slice(0, 6)}...{step.address.slice(-4)}
            </span>{" "}
            matches{" "}
            <strong className="font-semibold">{step.spec.contractName}</strong>{" "}
            spec
          </p>
          {spec && (
            <details className="mt-2">
              <summary className="text-[13px] text-secondary cursor-pointer select-none hover:text-foreground transition-colors">
                View spec definition
              </summary>
              <pre className="mt-2 bg-surface border border-border rounded px-4 py-3 text-[12px] font-mono leading-relaxed overflow-x-auto">
                {specToString(spec)}
              </pre>
            </details>
          )}
        </>
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
          {" \u2192 "}
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
              <span className="text-secondary">{"\u2192"}</span>
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
      </div>
    </StepContainer>
  );
}

function ProofStep({
  step,
}: {
  step: Extract<Step, { kind: "proof" }>;
}) {
  if (step.status === "unavailable") {
    return (
      <StepContainer index={7} title="Proof generation" status="success">
        <p className="text-secondary text-[13px]">
          No compiled circuit available for this function (only ERC-20 transfer
          and approve are compiled for this demo)
        </p>
      </StepContainer>
    );
  }

  if (step.status === "pending") {
    return (
      <StepContainer index={7} title="Proof generation" status="pending">
        <p className="text-secondary text-[13px]">
          Computing Poseidon commitments and generating Groth16 proof...
        </p>
      </StepContainer>
    );
  }

  if (step.status === "error") {
    return (
      <StepContainer index={7} title="Proof generation" status="error">
        <p className="text-red-600 text-[13px]">{step.error}</p>
      </StepContainer>
    );
  }

  const r = step.result!;
  return (
    <StepContainer index={7} title="Proof verification" status="success">
      <div className="space-y-3">
        <div className="bg-surface border border-border rounded px-4 py-3 font-mono text-[12px] space-y-1.5">
          <div>
            <span className="text-secondary">calldataCommitment: </span>
            <span className="break-all">
              {r.calldataCommitment.slice(0, 20)}...
            </span>
          </div>
          <div>
            <span className="text-secondary">outputCommitment: </span>
            <span className="break-all">
              {r.outputCommitment.slice(0, 20)}...
            </span>
          </div>
          <div>
            <span className="text-secondary">proof: </span>
            <span className="break-all">
              {"\u03C0"}
              {"_A"}[{r.proof.pi_a[0].slice(0, 12)}...],{" "}
              {"\u03C0"}
              {"_B"}[...],{" "}
              {"\u03C0"}
              {"_C"}[{r.proof.pi_c[0].slice(0, 12)}...]
            </span>
          </div>
        </div>

        <div
          className={`px-4 py-3 rounded-lg border-2 ${
            r.verified
              ? "border-emerald-300 bg-emerald-50"
              : "border-red-300 bg-red-50"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`text-lg ${r.verified ? "text-emerald-600" : "text-red-500"}`}
            >
              {r.verified ? "\u2713" : "\u2717"}
            </span>
            <span
              className={`text-[14px] font-medium ${
                r.verified ? "text-emerald-900" : "text-red-900"
              }`}
            >
              {r.verified ? "Proof verified" : "Proof verification failed"}
            </span>
          </div>
          <p
            className={`text-[12px] mt-1 ml-7 ${
              r.verified ? "text-emerald-700/70" : "text-red-700/70"
            }`}
          >
            Generated in {r.proveTimeMs.toFixed(0)}ms, verified in{" "}
            {r.verifyTimeMs.toFixed(0)}ms (605 constraints, BN254 curve)
          </p>
        </div>
      </div>
    </StepContainer>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ClearSigningPage() {
  const [contractAddress, setContractAddress] = useState("");
  const [calldata, setCalldata] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeSpec, setActiveSpec] = useState<IntentSpec | null>(null);
  const abortRef = useRef(false);

  const loadExample = useCallback((example: Example) => {
    abortRef.current = true; // Cancel any running interpretation
    setContractAddress(example.contractAddress);
    setCalldata(example.calldata);
    setSteps([]);
    setActiveSpec(null);
  }, []);

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

    // We'll need these across steps
    let spec: IntentSpec | null = null;
    let binding: Binding | null = null;
    let params: Map<string, Value> = new Map();
    let emitted: EmittedTemplate | null = null;
    let addresses: string[] = [];

    try {
      // Step 1: Spec matching
      await delay(300);
      spec = findSpec(contractAddress);
      addStep({ kind: "spec-match", spec, address: contractAddress });
      if (spec) setActiveSpec(spec);
      if (!spec) {
        setIsRunning(false);
        return;
      }

      // Step 2: Function identification
      await delay(400);
      const selector = extractSelector(calldata);
      binding =
        spec.bindings.find(
          (b) => b.selector.toLowerCase() === selector.toLowerCase()
        ) ?? null;
      addStep({ kind: "function-id", binding, selector });
      if (!binding) {
        setIsRunning(false);
        return;
      }

      // Step 3: Calldata decoding
      await delay(400);
      const intentFn = spec.fns.find(
        (f) => f.name === binding!.intentFnName
      );
      if (!intentFn) {
        setIsRunning(false);
        return;
      }
      params = decodeCalldata(calldata, intentFn, binding.paramMapping);
      const paramsList = Array.from(params.entries()).map(([name, value]) => ({
        name,
        type:
          intentFn.params.find((p) => p.name === name)?.type ??
          ("uint256" as ParamType),
        value,
      }));
      addStep({ kind: "calldata-decode", params: paramsList });

      // Step 4: Intent evaluation
      await delay(500);
      emitted = evaluateIntent(spec, binding, params);
      if (!emitted) {
        setIsRunning(false);
        return;
      }
      const allTemplates = collectAllTemplates(intentFn.body);
      addStep({ kind: "intent-eval", emitted, allTemplates });

      // Step 5: Address resolution (progressive)
      addresses = collectAddresses(emitted.holes);
      if (addresses.length > 0) {
        await delay(300);
        const resolutions = new Map<string, ResolvedAddress | null>();
        const pending = new Set(addresses.map((a) => a.toLowerCase()));
        for (const addr of addresses) {
          resolutions.set(addr.toLowerCase(), null);
        }
        addStep({ kind: "address-resolution", resolutions, pending });

        for (const addr of addresses) {
          if (abortRef.current) break;
          const resolved = await resolveAddressAsync(
            addr,
            500 + Math.random() * 400
          );
          const newResolutions = new Map(resolutions);
          newResolutions.set(addr.toLowerCase(), resolved);
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
      const finalResolutions = new Map<string, ResolvedAddress | null>();
      for (const addr of addresses) {
        const { resolveAddress } = await import("./engine/resolver");
        finalResolutions.set(addr.toLowerCase(), resolveAddress(addr));
      }
      const finalText = renderIntent(emitted, finalResolutions);
      addStep({ kind: "verified-display", text: finalText });

      // Step 7: Proof generation & verification
      if (!hasCircuit(spec.contractName, binding.intentFnName)) {
        addStep({
          kind: "proof",
          status: "unavailable",
          result: null,
        });
      } else {
        addStep({ kind: "proof", status: "pending", result: null });

        try {
          const result = await generateAndVerifyProof(
            spec.contractName,
            binding,
            params,
            emitted
          );
          setSteps((prev) => {
            const updated = [...prev];
            const idx = updated.findIndex((s) => s.kind === "proof");
            if (idx >= 0) {
              updated[idx] = { kind: "proof", status: "success", result };
            }
            return updated;
          });
        } catch (e) {
          setSteps((prev) => {
            const updated = [...prev];
            const idx = updated.findIndex((s) => s.kind === "proof");
            if (idx >= 0) {
              updated[idx] = {
                kind: "proof",
                status: "error",
                result: null,
                error: e instanceof Error ? e.message : String(e),
              };
            }
            return updated;
          });
        }
      }
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
      const timer = setTimeout(() => interpret(), 100);
      return () => clearTimeout(timer);
    }
  }, [calldata, contractAddress, interpret]);

  return (
    <main className="font-serif max-w-[680px] mx-auto px-6 py-20 md:py-32">
      <header className="mb-16">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight leading-tight">
          Clear Signing
        </h1>
        <p className="mt-3 text-secondary text-base leading-relaxed">
          Natural language interpretation of transaction intent, backed by
          zero-knowledge proofs.
        </p>
      </header>

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

      <Disclosure title="How it works" className="mb-16">
        <ol className="list-decimal list-inside space-y-2 text-[15px] leading-relaxed">
          <li>
            <strong className="font-medium">Spec matching</strong>: the
            contract address is matched to a known intent specification
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
            DSL program selects a template and fills its holes
          </li>
          <li>
            <strong className="font-medium">Address resolution</strong>:
            raw addresses are resolved to known names
          </li>
          <li>
            <strong className="font-medium">Verified display</strong>: the
            final sentence is shown
          </li>
          <li>
            <strong className="font-medium">Proof generation</strong>: a
            Groth16 proof is generated and verified in your browser
          </li>
        </ol>
      </Disclosure>

      <section className="mb-16">
        <h2 className="text-lg font-semibold tracking-tight mb-4">
          Try it
        </h2>

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

        {steps.length > 0 && (
          <div className="border border-border rounded-lg px-6 py-5">
            {steps.map((step, i) => {
              switch (step.kind) {
                case "spec-match":
                  return (
                    <SpecMatchStep key={i} step={step} spec={activeSpec} />
                  );
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
                case "proof":
                  return <ProofStep key={i} step={step} />;
              }
            })}
          </div>
        )}
      </section>

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
