import { PersonalCompartmentId } from "@/src/pairing/compartmentId";

export async function loadAndroidPersonalCompartmentId(): Promise<PersonalCompartmentId | null> {
    return null;
}

export async function persistAndroidPersonalCompartmentId(
    _personalCompartmentId: PersonalCompartmentId,
): Promise<void> {}

export function parsePersonalCompartmentId(
    _value: string | null,
): PersonalCompartmentId | null {
    return null;
}
