#import "SherloLine.h"
#import <Network/Network.h>

static NSString *const LOG_TAG = @"SherloModule:SherloLine";

/** The launch argument the runner hands the address in: `-sherloAddress <url>`. */
static NSString *const ADDRESS_ARGUMENT = @"-sherloAddress";

/** The hosts an address handed at launch may name: this machine, and nothing else. */
static NSArray<NSString *> *loopbackHosts(void) {
    return @[ @"127.0.0.1", @"localhost", @"::1" ];
}

/** How many log lines may wait for the socket; a newer one is dropped. */
static const NSUInteger MOST_LOG_LINES_WAITING = 1000;

/** How long the line waits after a drop before it dials again. */
static const double REDIAL_AFTER_SECONDS = 0.5;

/** One message waiting for the socket, as the JSON it goes out as. */
@interface SherloWaitingMessage : NSObject
@property (nonatomic, strong) NSData *json;
@property (nonatomic, assign) BOOL isLogLine;
/** Told whether the socket took the message; nil when nobody waits on it. */
@property (nonatomic, copy, nullable) void (^whenSent)(BOOL wasSent);
@end

@implementation SherloWaitingMessage
@end

@implementation SherloLine {
    /** Every field below is read and written on this queue only. */
    dispatch_queue_t _queue;
    /** The connection being dialled or open; nil between a drop and the next dial. */
    nw_connection_t _connection;
    /** YES once the open connection has said hello; messages then go straight out. */
    BOOL _isOpen;
    NSMutableArray<SherloWaitingMessage *> *_waitingMessages;
    NSUInteger _logLinesWaiting;
    NSString *_nativeVersion;
    NSString *_jsVersion;
    void (^_onMessage)(NSDictionary *message);
}

+ (NSString *)addressHandedAtLaunch {
    NSArray<NSString *> *arguments = NSProcessInfo.processInfo.arguments;
    NSUInteger argumentIndex = [arguments indexOfObject:ADDRESS_ARGUMENT];
    if (argumentIndex == NSNotFound || argumentIndex + 1 >= arguments.count) {
        return nil;
    }

    NSString *address = arguments[argumentIndex + 1];
    NSString *host = [NSURL URLWithString:address].host;
    if (!host || ![loopbackHosts() containsObject:host]) {
        NSLog(@"[%@] Ignoring the address handed at launch: its host is not this machine (%@)", LOG_TAG, address);
        return nil;
    }
    return address;
}

- (instancetype)initWithAddress:(NSString *)address
                  nativeVersion:(NSString *)nativeVersion
                      onMessage:(void (^)(NSDictionary *message))onMessage {
    self = [super init];
    if (self) {
        _address = [address copy];
        _nativeVersion = [nativeVersion copy];
        _onMessage = [onMessage copy];
        _waitingMessages = [NSMutableArray array];
        _queue = dispatch_queue_create("io.sherlo.line", DISPATCH_QUEUE_SERIAL);
    }
    return self;
}

// Network.framework's WebSocket client arrived in iOS 13, while the SDK supports older targets. Every
// method that touches it is marked iOS 13, and the two ways in (open, send) check the iPhone first:
// below iOS 13 the line opens nothing and refuses every message at once.

- (void)open {
    if (@available(iOS 13.0, *)) {
        dispatch_async(_queue, ^{
            [self dial];
        });
    } else {
        NSLog(@"[%@] Sherlo's connection needs iOS 13 or later, so it was not opened", LOG_TAG);
    }
}

- (void)setJsVersion:(NSString *)jsVersion {
    NSString *version = [jsVersion copy];
    dispatch_async(_queue, ^{
        self->_jsVersion = version;
    });
}

- (void)send:(NSDictionary *)message {
    [self send:message whenSent:nil];
}

