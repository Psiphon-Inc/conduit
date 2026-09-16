import {
    PersonalCompartmentId,
    PersonalCompartmentReconciliationResult,
} from "@/src/pairing/compartmentId";

/** Web has no persisted Android identity. */
export async function loadAndroidPersonalCompartmentId(): Promise<PersonalCompartmentId | null> {
    return null;
}

/** Android-only reconciliation has no persistence effects on web. */
export async function reconcileAndroidPersonalCompartmentId(
    _personalCompartmentId: PersonalCompartmentId,
    _isCurrent: () => boolean,
): Promise<PersonalCompartmentReconciliationResult> {
    return "unavailable";
}

/** Android identity parsing is unavailable on web. */
export function parsePersonalCompartmentId(
    _value: string | null,
): PersonalCompartmentId | null {
    return null;
}
