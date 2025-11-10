/**
 * Utility module with class export
 * Used for testing class mocking functionality
 */
export class DataProcessor {
  private multiplier: number;

  constructor(multiplier: number = 1) {
    this.multiplier = multiplier;
  }

  process(value: number): number {
    return value * this.multiplier;
  }

  getMultiplier(): number {
    return this.multiplier;
  }

  static createDefault(): DataProcessor {
    return new DataProcessor(1);
  }
}

export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }
}

