export const IMPORTED_CONSTANT = 'imported-constant-value';

export class ImportedHelper {
  format(value: string) {
    return `formatted:${value}`;
  }
}

// Stands in for "another module's real export" (LJ-06).
export const otherModuleReal = {
  getRegion: () => 'us-east',
};
