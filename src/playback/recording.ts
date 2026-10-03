/** Includes the initial state; once full, the live world keeps running. */
export const RECORDING_CAP = 600

export class Recording<T> {
  private records: T[]

  constructor(first: T) {
    this.records = [first]
  }

  get length(): number {
    return this.records.length
  }

  at(index: number): T | undefined {
    return this.records[index]
  }

  push(record: T): boolean {
    if (this.length >= RECORDING_CAP) return false
    this.records.push(record)
    return true
  }

  reset(first: T): void {
    this.records = [first]
  }
}
