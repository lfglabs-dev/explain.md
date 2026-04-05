"use client";

import React, { useCallback, useEffect, useState } from "react";

// ─── Slide Data ─────────────────────────────────────────────────────────────

type Slide = {
  label: string;
  title: string;
  bullets?: string[];
  footnote?: string;
  image?: string;
  code?: string;
  variant?: "title" | "demo" | "default";
};

const slides: Slide[] = [
  // ── Act 1: The Problem ──
  {
    label: "The Problem",
    title: "Smart contracts are too smart",
    image: "/slides/wojak.jpg",
    variant: "title",
  },

  // ── Act 2: The Solution ──
  {
    label: "The Solution",
    title: "Formally defined transaction interpretation",
    bullets: [
      "We extended the Verity smart contract language with an intent DSL",
      "Each contract function gets a formal spec that maps calldata to natural language",
      "The spec is written in Lean 4, so the mapping itself is provable",
    ],
  },
  {
    label: "The Solution",
    title: "A scriptable, provable ERC-7730",
    bullets: [
      "The DSL supports conditions, loops, predicates",
      "But evaluating this DSL is too heavy for an edge device like a Ledger",
    ],
    code: `intent approve(spender : address, amount : uint256) where
  when amount == maxUint256 =>
    emit "Approve {spender} to spend unlimited USDC"
  otherwise =>
    emit "Approve {spender} to spend {amount:fixed decimals} USDC"`,
  },
  {
    label: "The Solution",
    title: "So we built a ZK circuit compiler",
    bullets: [
      "Same Lean spec compiles to a Groth16 circuit",
      "Proves this template matches the calldata, the Ledger fills the holes",
    ],
    image: "/slides/ledger.png",
  },

  // ── Act 3: How It Works ──
  {
    label: "",
    title: "How it works",
    variant: "title",
  },
  {
    label: "How It Works",
    title: "Step 1: Spec lookup",
    bullets: [
      "The contract address is matched against the veryclear.eth ENS registry",
      "Each entry maps a contract to a compiled spec (e.g. ERC20, UniswapV2)",
      "The registry is on-chain, verifiable by anyone",
    ],
  },
  {
    label: "How It Works",
    title: "Step 2: Function identification",
    bullets: [
      "The 4-byte selector identifies which function is being called",
      "0xa9059cbb = transfer, 0x095ea7b3 = approve",
      "The spec binding maps each selector to an intent function",
    ],
  },
  {
    label: "How It Works",
    title: "Step 3: Calldata decoding",
    bullets: [
      "Raw bytes are decoded into typed parameters using the ABI",
      "uint256 values split into 128-bit limbs to fit the ZK field",
      "Addresses, booleans, arrays each have their own decoding logic",
    ],
  },
  {
    label: "How It Works",
    title: "Step 4: Intent evaluation",
    bullets: [
      "The DSL program selects a template based on parameter values",
      'amount == MAX_UINT256? "Approve unlimited" : "Approve {amount}"',
      "Template index matches the circuit output for proof consistency",
    ],
  },
  {
    label: "How It Works",
    title: "Step 5: Address resolution",
    bullets: [
      "Raw addresses in the template are resolved against the spec registry",
      "0x7a250d... becomes UniswapV2Router",
      "Unknown addresses stay truncated (0xAbCd...1234)",
    ],
  },
  {
    label: "How It Works",
    title: "Step 6: Proof generation",
    bullets: [
      "The browser generates a Groth16 proof over BLS12-381",
      "Circuit computes Poseidon(selector, params) and Poseidon(templateId, holes) internally",
      "Proof size: ~400 bytes, generation: ~500ms in browser",
    ],
  },
  {
    label: "How It Works",
    title: "Step 7: Hardware verification",
    bullets: [
      "The proof + verification key + intent text are sent to the Ledger Nano S+",
      "The Ledger displays the intent, user confirms with physical buttons",
      "On approve: 4-pairing Groth16 check on ARM Cortex-M35P secure element",
    ],
    footnote: "The browser generates, the hardware verifies. Zero trust required.",
  },

  // ── Closing ──
  {
    label: "Demo",
    title: "explain.md/clear-signing",
    variant: "demo",
  },
];

