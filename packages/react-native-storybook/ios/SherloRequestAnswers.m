#import "SherloRequestAnswers.h"
#import <objc/runtime.h>
#import "SherloLine.h"

/** One rule, as src/mocking/networkNative hands it over, ready to match. */
@interface SherloAnswerRule : NSObject
@property (nonatomic, copy) NSString *method;
@property (nonatomic, copy) NSString *urlKind;
@property (nonatomic, copy) NSString *urlValue;
@property (nonatomic, strong) NSRegularExpression *urlPattern;
@property (nonatomic, assign) NSInteger status;
@property (nonatomic, copy) NSDictionary<NSString *, NSString *> *headers;
@property (nonatomic, copy) NSData *body;
@end

@implementation SherloAnswerRule

- (BOOL)matchesMethod:(NSString *)method url:(NSString *)url {
  if (self.method && ![self.method isEqualToString:method]) return NO;
  if ([self.urlKind isEqualToString:@"exact"]) return [url isEqualToString:self.urlValue];
  if ([self.urlKind isEqualToString:@"prefix"]) return [url hasPrefix:self.urlValue];
  if ([self.urlKind isEqualToString:@"regex"]) {
    return self.urlPattern && [self.urlPattern firstMatchInString:url options:0 range:NSMakeRange(0, url.length)] != nil;
  }
  return self.urlKind == nil;
}

@end

/** Everything in effect, replaced whole and never changed. */
@interface SherloAnswersInEffect : NSObject
@property (nonatomic, copy) NSArray<SherloAnswerRule *> *rules;
/** What a request no rule matches gets: @"passthrough", @"held" or @"refusal". */
@property (nonatomic, copy) NSString *unmatched;
@property (nonatomic, strong) NSURL *bundlerOrigin;
@end

@implementation SherloAnswersInEffect
@end

static SherloAnswersInEffect *answersInEffect = nil;
static NSObject *answersLock;

static SherloAnswersInEffect *SherloCurrentAnswers(void) {
  @synchronized (answersLock) { return answersInEffect; }
}

/** Whether `url` is the bundler's own: its host and port, or its port on another spelling of this machine. */
static BOOL SherloIsBundlerUrl(NSURL *url, NSURL *bundler) {
  if (!bundler || !url.host) return NO;
  NSArray *loopback = @[ @"localhost", @"127.0.0.1", @"::1", @"10.0.2.2" ];
  BOOL samePort = [url.port ?: @0 isEqualToNumber:bundler.port ?: @0];
  if (!samePort) return NO;
  if ([url.host caseInsensitiveCompare:bundler.host] == NSOrderedSame) return YES;
  return [loopback containsObject:url.host.lowercaseString] && [loopback containsObject:bundler.host.lowercaseString];
}

/** The rule that answers `request`, or nil. */
static SherloAnswerRule *SherloRuleFor(SherloAnswersInEffect *answers, NSURLRequest *request) {
  NSString *url = request.URL.absoluteString;
  NSString *method = (request.HTTPMethod ?: @"GET").uppercaseString;
  for (SherloAnswerRule *rule in answers.rules) {
    if ([rule matchesMethod:method url:url]) return rule;
  }
  return nil;
}

/** Whether the request is one native code answers, refuses or holds, rather than lets through. */
static BOOL SherloTakesRequest(NSURLRequest *request) {
  SherloAnswersInEffect *answers = SherloCurrentAnswers();
  if (!answers) return NO;
  BOOL letThrough = [answers.unmatched isEqualToString:@"passthrough"];
  if (letThrough && answers.rules.count == 0) return NO;

  NSString *scheme = request.URL.scheme.lowercaseString;
  if (![scheme isEqualToString:@"http"] && ![scheme isEqualToString:@"https"]) return NO;
  if (SherloIsBundlerUrl(request.URL, answers.bundlerOrigin)) return NO;

  return !letThrough || SherloRuleFor(answers, request) != nil;
}

@interface SherloAnswerProtocol : NSURLProtocol
@end

