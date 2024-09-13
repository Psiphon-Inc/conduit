import { z } from "zod";

export const Uint8Array32 = z
    .instanceof(Uint8Array)
    .refine((value) => value.length === 32, {
        message: "Uint8Array must have length 32",
    });
