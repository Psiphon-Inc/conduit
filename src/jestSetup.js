jest.mock("@react-native-async-storage/async-storage", () =>
    require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// Silence timedLog's console.log output, which production init paths
// (migrations, auth, clerk, inproxy, hosted experience) would otherwise
// spray across the jest output. Only timedLog is replaced so genuinely
// unexpected console.log calls still surface in test runs.
jest.mock("@/src/common/utils", () => ({
    ...jest.requireActual("@/src/common/utils"),
    timedLog: jest.fn(),
}));

jest.mock("expo-secure-store", () => {
    let mockStore = {};

    return {
        getItemAsync: jest.fn((key) => Promise.resolve(mockStore[key] || null)),
        setItemAsync: jest.fn((key, value) => {
            mockStore[key] = value;
            return Promise.resolve();
        }),
        deleteItemAsync: jest.fn((key) => {
            delete mockStore[key];
            return Promise.resolve();
        }),
        // Reset helper for tests
        __resetStore: () => {
            mockStore = {};
        },
    };
});

jest.mock("react-native-purchases", () => {
    const purchasesMock = {
        configure: jest.fn(),
        logIn: jest.fn(),
        getCustomerInfo: jest.fn(),
        addCustomerInfoUpdateListener: jest.fn(),
        removeCustomerInfoUpdateListener: jest.fn(),
        restorePurchases: jest.fn(),
        purchasePackage: jest.fn(),
    };

    return {
        __esModule: true,
        default: purchasesMock,
    };
});

jest.mock("@clerk/clerk-expo", () => {
    const React = require("react");

    return {
        ClerkProvider: ({ children }) =>
            React.createElement(React.Fragment, null, children),
        useSSO: () => ({
            startSSOFlow: jest.fn(async () => ({
                createdSessionId: "sess_test",
                setActive: jest.fn(async () => {}),
                authSessionResult: { type: "success" },
            })),
        }),
        useAuth: () => ({
            getToken: jest.fn(async () => "clerk.jwt.token"),
        }),
        useSignIn: () => ({
            isLoaded: true,
            setActive: jest.fn(async () => {}),
            signIn: {
                create: jest.fn(),
                prepareFirstFactor: jest.fn(),
                attemptFirstFactor: jest.fn(),
            },
        }),
        useSignUp: () => ({
            isLoaded: true,
            setActive: jest.fn(async () => {}),
            signUp: {
                create: jest.fn(),
                prepareEmailAddressVerification: jest.fn(),
                attemptEmailAddressVerification: jest.fn(),
            },
        }),
    };
});

jest.mock("expo-linking", () => ({
    createURL: jest.fn((path = "") => `conduit://${path.replace(/^\//, "")}`),
}));

jest.mock("expo-network", () => ({
    useNetworkState: jest.fn(() => ({
        isConnected: true,
        isInternetReachable: true,
    })),
}));
