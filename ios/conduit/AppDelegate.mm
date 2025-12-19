#import "AppDelegate.h"

#import <TargetConditionals.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  NSLog(@"[Conduit] didFinishLaunchingWithOptions START");
  self.moduleName = @"main";

  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  NSLog(@"[Conduit] Calling super didFinishLaunchingWithOptions");
  BOOL result = [super application:application didFinishLaunchingWithOptions:launchOptions];
  NSLog(@"[Conduit] super returned: %d", result);
  
#if TARGET_OS_MACCATALYST
  // On Mac Catalyst, configure window size restrictions after scene is connected
  dispatch_async(dispatch_get_main_queue(), ^{
    for (UIScene *scene in application.connectedScenes) {
      if ([scene isKindOfClass:[UIWindowScene class]]) {
        UIWindowScene *windowScene = (UIWindowScene *)scene;
        if (windowScene.sizeRestrictions != nil) {
          windowScene.sizeRestrictions.allowsFullScreen = false;
          windowScene.sizeRestrictions.maximumSize = CGSizeMake(540, 900);
          windowScene.sizeRestrictions.minimumSize = CGSizeMake(540, 900);
        }
      }
    }
  });
#else
  if (self.window.windowScene.sizeRestrictions == nil) {
    @throw [NSException exceptionWithName:@"Invalid State"
                                   reason:@"windowScence.sizeRestrictions is nil"
                                 userInfo:nil];
  }
  UISceneSizeRestrictions *sizeRestrictions = self.window.windowScene.sizeRestrictions;
  sizeRestrictions.allowsFullScreen = false;
  sizeRestrictions.maximumSize = CGSizeMake(540, 900);
  sizeRestrictions.minimumSize = CGSizeMake(540, 900);
#endif
  
  return result;
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  RCTBundleURLProvider *provider = [RCTBundleURLProvider sharedSettings];
  provider.jsLocation = @"localhost:8082";
  NSURL *url = [provider jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];
  NSLog(@"[Conduit] DEBUG bundle URL: %@", url);
  return url;
#else
  NSURL *bundleURL = [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
  NSLog(@"[Conduit] Bundle URL: %@", bundleURL);
  NSLog(@"[Conduit] Main bundle path: %@", [[NSBundle mainBundle] bundlePath]);
  NSLog(@"[Conduit] Resource path: %@", [[NSBundle mainBundle] resourcePath]);
  return bundleURL;
#endif
}

// Linking API
- (BOOL)application:(UIApplication *)application openURL:(NSURL *)url options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options {
  return [super application:application openURL:url options:options] || [RCTLinkingManager application:application openURL:url options:options];
}

// Universal Links
- (BOOL)application:(UIApplication *)application continueUserActivity:(nonnull NSUserActivity *)userActivity restorationHandler:(nonnull void (^)(NSArray<id<UIUserActivityRestoring>> * _Nullable))restorationHandler {
  BOOL result = [RCTLinkingManager application:application continueUserActivity:userActivity restorationHandler:restorationHandler];
  return [super application:application continueUserActivity:userActivity restorationHandler:restorationHandler] || result;
}

// Explicitly define remote notification delegates to ensure compatibility with some third-party libraries
- (void)application:(UIApplication *)application didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken
{
  return [super application:application didRegisterForRemoteNotificationsWithDeviceToken:deviceToken];
}

// Explicitly define remote notification delegates to ensure compatibility with some third-party libraries
- (void)application:(UIApplication *)application didFailToRegisterForRemoteNotificationsWithError:(NSError *)error
{
  return [super application:application didFailToRegisterForRemoteNotificationsWithError:error];
}

// Explicitly define remote notification delegates to ensure compatibility with some third-party libraries
- (void)application:(UIApplication *)application didReceiveRemoteNotification:(NSDictionary *)userInfo fetchCompletionHandler:(void (^)(UIBackgroundFetchResult))completionHandler
{
  return [super application:application didReceiveRemoteNotification:userInfo fetchCompletionHandler:completionHandler];
}

@end
