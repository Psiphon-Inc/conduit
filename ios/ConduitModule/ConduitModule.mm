/*
 * Copyright (c) 2024, Psiphon Inc.
 * All rights reserved.
 */

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(ConduitModule, RCTEventEmitter)

RCT_EXTERN_METHOD(toggleInProxy:(NSInteger)maxClients
                  limitUpstream:(NSInteger)limitUpstream
                  limitDownstream:(NSInteger)limitDownstream
                  privateKey:(NSString *_Nullable)privateKey
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(paramsChanged:(NSDictionary *)params
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(sendFeedback:(NSString *)inproxyId
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(logInfo:(NSString *)tag
                  msg:(NSString *)msg
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(logWarn:(NSString *)tag
                  msg:(NSString *)msg
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(logError:(NSString *)tag
                  msg:(NSString *)msg
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup {
    // This module does not required access to UIKit.
    return NO;
}

@end
