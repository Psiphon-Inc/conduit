import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { PersonalCompartmentIdSchema } from "@/src/pairing/compartmentId";

/** Native pairing configuration readback; application is not broker health. */
export const PairingConfigurationSchema = z.discriminatedUnion("status", [
    z.object({
        revision: z.number().int().nonnegative().safe(),
        status: z.literal("applying"),
        personalCompartmentId: z.null(),
    }),
    z.object({
        revision: z.number().int().nonnegative().safe(),
        status: z.enum(["persisted", "applied"]),
        personalCompartmentId: PersonalCompartmentIdSchema.nullable(),
    }),
]);

/** Private identity received from native, never from the hosted snapshot. */
export type PairingConfiguration = z.infer<typeof PairingConfigurationSchema>;

/** In-memory native readback only; do not persist this query across app launches. */
export const NATIVE_PAIRING_CONFIGURATION_QUERY_KEY = [
    "nativePairingConfiguration",
] as const;

/** Subscribe to acknowledged Android pairing identity, including while a modal is open. */
export function useNativePairingConfiguration(): PairingConfiguration | null {
    return useQuery<PairingConfiguration | null>({
        queryKey: NATIVE_PAIRING_CONFIGURATION_QUERY_KEY,
        queryFn: () => null,
        enabled: false,
        initialData: null,
        gcTime: Infinity,
    }).data;
}
