#import <RCTAppDelegate.h>
#import <UIKit/UIKit.h>
#import <Expo/Expo.h>

#if TARGET_OS_MACCATALYST
@interface AppDelegate : RCTAppDelegate
#else
@interface AppDelegate : EXAppDelegateWrapper
#endif

@end
