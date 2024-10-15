import { NativeModules } from "react-native";

export interface ConduitModuleAPI {
    toggleInProxy: (
        maxClients: number,
        limitUpstreamBytesPerSecond: number,
        limitDownstreamBytesPerSecond: number,
        privateKey: string,
    ) => Promise<void>;
    paramsChanged: (params: { [key: string]: any }) => Promise<void>;
    addListener: (eventName: string) => void;
    removeListeners: (count: number) => void;
    sendFeedback: () => Promise<null | string>;
    logInfo: (tag: string, msg: string) => void;
    logError: (tag: string, msg: string) => void;
    logWarn: (tag: string, msg: string) => void;
}

export const ConduitModule: ConduitModuleAPI = NativeModules.ConduitModule;
