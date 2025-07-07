export type BinariesInfo = {
  android?: BinaryInfo;
  ios?: BinaryInfo;
};

export type BinaryInfo = {
  hash: string;
  isExpoDev: boolean;
  fileName: string;
  s3Key: string;
  buildCreatedAt?: string;
  buildIndex?: number;
  sdkVersion?: string;
  url?: string;
};