- (BOOL)sendAndWaitUntilSent:(NSDictionary *)message timeoutSeconds:(double)timeoutSeconds {
    dispatch_semaphore_t sendFinished = dispatch_semaphore_create(0);
    __block BOOL wasSent = NO;
    [self send:message whenSent:^(BOOL socketTookIt) {
        wasSent = socketTookIt;
        dispatch_semaphore_signal(sendFinished);
    }];

    dispatch_time_t deadline = dispatch_time(DISPATCH_TIME_NOW, (int64_t)(timeoutSeconds * NSEC_PER_SEC));
    BOOL finishedInTime = dispatch_semaphore_wait(sendFinished, deadline) == 0;
    return finishedInTime && wasSent;
}

#pragma mark - Sending

- (void)send:(NSDictionary *)message whenSent:(void (^)(BOOL wasSent))whenSent {
    NSData *json = [NSJSONSerialization dataWithJSONObject:message options:0 error:nil];
    if (!json) {
        NSLog(@"[%@] A message that is not JSON was not sent: %@", LOG_TAG, message[@"action"]);
        if (whenSent) whenSent(NO);
        return;
    }
    BOOL isLogLine = [message[@"action"] isEqual:@"log"];

    if (@available(iOS 13.0, *)) {
        [self sendOrKeepWaiting:json isLogLine:isLogLine whenSent:whenSent];
    } else {
        if (whenSent) whenSent(NO);
    }
}

/** Write the message on the open connection, or keep it until the connection says hello. */
- (void)sendOrKeepWaiting:(NSData *)json
                isLogLine:(BOOL)isLogLine
                 whenSent:(void (^)(BOOL wasSent))whenSent API_AVAILABLE(ios(13.0)) {
    dispatch_async(_queue, ^{
        if (self->_isOpen) {
            [self write:json whenSent:whenSent];
            return;
        }

        if (isLogLine && self->_logLinesWaiting >= MOST_LOG_LINES_WAITING) {
            if (whenSent) whenSent(NO);
            return;
        }

        SherloWaitingMessage *waitingMessage = [SherloWaitingMessage new];
        waitingMessage.json = json;
        waitingMessage.isLogLine = isLogLine;
        waitingMessage.whenSent = whenSent;
        [self->_waitingMessages addObject:waitingMessage];
        if (isLogLine) self->_logLinesWaiting++;
    });
}

/** Write one text frame on the open connection. On the line's queue. */
- (void)write:(NSData *)json whenSent:(void (^)(BOOL wasSent))whenSent API_AVAILABLE(ios(13.0)) {
    nw_protocol_metadata_t textFrame = nw_ws_create_metadata(nw_ws_opcode_text);
    nw_content_context_t context = nw_content_context_create("sherlo-message");
    nw_content_context_set_metadata_for_protocol(context, textFrame);

    dispatch_data_t content = dispatch_data_create(json.bytes, json.length, _queue, DISPATCH_DATA_DESTRUCTOR_DEFAULT);
    nw_connection_send(_connection, content, context, true, ^(nw_error_t error) {
        if (whenSent) whenSent(error == nil);
    });
}

/** Say hello, then send what waited for the socket, in order. On the line's queue. */
- (void)sayHelloAndSendWhatWaited API_AVAILABLE(ios(13.0)) {
    NSDictionary *hello = @{
        @"action" : @"hello",
        @"protocolVersion" : @(SHERLO_PROTOCOL_VERSION),
        @"nativeVersion" : _nativeVersion ?: [NSNull null],
        @"jsVersion" : _jsVersion ?: [NSNull null],
    };
    [self write:[NSJSONSerialization dataWithJSONObject:hello options:0 error:nil] whenSent:nil];
    _isOpen = YES;

    NSArray<SherloWaitingMessage *> *waitedInOrder = [_waitingMessages copy];
    [_waitingMessages removeAllObjects];
    _logLinesWaiting = 0;
    for (SherloWaitingMessage *waitingMessage in waitedInOrder) {
        [self write:waitingMessage.json whenSent:waitingMessage.whenSent];
    }
}

#pragma mark - Dialling

