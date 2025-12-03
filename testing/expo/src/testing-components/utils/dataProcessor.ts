/**
 * Data processor class for testing class mocking
 */
export class DataProcessor {
  private prefix: string;

  constructor(prefix: string = 'Processed') {
    this.prefix = prefix;
  }

  process(data: any): string {
    return `${this.prefix}: ${JSON.stringify(data)}`;
  }

  validate(data: any): boolean {
    return data !== null && data !== undefined;
  }

  transform(data: any, multiplier: number = 1): any {
    if (typeof data === 'number') {
      return data * multiplier;
    }
    return data;
  }

  static getInstance(): DataProcessor {
    return new DataProcessor('Static');
  }
}

export const createProcessor = (prefix: string) => new DataProcessor(prefix);
