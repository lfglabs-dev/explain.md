"use client";

import { useState, useEffect } from "react";
import katex from "katex";
import { ExternalLinkIcon } from "../components";

function K({ tex }: { tex: string }) {
  const html = katex.renderToString(tex, { throwOnError: false });
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function Term({
  tex,
  label,
  detail,
  align = "center",
}: {
  tex: string;
  label: string;
  detail: string;
  align?: "left" | "center" | "right";
}) {
  const posClass =
    align === "left"
      ? "left-0"
      : align === "right"
        ? "right-0"
        : "left-1/2 -translate-x-1/2";

  return (
    <span className="relative group/term">
      <span className="cursor-help border-b border-dotted border-secondary/40 group-hover/term:border-foreground/60 transition-colors">
        <K tex={tex} />
      </span>
      <span className={`pointer-events-none absolute ${posClass} bottom-full mb-2 opacity-0 group-hover/term:opacity-100 transition-opacity duration-150 z-10 w-max max-w-[260px]`}>
        <span className="block bg-foreground text-background text-[12px] leading-snug font-sans rounded px-3 py-2 shadow-lg">
          <span className="font-semibold">{label}</span>
          <br />
          {detail}
        </span>
      </span>
    </span>
  );
}

export function Guarantee() {
  const [showEnglish, setShowEnglish] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowEnglish(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="py-6">
      <button
        onClick={() => setShowEnglish(!showEnglish)}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-secondary hover:text-foreground transition-colors cursor-pointer mb-4"
      >
        <svg
          viewBox="0 0 24 24"
          className="w-[13px] h-[13px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m5 8 6 6" />
          <path d="m4 14 6-6 2-3" />
          <path d="M2 5h12" />
          <path d="M7 2h1" />
          <path d="m22 22-5-10-5 10" />
          <path d="M14 18h6" />
        </svg>
        {showEnglish ? "Switch to math" : "Switch to English"}
      </button>

      {/* Grid overlay: both children occupy the same cell,
          container height = max(child heights). */}
      <div className="grid text-center [&>*]:col-start-1 [&>*]:row-start-1">
        <div
          className="flex items-center justify-center transition-opacity duration-200 text-2xl md:text-3xl"
          style={{
            opacity: showEnglish ? 0 : 1,
            pointerEvents: showEnglish ? "none" : "auto",
          }}
          aria-hidden={showEnglish}
        >
          <span className="inline-flex items-baseline gap-[0.15em] flex-wrap justify-center">
            <Term
              tex="\texttt{locked}"
              label="VaultHub._locked()"
              detail="ETH that cannot be withdrawn from the vault"
              align="left"
            />
            <K tex="\;\cdot\;(" />
            <Term
              tex="\texttt{BP}"
              label="TOTAL_BASIS_POINTS"
              detail="= 10,000"
            />
            <K tex="-" />
            <Term
              tex="\texttt{RR}"
              label="reserveRatioBP"
              detail="The vault's reserve ratio (e.g. 3000 = 30%)"
            />
            <K tex=")\;\geq\;" />
            <Term
              tex="\texttt{liability}"
              label="liabilityShares → ETH"
              detail="stETH owed to depositors, via getPooledEthBySharesRoundUp"
              align="right"
            />
            <K tex="\;\cdot\;" />
            <Term
              tex="\texttt{BP}"
              label="TOTAL_BASIS_POINTS"
              detail="= 10,000"
              align="right"
            />
          </span>
        </div>
        <div
          className="flex items-center justify-center transition-opacity duration-200"
          style={{
            opacity: showEnglish ? 1 : 0,
            pointerEvents: showEnglish ? "auto" : "none",
          }}
          aria-hidden={!showEnglish}
        >
          <p className="text-xl md:text-2xl leading-snug">
            stETH can only be minted if the vault&apos;s total locked
            ETH exceeds its total minted stETH.
          </p>
        </div>
      </div>

      <div className="text-right mt-4">
        <a
          href="https://github.com/lfglabs-dev/verity-benchmark/blob/main/Benchmark/Cases/Lido/VaulthubLocked/Specs.lean#L30-L52"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700 hover:text-emerald-900 transition-colors cursor-pointer"
        >
          View Lean
          <ExternalLinkIcon />
        </a>
      </div>
    </div>
  );
}