/** Open a connection to the address. On the line's queue. */
- (void)dial API_AVAILABLE(ios(13.0)) {
    nw_endpoint_t endpoint = nw_endpoint_create_url(self.address.UTF8String);
    if (!endpoint) {
        NSLog(@"[%@] Not a URL, so never dialled: %@", LOG_TAG, self.address);
        return;
    }

    nw_parameters_t parameters = nw_parameters_create_secure_tcp(NW_PARAMETERS_DISABLE_PROTOCOL,
                                                                 NW_PARAMETERS_DEFAULT_CONFIGURATION);
    nw_protocol_options_t webSocketOptions = nw_ws_create_options(nw_ws_version_13);
    nw_ws_options_set_auto_reply_ping(webSocketOptions, true);
    nw_protocol_stack_t protocolStack = nw_parameters_copy_default_protocol_stack(parameters);
    nw_protocol_stack_prepend_application_protocol(protocolStack, webSocketOptions);

    nw_connection_t connection = nw_connection_create(endpoint, parameters);
    _connection = connection;
    nw_connection_set_queue(connection, _queue);

    __weak SherloLine *weakSelf = self;
    nw_connection_set_state_changed_handler(connection, ^(nw_connection_state_t state, nw_error_t error) {
        [weakSelf connection:connection changedTo:state];
    });
    nw_connection_start(connection);
}

/** On the line's queue. */
- (void)connection:(nw_connection_t)connection changedTo:(nw_connection_state_t)state API_AVAILABLE(ios(13.0)) {
    // A connection already dropped still reports its own end; the line has moved on from it.
    if (connection != _connection) return;

    switch (state) {
        case nw_connection_state_ready:
            [self sayHelloAndSendWhatWaited];
            [self receiveNextMessageOn:connection];
            break;
        case nw_connection_state_waiting:
        case nw_connection_state_failed:
        case nw_connection_state_cancelled:
            [self dropAndDialAgain];
            break;
        default:
            break;
    }
}

/** Let the connection go, and dial the same address again shortly. On the line's queue. */
- (void)dropAndDialAgain API_AVAILABLE(ios(13.0)) {
    nw_connection_t droppedConnection = _connection;
    _connection = nil;
    _isOpen = NO;
    if (droppedConnection) nw_connection_cancel(droppedConnection);

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(REDIAL_AFTER_SECONDS * NSEC_PER_SEC)), _queue, ^{
        if (!self->_connection) [self dial];
    });
}

#pragma mark - Receiving

/** On the line's queue. */
- (void)receiveNextMessageOn:(nw_connection_t)connection API_AVAILABLE(ios(13.0)) {
    __weak SherloLine *weakSelf = self;
    nw_connection_receive_message(connection, ^(dispatch_data_t content, nw_content_context_t context, bool isComplete, nw_error_t error) {
        SherloLine *line = weakSelf;
        if (!line || connection != line->_connection) return;

        nw_ws_opcode_t opcode = [line opcodeOf:context];
        BOOL serverClosedTheSocket = opcode == nw_ws_opcode_close || (context && nw_content_context_get_is_final(context));
        if (error || serverClosedTheSocket) {
            [line dropAndDialAgain];
            return;
        }

        // Pings are answered by Network.framework itself; only text frames carry messages.
        if (content && opcode == nw_ws_opcode_text) [line handOver:(NSData *)content];
        [line receiveNextMessageOn:connection];
    });
}

/** The WebSocket frame's opcode, or invalid when the context carries no frame. */
- (nw_ws_opcode_t)opcodeOf:(nw_content_context_t)context API_AVAILABLE(ios(13.0)) {
    if (!context) return nw_ws_opcode_invalid;

    nw_protocol_definition_t webSocket = nw_protocol_copy_ws_definition();
    nw_protocol_metadata_t frame = nw_content_context_copy_protocol_metadata(context, webSocket);
    return frame ? nw_ws_metadata_get_opcode(frame) : nw_ws_opcode_invalid;
}

- (void)handOver:(NSData *)json {
    id message = [NSJSONSerialization JSONObjectWithData:json options:0 error:nil];
    if (![message isKindOfClass:[NSDictionary class]]) {
        NSLog(@"[%@] A message that is not a JSON object was ignored", LOG_TAG);
        return;
    }
    _onMessage(message);
}

@end
