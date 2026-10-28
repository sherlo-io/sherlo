#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * The version of the connection's message set. It repeats SHERLO_PROTOCOL_VERSION in
 * src/sealedCore/seam.ts, and the app says it in every `hello`.
 */
static const NSInteger SHERLO_PROTOCOL_VERSION = 1;

/**
 * THE APP'S ONE CONNECTION: a WebSocket to whoever drives the app - the runner in a test run, the
 * bundler for `sherlo open` and `sherlo capture`.
 *
 * Written on Network.framework's C API, which App Transport Security does not govern, so it reaches
 * the Mac's loopback and a bundler on the network with no key in the app's Info.plist.
 *
 * Its first message on every connection is `hello`. After a drop it dials the same address again,
 * for as long as the process lives, and says `hello` again. A message sent while the socket is down
 * waits, in order, behind that `hello`; past MOST_LOG_LINES_WAITING log lines waiting, a new log
 * line is dropped.
 */
@interface SherloLine : NSObject

/**
 * The address the runner handed at launch, from the process arguments only
 * (`-sherloAddress ws://127.0.0.1:<port>/sherlo/line`, a simctl launch argument), never from user
 * defaults. Nil when none was handed, or when its host is not this machine. That loopback rule is
 * for this address alone: the line itself dials whatever address it is given, such as the bundler's
 * on the local network.
 */
+ (nullable NSString *)addressHandedAtLaunch;

/**
 * Whether a Sherlo run can follow, the one gate for native code a shipped app must never run
 * (Android: SherloAnswersGate.runCanFollow): in a debug build, where Storybook and a capture open
 * by a reload in the same process; outside default mode; or when the runner handed its address at
 * launch. A release app in default mode launched with no address is never touched.
 */
+ (BOOL)runCanFollowInDefaultMode:(BOOL)defaultMode;

/**
 * @param address The ws:// address to dial
 * @param nativeVersion The SDK's native version, for every hello
 * @param onMessage Called with each message the connection brings, on the line's own queue
 */
- (instancetype)initWithAddress:(NSString *)address
                  nativeVersion:(nullable NSString *)nativeVersion
                      onMessage:(void (^)(NSDictionary *message))onMessage;

/** The address this line dials. */
@property (nonatomic, readonly) NSString *address;

/** Dial the address. */
- (void)open;

/** Send one message. */
- (void)send:(NSDictionary *)message;

/**
 * Send one message and block until the socket took it, or `timeoutSeconds` passed. YES when the
 * socket took it. For an app about to die: the caller's thread waits, never the line's queue.
 */
- (BOOL)sendAndWaitUntilSent:(NSDictionary *)message timeoutSeconds:(double)timeoutSeconds;

/** The version of the SDK's JavaScript, said in every hello from now on. */
- (void)setJsVersion:(nullable NSString *)jsVersion;

@end

NS_ASSUME_NONNULL_END
