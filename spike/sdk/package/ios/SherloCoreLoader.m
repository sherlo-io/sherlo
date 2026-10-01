#import "SherloCoreLoader.h"
#import <QuartzCore/QuartzCore.h>
#import <Security/Security.h>

// The compiled native core (SherloCore.xcframework). Its one header is sherlo_core.h; the three
// calls are declared here so the glue needs no header search path into the xcframework.
extern const char *sherlo_core_version(void);
extern int sherlo_core_abi(void);
extern int sherlo_core_count_different_pixels(const uint8_t *rgba_a, const uint8_t *rgba_b, int width, int height, double threshold);
static const int SUPPORTED_NATIVE_ABI = 1;

// The seam numbers this SDK speaks. A core whose header names another seam is never run.
static const NSInteger SUPPORTED_SEAM = 1;

// Spike test key (PKCS#1 RSAPublicKey DER, base64). The real one is Sherlo's release key.
static NSString *const SHERLO_CORE_PUBLIC_KEY =
    @"MIIBCgKCAQEAxwuNK/v8HC6O+kHl+0fZqKZfcsW1h+FzVjcMprkWI2J9P+Z4yezALy/lRiqIXz3eDoe31SmkUacYRninMOli0iRpuUAAf3RV21CQoX8Knfl4u4yFsNNB/j8dkJOxGm1QoqV3XOu78sJyO54KHnPWM33yknkyifv/QxC5fwdtuv11Z/ssmiXAVStZV7t9Cow2nFDMaPFdfA4N1hdWg6bbIUeazT4w2fLaCKYdyts1CXZiXjyUJp30c5+wyMXOVHnTbY3Ye1Ap8VsNFfwvrurZYaG3TxHWTbnasWOX4Xwns4SITw+Nq7QA1hQTTlpbrXd+vEMaUfulA1dr8yk79MdzDwIDAQAB";

@implementation SherloCoreLoader

+ (NSString *)loadCoreJson {
  CFTimeInterval start = CACurrentMediaTime();
  NSMutableDictionary *result = [NSMutableDictionary dictionary];
  NSString *refusal = nil;

  NSData *override = [self readOverrideRefusal:&refusal];
  if (override) {
    result[@"origin"] = @"override";
    result[@"source"] = [[NSString alloc] initWithData:override encoding:NSUTF8StringEncoding];
  } else {
    NSString *shippedPath = [[NSBundle bundleForClass:[SherloCoreLoader class]] pathForResource:@"sherlo-core" ofType:@"js" inDirectory:@"assets"];
    NSData *shipped = shippedPath ? [NSData dataWithContentsOfFile:shippedPath] : nil;
    if (shipped) {
      result[@"origin"] = @"shipped";
      result[@"source"] = [[NSString alloc] initWithData:shipped encoding:NSUTF8StringEncoding];
    } else {
      result[@"origin"] = @"none";
      refusal = refusal ?: @"no shipped core in the SDK";
    }
  }

  NSDictionary *header = result[@"source"] ? [self headerOf:result[@"source"]] : nil;
  result[@"version"] = header[@"version"] ?: [NSNull null];
  result[@"reason"] = refusal ?: [NSNull null];
  result[@"nativeMs"] = @((CACurrentMediaTime() - start) * 1000.0);
  result[@"nativeCore"] = [self nativeCoreSelfTest];

  NSLog(@"[sherlo-core] native picked %@ %@%@ in %.2f ms", result[@"origin"], header[@"version"] ?: @"-",
        refusal ? [NSString stringWithFormat:@" (%@)", refusal] : @"", [result[@"nativeMs"] doubleValue]);

  NSData *json = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
  return [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
}

/**
 * Calls the compiled C core once, so a launch shows it is linked and answering: its version, and
 * how many pixels of two 4x4 images it finds different (3 are changed, so the answer is 3).
 */
+ (NSString *)nativeCoreSelfTest {
  if (sherlo_core_abi() != SUPPORTED_NATIVE_ABI) {
    return [NSString stringWithFormat:@"refused: native core speaks ABI %d", sherlo_core_abi()];
  }
  uint8_t before[4 * 4 * 4];
  uint8_t after[4 * 4 * 4];
  memset(before, 255, sizeof(before));
  memset(after, 255, sizeof(after));
  for (int pixel = 0; pixel < 3; pixel++) {
    after[pixel * 4 + 0] = 0;
  }
  CFTimeInterval start = CACurrentMediaTime();
  int different = sherlo_core_count_different_pixels(before, after, 4, 4, 0.1);
  return [NSString stringWithFormat:@"native C %s, %d px differ, %.3f ms", sherlo_core_version(), different,
                                    (CACurrentMediaTime() - start) * 1000.0];
}

/** The override core's bytes, or nil with the reason it was refused (nil reason: there was none). */
+ (NSData *)readOverrideRefusal:(NSString **)refusal {
  NSString *documents = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject;
  NSString *directory = [documents stringByAppendingPathComponent:@"sherlo"];
  NSData *core = [NSData dataWithContentsOfFile:[directory stringByAppendingPathComponent:@"sherlo-core.js"]];
  if (!core) return nil;

  NSString *signatureText = [NSString stringWithContentsOfFile:[directory stringByAppendingPathComponent:@"sherlo-core.js.sig"] encoding:NSUTF8StringEncoding error:nil];
  NSData *signature = signatureText ? [[NSData alloc] initWithBase64EncodedString:[signatureText stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet] options:0] : nil;
  if (!signature) {
    *refusal = @"override has no signature";
    return nil;
  }
  if (![self isSignedBySherlo:core signature:signature]) {
    *refusal = @"override signature is not Sherlo's";
    return nil;
  }

  NSDictionary *header = [self headerOf:[[NSString alloc] initWithData:core encoding:NSUTF8StringEncoding]];
  if ([header[@"seam"] integerValue] != SUPPORTED_SEAM) {
    *refusal = [NSString stringWithFormat:@"override speaks seam %@, this SDK speaks %ld", header[@"seam"] ?: @"?", (long)SUPPORTED_SEAM];
    return nil;
  }
  return core;
}

+ (BOOL)isSignedBySherlo:(NSData *)data signature:(NSData *)signature {
  NSData *keyData = [[NSData alloc] initWithBase64EncodedString:SHERLO_CORE_PUBLIC_KEY options:0];
  NSDictionary *attributes = @{
    (id)kSecAttrKeyType : (id)kSecAttrKeyTypeRSA,
    (id)kSecAttrKeyClass : (id)kSecAttrKeyClassPublic,
  };
  CFErrorRef error = NULL;
  SecKeyRef key = SecKeyCreateWithData((__bridge CFDataRef)keyData, (__bridge CFDictionaryRef)attributes, &error);
  if (!key) return NO;
  BOOL verified = SecKeyVerifySignature(key, kSecKeyAlgorithmRSASignatureMessagePKCS1v15SHA256,
                                        (__bridge CFDataRef)data, (__bridge CFDataRef)signature, &error);
  CFRelease(key);
  return verified;
}

/** The JSON on the core's first line: `// sherlo-core {"version":"2.0.3","seam":1}`. */
+ (NSDictionary *)headerOf:(NSString *)source {
  NSString *prefix = @"// sherlo-core ";
  if (![source hasPrefix:prefix]) return nil;
  NSRange lineEnd = [source rangeOfString:@"\n"];
  if (lineEnd.location == NSNotFound) return nil;
  NSString *json = [source substringWithRange:NSMakeRange(prefix.length, lineEnd.location - prefix.length)];
  return [NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
}

@end
