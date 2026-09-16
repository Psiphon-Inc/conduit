import { reportAppearanceFailure } from "@/src/appearance/appearanceErrors";

test("appearance diagnostics retain the original cause without logging storage or OS details", () => {
    const cause = new Error("Private storage contents: token=do-not-log");
    // Logging is the observable boundary under test; record the existing console
    // sink rather than mocking the client-event module or inventing a new service.
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
    const eventLog = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
        const error = reportAppearanceFailure("write-preference", cause);
        expect(error.cause).toBe(cause);
        expect(error._tag).toBe("AppAppearanceError");
        const properties = {
            operation: "write-preference",
            causeKind: "Error",
            message: "App appearance operation failed: write-preference",
            error: {
                name: "Error",
                message: "App appearance operation failed: write-preference",
            },
        };
        expect(errorLog.mock.calls).toEqual([
            ["[client-event-error]", "appearance.operation_failed", properties],
        ]);
        expect(eventLog.mock.calls).toEqual([
            ["[client-event]", "appearance.operation_failed", properties],
        ]);
    } finally {
        errorLog.mockRestore();
        eventLog.mockRestore();
    }
});
