export type BinariesInfo = {
  android?: BinaryInfo;
  ios?: BinaryInfo;
};

// TODO: potrzebne to? mamy BinaryInfo w @sherlo/api-types
export type BinaryInfo = {
  hash: string;
  isExpoDev: boolean;
  s3Key: string;
  buildCreatedAt?: string;
  buildIndex?: number;
  sdkVersion?: string;
  url?: string;
};