@implementation SherloAnswerProtocol

+ (BOOL)canInitWithRequest:(NSURLRequest *)request {
  return SherloTakesRequest(request);
}

+ (NSURLRequest *)canonicalRequestForRequest:(NSURLRequest *)request {
  return request;
}

- (void)startLoading {
  SherloAnswersInEffect *answers = SherloCurrentAnswers();
  SherloAnswerRule *rule = answers ? SherloRuleFor(answers, self.request) : nil;
  if (rule) {
    [self answerWith:rule];
    return;
  }
  // A held request is never answered, as fetch's is not in a discover launch.
  if ([answers.unmatched isEqualToString:@"held"]) return;

  // Refused, as fetch refuses it - or the rules changed since the request was taken, and it can
  // no longer reach the network from here.
  NSString *words = [NSString stringWithFormat:@"no mock rule matches %@ %@",
                                               (self.request.HTTPMethod ?: @"GET").uppercaseString,
                                               self.request.URL.absoluteString];
  NSError *refusal = [NSError errorWithDomain:NSURLErrorDomain
                                         code:NSURLErrorNotConnectedToInternet
                                     userInfo:@{NSLocalizedDescriptionKey : words}];
  [self.client URLProtocol:self didFailWithError:refusal];
}

- (void)answerWith:(SherloAnswerRule *)rule {
  NSMutableDictionary *headers = [NSMutableDictionary dictionaryWithDictionary:rule.headers];
  headers[@"Content-Length"] = [NSString stringWithFormat:@"%lu", (unsigned long)rule.body.length];
  NSHTTPURLResponse *response = [[NSHTTPURLResponse alloc] initWithURL:self.request.URL
                                                            statusCode:rule.status
                                                           HTTPVersion:@"HTTP/1.1"
                                                          headerFields:headers];

  [self.client URLProtocol:self didReceiveResponse:response cacheStoragePolicy:NSURLCacheStorageNotAllowed];
  [self.client URLProtocol:self didLoadData:rule.body];
  [self.client URLProtocolDidFinishLoading:self];
}

- (void)stopLoading {
  // Every answer is given at once in startLoading, so there is nothing in flight to stop.
}

@end

/** Put the answering protocol first in `configuration`, once. */
static void SherloPutProtocolFirst(NSURLSessionConfiguration *configuration) {
  NSMutableArray *protocols = [NSMutableArray arrayWithArray:configuration.protocolClasses ?: @[]];
  if ([protocols containsObject:[SherloAnswerProtocol class]]) return;
  [protocols insertObject:[SherloAnswerProtocol class] atIndex:0];
  configuration.protocolClasses = protocols;
}

// The getters' implementations from before ours, called by pointer. Another library that replaces
// the same getter (expo-dev-launcher does) may call ours with a `self` and a selector of its own;
// a call by selector after method_exchangeImplementations then crashes, a call by pointer does not.
typedef NSURLSessionConfiguration *(*SherloConfigurationGetter)(id, SEL);
static SherloConfigurationGetter originalDefaultConfiguration;
static SherloConfigurationGetter originalEphemeralConfiguration;

static NSURLSessionConfiguration *SherloDefaultConfiguration(id self, SEL _cmd) {
  NSURLSessionConfiguration *configuration = originalDefaultConfiguration(self, _cmd);
  SherloPutProtocolFirst(configuration);
  return configuration;
}

static NSURLSessionConfiguration *SherloEphemeralConfiguration(id self, SEL _cmd) {
  NSURLSessionConfiguration *configuration = originalEphemeralConfiguration(self, _cmd);
  SherloPutProtocolFirst(configuration);
  return configuration;
}

static SherloConfigurationGetter SherloReplaceClassMethod(Class cls, SEL selector, IMP replacement) {
  Method method = class_getClassMethod(cls, selector);
  return method ? (SherloConfigurationGetter)method_setImplementation(method, replacement) : NULL;
}

