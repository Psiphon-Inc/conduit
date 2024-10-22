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

RCT_EXTERN_METHOD(paramsChanged:(NSInteger)maxClients
                  limitUpstream:(NSInteger)limitUpstream
                  limitDownstream:(NSInteger)limitDownstream
                  privateKey:(NSString *_Nullable)privateKey
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(sendFeedback:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup {
    // This module does not required access to UIKit.
    return NO;
}

@end