// ─── Slide Component ────────────────────────────────────────────────────────

function highlightCode(line: string): React.ReactNode {
  if (line.trim() === "") return "\u00A0";
  // Simple Lean-like syntax highlighting
  return line
    .replace(
      /\b(intent|when|otherwise|emit|where)\b/g,
      '<kw>$1</kw>'
    )
    .replace(
      /\b(address|uint256|bool)\b/g,
      '<ty>$1</ty>'
    )
    .replace(
      /"([^"]*)"/g,
      '<str>"$1"</str>'
    )
    .split(/(<kw>.*?<\/kw>|<ty>.*?<\/ty>|<str>.*?<\/str>)/)
    .map((part, i) => {
      if (part.startsWith('<kw>')) return <span key={i} className="text-[#907aa9]">{part.slice(4, -5)}</span>;
      if (part.startsWith('<ty>')) return <span key={i} className="text-[#ea9d34]">{part.slice(4, -5)}</span>;
      if (part.startsWith('<str>')) return <span key={i} className="text-[#56949f]">{part.slice(5, -6)}</span>;
      return part;
    });
}

function SlideView({ slide }: { slide: Slide }) {
  if (slide.variant === "demo") {
    return (
      <>
        <p className="mb-6 text-sm uppercase tracking-[0.3em] opacity-40">
          {slide.label}
        </p>
        <h1 className="font-serif text-7xl italic">{slide.title}</h1>
      </>
    );
  }

  return (
    <>
      <p className="mb-6 text-sm uppercase tracking-[0.3em] opacity-40">
        {slide.label}
      </p>
      <h1
        className={`max-w-3xl text-center font-serif leading-tight ${
          slide.variant === "title" ? "text-5xl" : "text-4xl"
        }`}
      >
        {slide.title}
      </h1>
      {slide.image && (
        <img
          src={slide.image}
          alt=""
          className="mt-8 max-h-[40vh] rounded-lg"
        />
      )}
      {slide.code && (
        <pre className="mt-8 bg-[#faf4ed] rounded-lg px-6 py-5 text-[15px] leading-[1.7] font-mono max-w-2xl overflow-x-auto">
          {slide.code.split("\n").map((line, i) => (
            <div key={i}>
              {highlightCode(line)}
            </div>
          ))}
        </pre>
      )}
      {slide.bullets && (
        <ul className="mt-10 max-w-2xl space-y-5 text-center font-serif text-xl leading-relaxed opacity-70">
          {slide.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      {slide.footnote && (
        <p className="mt-12 max-w-xl text-center text-sm italic opacity-40">
          {slide.footnote}
        </p>
      )}
    </>
  );
}

// ─── Presentation ───────────────────────────────────────────────────────────

export default function SlidesPage() {
  const [current, setCurrent] = useState(0);

  const next = useCallback(() => {
    setCurrent((c) => Math.min(c + 1, slides.length - 1));
  }, []);

  const prev = useCallback(() => {
    setCurrent((c) => Math.max(c - 1, 0));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        next();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const slide = slides[current];

  return (
    <div
      className="flex h-screen w-screen select-none flex-col items-center justify-center px-12 cursor-pointer"
      onClick={next}
    >
      <SlideView slide={slide} />

      {/* Slide indicator */}
      <div className="fixed bottom-8 flex gap-2">
        {slides.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 w-1.5 rounded-full transition-opacity ${
              i === current ? "bg-foreground opacity-60" : "bg-foreground opacity-15"
            }`}
          />
        ))}
      </div>

      {/* Slide number */}
      <div className="fixed bottom-8 right-8 font-mono text-xs opacity-30">
        {current + 1} / {slides.length}
      </div>
    </div>
  );
}
