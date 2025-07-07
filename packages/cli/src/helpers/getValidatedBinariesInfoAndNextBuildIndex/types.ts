export type BinariesInfo = {
  android?: BinaryInfo;
  ios?: BinaryInfo;
};

export type BinaryInfo = {
  hash: string;
  isExpoDev: boolean;
  originalName: string;
  s3Key: string;
  buildCreatedAt?: string;
  buildIndex?: number;
  sdkVersion?: string;
  url?: string;
};
