/** Small deterministic PRNG (mulberry32), seeded once per shuffle call. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Seeded Fisher-Yates shuffle of [0, count) — a fresh permutation per seed. */
function shuffledIndices(seed: number, count: number): number[] {
  const rng = mulberry32(seed)
  const indices = Array.from({ length: count }, (_, i) => i)
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j]!, indices[i]!]
  }
  return indices
}

/**
 * Which loading-message index to show at `tick`, for a given `seed` and
 * catalog `count`. `tick` walks a permutation of [0, count): it visits every
 * index once per `count` ticks, and — because a permutation's values are
 * pairwise distinct — two consecutive ticks (the wrap from the last tick back
 * to the first included) are never the same index.
 */
export function messageAt(seed: number, tick: number, count: number): number {
  if (count <= 1) return 0
  const order = shuffledIndices(Math.floor(seed), count)
  return order[((tick % count) + count) % count]!
}
