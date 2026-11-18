/** Includes the initial state; once full, playback pauses at the last record. */
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
