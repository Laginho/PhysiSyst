export interface PolarVelocity {
  magnitude: number
  angleDeg: number
}

export interface CartesianVelocity {
  vx: number
  vy: number
}

export function cartesianToPolar(vx: number, vy: number): PolarVelocity {
  const magnitude = Math.hypot(vx, vy)
  if (magnitude === 0) return { magnitude: 0, angleDeg: 0 }
  return { magnitude, angleDeg: (Math.atan2(vy, vx) * 180) / Math.PI }
}

export function polarToCartesian(magnitude: number, angleDeg: number): CartesianVelocity {
  const rad = (angleDeg * Math.PI) / 180
  return { vx: magnitude * Math.cos(rad), vy: magnitude * Math.sin(rad) }
}
