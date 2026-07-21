import React from "react";

import { InproxyContextValue, InproxyParameters } from "@/src/inproxy/types";
import { getDefaultInproxyParameters } from "@/src/inproxy/utils";

const InproxyContext = React.createContext<InproxyContextValue | null>(null);

export function useInproxyContext(): InproxyContextValue {
    const value = React.useContext(InproxyContext);
    if (!value) {
        throw new Error(
            "useInproxyContext must be used within a InproxyProvider",
        );
    }

    return value;
}

export function InproxyProvider({ children }: { children: React.ReactNode }) {
    const [inproxyParameters, setInproxyParameters] =
        React.useState<InproxyParameters>(getDefaultInproxyParameters);

    const value = React.useMemo<InproxyContextValue>(
        () => ({
            inproxyParameters,
            isPersonalPairingReady: true,
            toggleInproxy: async () => {},
            sendFeedback: async () => {},
            selectInproxyParameters: async (params) => {
                setInproxyParameters(params);
            },
            logErrorToDiagnostic: (error) => {
                console.error("logErrorToDiagnostic: ", error.message);
            },
        }),
        [inproxyParameters],
    );

    return (
        <InproxyContext.Provider value={value}>
            {children}
        </InproxyContext.Provider>
    );
}
