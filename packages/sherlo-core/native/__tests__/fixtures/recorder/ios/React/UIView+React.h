// The recorder's React Native: the one thing InspectorHelper.m reads from a view, its reactTag.
// record.m implements it.
#import <UIKit/UIKit.h>

@interface UIView (React)
@property(nonatomic, copy) NSNumber *reactTag;
@end
