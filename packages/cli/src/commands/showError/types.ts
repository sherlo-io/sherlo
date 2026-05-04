export type ProjectType = 'expo' | 'rn';
export type Platform = 'ios' | 'android';

export interface ParsedFrame {
  fnName: string;
  file: string | null;
  line: number | null;
  col: number | null;
}

export interface JsErrorJson {
  name: string;
  message: string;
  stack: ParsedFrame[];
  componentStack: ParsedFrame[];
  digest: string | null;
  cause: { name: string; message: string; stack: ParsedFrame[] } | null;
  hasExpo: boolean;
  engine?: 'hermes' | 'jsc';
}

export type SymbolicateStats = {
  totalFrames: number;
  resolvedFrames: number;
};
