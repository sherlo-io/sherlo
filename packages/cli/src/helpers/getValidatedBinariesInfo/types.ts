export type BinariesInfo = {
  sdkVersion: string;
  android?: BinaryInfo;
  ios?: BinaryInfo;
};

type BinaryInfo = {
  hash: string;
  hasSherlo: boolean;
  isExpoDev: boolean;
  s3Key: string;
  binaryBuildCreatedAt?: string;
  binaryBuildIndex?: number;
  sdkVersion?: string;
  url?: string;
};
