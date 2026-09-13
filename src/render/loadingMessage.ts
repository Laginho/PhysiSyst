/**
 * Which loading message to show at `tick`, given a random `seed` drawn once
 * per boot. A plain rotation: every index is visited once per `count` ticks,
 * and no two consecutive ticks share an index (for count ≥ 2). Pure.
 */
export function messageAt(seed: number, tick: number, count: number): number {
  if (count <= 0) return 0
  return (((seed + tick) % count) + count) % count
}
