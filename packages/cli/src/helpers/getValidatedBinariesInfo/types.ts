export type BinariesInfo = {
  android?: BinaryInfo;
  ios?: BinaryInfo;
};

export type BinaryInfo = {
  hash: string;
  isExpoDev: boolean;
  s3Key: string;
  binaryBuildCreatedAt?: string;
  binaryBuildIndex?: number;
  sdkVersion?: string;
  url?: string;
};
