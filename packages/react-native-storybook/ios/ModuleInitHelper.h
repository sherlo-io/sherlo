#import <Foundation/Foundation.h>
#import <React/RCTBridge.h>

@interface ModuleInitHelper : NSObject

+ (void)initialize:(NSString **)syncDirectoryPathRef modeRef:(NSString **)modeRef configRef:(NSDictionary **)configRef errorHandler:(void(^)(NSString *, id))errorHandler;
+ (void)setupKeyboardSwizzlingIfNeeded:(NSString *)mode;

@end 