static SherloAnswerRule *SherloRuleOf(NSDictionary *json) {
  SherloAnswerRule *rule = [SherloAnswerRule new];
  if ([json[@"method"] isKindOfClass:[NSString class]]) rule.method = json[@"method"];

  NSDictionary *url = json[@"url"];
  if ([url isKindOfClass:[NSDictionary class]]) {
    rule.urlKind = url[@"kind"];
    rule.urlValue = url[@"value"];
    if ([rule.urlKind isEqualToString:@"regex"]) {
      NSRegularExpressionOptions options = [url[@"ignoreCase"] boolValue] ? NSRegularExpressionCaseInsensitive : 0;
      rule.urlPattern = [NSRegularExpression regularExpressionWithPattern:rule.urlValue options:options error:nil];
    }
  }

  rule.status = [json[@"status"] isKindOfClass:[NSNumber class]] ? [json[@"status"] integerValue] : 200;
  rule.headers = [json[@"headers"] isKindOfClass:[NSDictionary class]] ? json[@"headers"] : @{};
  NSString *body = [json[@"bodyBase64"] isKindOfClass:[NSString class]] ? json[@"bodyBase64"] : @"";
  rule.body = [[NSData alloc] initWithBase64EncodedString:body options:NSDataBase64DecodingIgnoreUnknownCharacters] ?: [NSData data];
  return rule;
}

@implementation SherloRequestAnswers

/**
 * Installed at launch only where a Sherlo run can follow, so a release app outside a test run
 * keeps Apple's own getters: when the runner handed an address, and in a debug build, where
 * Storybook and a capture open by a reload in the same process. At launch, because an image
 * library makes its one session as the app starts, before any JavaScript hands rules over. Any
 * other app installs it when JavaScript first hands rules over, which it does only in testing and
 * Storybook mode, so only sessions made after that meet the rules.
 */
static void SherloInstallAnswering(void) {
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    // NSURLConnection and +[NSURLSession sharedSession].
    [NSURLProtocol registerClass:[SherloAnswerProtocol class]];
    // Every session a library makes from the default or ephemeral configuration. A background
    // configuration takes no custom protocol, so a background download is never answered here.
    Class configurationClass = [NSURLSessionConfiguration class];
    originalDefaultConfiguration = SherloReplaceClassMethod(configurationClass, @selector(defaultSessionConfiguration), (IMP)SherloDefaultConfiguration);
    originalEphemeralConfiguration = SherloReplaceClassMethod(configurationClass, @selector(ephemeralSessionConfiguration), (IMP)SherloEphemeralConfiguration);
  });
}

+ (void)load {
  answersLock = [NSObject new];
  // No mode is read yet at load: a launch outside default mode installs it when its JavaScript
  // hands rules over (setRulesJson).
  if ([SherloLine runCanFollowInDefaultMode:YES]) SherloInstallAnswering();
}

+ (BOOL)setRulesJson:(NSString *)rulesJson {
  SherloInstallAnswering();
  NSData *data = [rulesJson dataUsingEncoding:NSUTF8StringEncoding];
  id parsed = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
  if (![parsed isKindOfClass:[NSDictionary class]]) return NO;

  SherloAnswersInEffect *answers = [SherloAnswersInEffect new];
  NSMutableArray *rules = [NSMutableArray array];
  for (id json in ([parsed[@"rules"] isKindOfClass:[NSArray class]] ? parsed[@"rules"] : @[])) {
    if ([json isKindOfClass:[NSDictionary class]]) [rules addObject:SherloRuleOf(json)];
  }
  answers.rules = rules;
  answers.unmatched = [parsed[@"unmatched"] isKindOfClass:[NSString class]] ? parsed[@"unmatched"] : @"passthrough";
  answers.bundlerOrigin = [parsed[@"bundlerOrigin"] isKindOfClass:[NSString class]] ? [NSURL URLWithString:parsed[@"bundlerOrigin"]] : nil;

  @synchronized (answersLock) { answersInEffect = answers; }
  return YES;
}

@end
