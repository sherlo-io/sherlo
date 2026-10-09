#import "SherloCoreLoader.h"
#import "FileSystemHelper.h"
#import <Security/Security.h>

static NSString *const LOG_TAG = @"SherloModule:SherloCoreLoader";

static NSString *const CORE_FILE = @"sherlo-core.js";
static NSString *const SIGNATURE_FILE = @"sherlo-core.js.sig";
static NSString *const HEADER_PREFIX = @"// sherlo-core ";

// The seam this SDK speaks (SEAM_THIS_SDK_SPEAKS in src/sealedCore/loadSealedCore.ts). A core in
// the storage folder whose header names another seam is never run.
static const NSInteger SUPPORTED_SEAM = 1;

// THE TEST PUBLIC KEY: PKCS#1 RSAPublicKey DER, base64. Its private half is kept nowhere, so a
// local pack refuses every override core. A release refuses this key and stamps in Sherlo's real
// one (scripts/sealedCoreKey.js).
static NSString *const SHERLO_CORE_TEST_PUBLIC_KEY =
    @"MIIBCgKCAQEAxwuNK/v8HC6O+kHl+0fZqKZfcsW1h+FzVjcMprkWI2J9P+Z4yezALy/lRiqIXz3eDoe31SmkUacYRninMOli0iRpuUAAf3RV21CQoX8Knfl4u4yFsNNB/j8dkJOxGm1QoqV3XOu78sJyO54KHnPWM33yknkyifv/QxC5fwdtuv11Z/ssmiXAVStZV7t9Cow2nFDMaPFdfA4N1hdWg6bbIUeazT4w2fLaCKYdyts1CXZiXjyUJp30c5+wyMXOVHnTbY3Ye1Ap8VsNFfwvrurZYaG3TxHWTbnasWOX4Xwns4SITw+Nq7QA1hQTTlpbrXd+vEMaUfulA1dr8yk79MdzDwIDAQAB";

@implementation SherloCoreLoader

+ (NSString *)loadCoreJson {
  NSString *refusal = nil;
  NSString *origin = @"override";
  NSString *source = [self readOverrideOrRefusal:&refusal];

  if (!source) {
    origin = @"shipped";
    source = [self readShipped];
  }
  if (!source) {
    origin = @"none";
    refusal = refusal ?: @"no shipped core in the SDK";
  }

  if (refusal) {
    NSLog(@"[%@] %@ core runs: %@", LOG_TAG, origin, refusal);
  }

  NSDictionary *header = source ? [self headerOf:source] : nil;
  NSDictionary *answer = @{
    @"source" : source ?: [NSNull null],
    @"origin" : origin,
    @"version" : header[@"version"] ?: [NSNull null],
    @"reason" : refusal ?: [NSNull null],
  };
  NSData *json = [NSJSONSerialization dataWithJSONObject:answer options:0 error:nil];
  return [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
}

/** The override core's source, or nil, with why it was refused (no reason: there was none). */
+ (NSString *)readOverrideOrRefusal:(NSString **)refusal {
  FileSystemHelper *fileSystemHelper = [[FileSystemHelper alloc] init];
  NSData *core = [NSData dataWithContentsOfFile:[fileSystemHelper getFileUri:CORE_FILE]];
  if (!core) return nil;

  NSString *signatureText = [NSString stringWithContentsOfFile:[fileSystemHelper getFileUri:SIGNATURE_FILE]
                                                      encoding:NSUTF8StringEncoding
                                                         error:nil];
  NSString *trimmedSignature = [signatureText stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
  NSData *signature = trimmedSignature ? [[NSData alloc] initWithBase64EncodedString:trimmedSignature options:0] : nil;
  if (!signature) {
    *refusal = @"the core in the storage folder has no signature";
    return nil;
  }
  if (![self isSignedBySherlo:core signature:signature]) {
    *refusal = @"the core in the storage folder is not signed by Sherlo";
    return nil;
  }

  NSString *source = [[NSString alloc] initWithData:core encoding:NSUTF8StringEncoding];
  NSNumber *seam = [self headerOf:source][@"seam"];
  if (![seam isKindOfClass:[NSNumber class]] || seam.integerValue != SUPPORTED_SEAM) {
    *refusal = [NSString stringWithFormat:@"the core in the storage folder speaks seam %@, this SDK speaks %ld",
                                          seam ?: @"none", (long)SUPPORTED_SEAM];
    return nil;
  }
  return source;
}

/** The core shipped inside the SDK, in the pod's assets, or nil when the pack left it out. */
+ (NSString *)readShipped {
  NSBundle *podBundle = [NSBundle bundleForClass:[SherloCoreLoader class]];
  NSString *path = [podBundle pathForResource:@"sherlo-core" ofType:@"js" inDirectory:@"assets"];
  if (!path) return nil;
  return [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:nil];
}

/** Whether `signature` is a base64-decoded RSA-SHA256 signature of `data` by the key above. */
+ (BOOL)isSignedBySherlo:(NSData *)data signature:(NSData *)signature {
  NSData *keyData = [[NSData alloc] initWithBase64EncodedString:SHERLO_CORE_TEST_PUBLIC_KEY options:0];
  if (keyData.length == 0) return NO;

  NSDictionary *attributes = @{
    (id)kSecAttrKeyType : (id)kSecAttrKeyTypeRSA,
    (id)kSecAttrKeyClass : (id)kSecAttrKeyClassPublic,
  };
  SecKeyRef key = SecKeyCreateWithData((__bridge CFDataRef)keyData, (__bridge CFDictionaryRef)attributes, NULL);
  if (!key) return NO;

  BOOL verified = SecKeyVerifySignature(key, kSecKeyAlgorithmRSASignatureMessagePKCS1v15SHA256,
                                        (__bridge CFDataRef)data, (__bridge CFDataRef)signature, NULL);
  CFRelease(key);
  return verified;
}

/** The JSON on the core's first line: `// sherlo-core {"version":"2.0.3","seam":1}`. */
+ (NSDictionary *)headerOf:(NSString *)source {
  if (![source hasPrefix:HEADER_PREFIX]) return nil;
  NSRange lineEnd = [source rangeOfString:@"\n"];
  if (lineEnd.location == NSNotFound) return nil;

  NSString *json = [source substringWithRange:NSMakeRange(HEADER_PREFIX.length, lineEnd.location - HEADER_PREFIX.length)];
  id header = [NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
  return [header isKindOfClass:[NSDictionary class]] ? header : nil;
}

@end
