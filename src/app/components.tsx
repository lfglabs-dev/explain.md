"use client";

import React from "react";

/* ─── Layout ─── */

export function Section({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`mb-20 ${className}`}>{children}</section>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold tracking-tight mb-4">{children}</h2>
  );
}

/* ─── Icons ─── */

const iconProps = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: "1.5",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function ExternalLinkIcon({ className = "w-[13px] h-[13px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`inline ${className} ml-0.5`} {...iconProps}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

/* ─── Links ─── */

export function ExternalLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`underline underline-offset-3 hover:text-foreground transition-colors ${className}`}
    >
      {children}
      <ExternalLinkIcon />
    </a>
  );
}

/* ─── Disclosure ─── */

export function Disclosure({
  title,
  children,
  className = "",
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen || undefined}
      className={`border border-border rounded text-[14px] leading-relaxed group/disc ${className}`}
    >
      <summary className="px-6 py-4 font-medium cursor-pointer select-none list-none flex items-center justify-between [&::-webkit-details-marker]:hidden">
        {title}
        <svg
          viewBox="0 0 24 24"
          className="w-4 h-4 text-secondary transition-transform group-open/disc:rotate-180"
          {...iconProps}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div className="px-6 pb-5">{children}</div>
    </details>
  );
}

/* ─── Code ─── */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-3 right-3 p-1.5 text-secondary/50 hover:text-secondary cursor-pointer"
      title="Copy to clipboard"
    >
      <span className="relative block w-4 h-4">
        <svg
          viewBox="0 0 24 24"
          className={`absolute inset-0 w-4 h-4 transition-all duration-200 ${copied ? "opacity-0 scale-50" : "opacity-100 scale-100"}`}
          {...iconProps}
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        <svg
          viewBox="0 0 24 24"
          className={`absolute inset-0 w-4 h-4 text-emerald-600 transition-all duration-200 ${copied ? "opacity-100 scale-100" : "opacity-0 scale-50"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    </button>
  );
}

export function CodeBlock({ children }: { children: string }) {
  return (
    <div className="relative">
      <pre className="bg-surface border border-border rounded px-5 py-4 pr-12 text-sm font-mono leading-relaxed overflow-x-auto">
        {children}
      </pre>
      <CopyButton text={children} />
    </div>
  );
}
