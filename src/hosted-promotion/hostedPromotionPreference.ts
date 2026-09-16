import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";

import { ASYNCSTORAGE_HOSTED_PROMOTION_DISMISSED_AT_KEY } from "@/src/constants";
import { recordClientEventProblem } from "@/src/telemetry/clientEvents";

/** Exact elapsed-time cooldown, not two calendar months. */
export const HOSTED_PROMOTION_COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000;

const DismissedAtSchema = z
    .number()
    .int()
    .nonnegative()
    .safe()
    .brand<"HostedPromotionDismissedAt">();
/** Parsed device-clock epoch milliseconds for a hosted promotion dismissal. */
export type HostedPromotionDismissedAt = z.infer<typeof DismissedAtSchema>;

/** Non-secret preference storage capability; defaults to the app's AsyncStorage convention. */
export interface HostedPromotionStorage {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
}

/** Storage failures retain their original cause without logging potentially private values. */
export class HostedPromotionStorageError extends Error {
    readonly _tag = "HostedPromotionStorageError";
    constructor(
        readonly operation: "read" | "write",
        cause: unknown,
    ) {
        super(`Hosted promotion preference ${operation} failed`, { cause });
    }
}

function reportStorageFailure(operation: "read" | "write", cause: unknown) {
    const error = new HostedPromotionStorageError(operation, cause);
    recordClientEventProblem(
        "hosted_promotion.preference_failed",
        error.message,
        {
            operation,
            causeKind:
                cause instanceof TypeError
                    ? "TypeError"
                    : cause instanceof Error
                      ? "Error"
                      : "unknown",
        },
    );
    return error;
}

/** Missing/invalid data is absence; failed reads stay distinct so callers can suppress promos. */
export type HostedPromotionPreference =
    | {
          readonly status: "ready";
          readonly dismissedAt: HostedPromotionDismissedAt | null;
      }
    | {
          readonly status: "unavailable";
          readonly error: HostedPromotionStorageError;
      };

/** Rejects malformed, unsafe, non-finite and future timestamps rather than suppressing forever. */
export function parseHostedPromotionDismissal(
    raw: string | null,
    now: number,
): HostedPromotionDismissedAt | null {
    if (raw === null || !/^(0|[1-9]\d*)$/.test(raw)) return null;
    const parsed = DismissedAtSchema.safeParse(Number(raw));
    return parsed.success && parsed.data <= now ? parsed.data : null;
}

/** Read and decode the saved dismissal at the time the storage read completes. */
export async function loadHostedPromotionPreference(
    storage: HostedPromotionStorage = AsyncStorage,
    now: () => number = Date.now,
): Promise<HostedPromotionPreference> {
    try {
        const raw = await storage.getItem(
            ASYNCSTORAGE_HOSTED_PROMOTION_DISMISSED_AT_KEY,
        );
        return {
            status: "ready",
            dismissedAt: parseHostedPromotionDismissal(raw, now()),
        };
    } catch (cause) {
        return {
            status: "unavailable",
            error: reportStorageFailure("read", cause),
        };
    }
}

/** Save one validated dismissal; the provider orders calls so the latest dismissal wins. */
export async function saveHostedPromotionDismissal(
    dismissedAt: HostedPromotionDismissedAt,
    storage: HostedPromotionStorage = AsyncStorage,
): Promise<
    | { readonly status: "saved" }
    | {
          readonly status: "unavailable";
          readonly error: HostedPromotionStorageError;
      }
> {
    try {
        await storage.setItem(
            ASYNCSTORAGE_HOSTED_PROMOTION_DISMISSED_AT_KEY,
            String(dismissedAt),
        );
        return { status: "saved" };
    } catch (cause) {
        return {
            status: "unavailable",
            error: reportStorageFailure("write", cause),
        };
    }
}
