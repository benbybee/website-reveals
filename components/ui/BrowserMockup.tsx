"use client";

import { motion } from "framer-motion";
import Image from "next/image";

interface BrowserMockupProps {
  src: string;
  alt: string;
  url: string;
  tag: string;
  liveUrl: string;
}

export function BrowserMockup({ src, alt, url, tag, liveUrl }: BrowserMockupProps) {
  return (
    <motion.div
      className="group relative rounded-xl overflow-hidden border border-white/8 bg-white/2"
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.3 }}
    >
      {/* Hover glow border */}
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10"
        style={{ boxShadow: "inset 0 0 0 1px rgba(59,130,246,0.5), 0 0 40px rgba(59,130,246,0.15)" }}
      />

      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border-b border-white/8">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/60" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
          <div className="w-3 h-3 rounded-full bg-green-500/60" />
        </div>
        <div className="flex-1 mx-2 px-3 py-1 rounded bg-white/5 font-mono text-xs text-text-muted truncate">
          {url}
        </div>
      </div>

      {/* Screenshot */}
      <div className="relative aspect-video overflow-hidden">
        <Image src={src} alt={alt} fill className="object-cover object-top" sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" />

        {/* Hover overlay with live link */}
        <div className="absolute inset-0 bg-obsidian/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-10">
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-lg font-syne font-semibold text-sm text-white"
            style={{ background: "linear-gradient(135deg, #3b82f6, #06b6d4)" }}
          >
            View Live Site →
          </a>
        </div>
      </div>

      {/* Site name + tag */}
      <div className="px-4 py-3 flex items-center justify-between">
        <span className="font-inter text-sm text-text-muted">{alt}</span>
        <span className="font-mono text-xs px-2 py-1 rounded bg-electric-blue/10 text-electric-blue border border-electric-blue/20">
          {tag}
        </span>
      </div>
    </motion.div>
  );
}
