import { PersonalCompartmentId } from "@/src/pairing/compartmentId";

export async function loadAndroidPersonalCompartmentId(): Promise<PersonalCompartmentId | null> {
    return null;
}

export async function persistAndroidPersonalCompartmentId(
    _personalCompartmentId: PersonalCompartmentId,
): Promise<void> {}

/** Android-only reconciliation has no persistence effects on web. */
export async function reconcileAndroidPersonalCompartmentId(
    _personalCompartmentId: PersonalCompartmentId,
    _isCurrent: () => boolean,
): Promise<"committed" | "stale" | "unavailable"> {
    return "stale";
}

export function parsePersonalCompartmentId(
    _value: string | null,
): PersonalCompartmentId | null {
    return null;
}
