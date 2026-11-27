export const btnBase =
  'inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e09f5a]/60 disabled:opacity-40 disabled:pointer-events-none cursor-pointer';

export const btnPrimary =
  `${btnBase} rounded-xl bg-[#d95d4e] hover:bg-[#c84d3e] text-white font-semibold shadow-md shadow-[#d95d4e]/20 hover:shadow-lg hover:shadow-[#d95d4e]/30`;

export const btnSecondary =
  `${btnBase} rounded-xl bg-white/[0.05] hover:bg-white/[0.11] text-[#f3efe6] border border-white/10 hover:border-white/20`;

export const btnGhost =
  `${btnBase} rounded-xl bg-transparent hover:bg-white/[0.07] text-[#9ca3af] hover:text-[#f3efe6] border border-transparent`;

export const btnDanger =
  `${btnBase} rounded-xl bg-white/[0.04] hover:bg-[#d95d4e]/20 text-[#9ca3af] hover:text-[#e87c6f] border border-white/10 hover:border-[#d95d4e]/45`;

export const btnIcon =
  `${btnBase} w-8 h-8 rounded-lg bg-[#13151c] hover:bg-white/[0.1] border border-white/10 hover:border-white/20 text-[#9ca3af] hover:text-[#f3efe6] shrink-0`;
