jest.mock("@react-native-async-storage/async-storage", () =>
    require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

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
