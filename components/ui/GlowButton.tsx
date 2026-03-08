"use client";

import { motion } from "framer-motion";
import Link from "next/link";

interface GlowButtonProps {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}

export function GlowButton({ href, children, variant = "primary" }: GlowButtonProps) {
  if (variant === "secondary") {
    return (
      <Link
        href={href}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-white/10 text-text-muted hover:text-text-primary hover:border-white/20 transition-all duration-200 font-inter text-sm font-medium"
      >
        {children}
      </Link>
    );
  }

  return (
    <motion.div
      className="relative inline-block"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Pulsing glow behind button */}
      <motion.div
        className="absolute inset-0 rounded-lg"
        style={{
          background: "linear-gradient(135deg, #3b82f6, #06b6d4)",
          filter: "blur(8px)",
        }}
        animate={{ opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
      <Link
        href={href}
        className="relative inline-flex items-center gap-2 px-6 py-3 rounded-lg font-syne font-semibold text-white text-sm"
        style={{ background: "linear-gradient(135deg, #3b82f6, #06b6d4)" }}
      >
        {children}
      </Link>
    </motion.div>
  );
}
