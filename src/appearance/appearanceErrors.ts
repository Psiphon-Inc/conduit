import { recordClientEventProblem } from "@/src/telemetry/clientEvents";

/** Failed appearance operations retain their original cause without displaying it. */
export class AppAppearanceError extends Error {
    /** Stable error tag for appearance failures, independent of platform exceptions. */
    readonly _tag = "AppAppearanceError";

    /** The operation is safe diagnostic context; raw storage/OS errors are not. */
    constructor(
        readonly operation:
            | "read-preference"
            | "write-preference"
            | "system-chrome",
        cause: unknown,
    ) {
        super(`App appearance operation failed: ${operation}`, { cause });
    }
}

/** Records allowlisted diagnostics, retaining the unlogged cause in the returned error. */
export function reportAppearanceFailure(
    operation: AppAppearanceError["operation"],
    cause: unknown,
): AppAppearanceError {
    const error = new AppAppearanceError(operation, cause);
    // Storage exceptions can include values, paths or other app data. Never pass
    // their message/stack/cause to the logger or user-facing picker warning.
    recordClientEventProblem("appearance.operation_failed", error.message, {
        operation,
        causeKind:
            cause instanceof TypeError
                ? "TypeError"
                : cause instanceof Error
                  ? "Error"
                  : "unknown",
    });
    return error;
}
