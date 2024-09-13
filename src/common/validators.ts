import { base64nopad } from "@scure/base";
import { z } from "zod";

export const Uint8Array32 = z
    .instanceof(Uint8Array)
    .refine((value) => value.length === 32, {
        message: "Uint8Array must have length 32",
    });

export const Base64Unpadded32Bytes = z
    .string()
    .refine((v) => base64nopad.decode(v).length === 32, {
        message: "string is not 32 bytes encoded as base64 (no padding)",
    });

export const Base64Unpadded64Bytes = z
    .string()
    .refine((v) => base64nopad.decode(v).length === 64, {
        message: "string is not 64 bytes encoded as base64 (no padding)",
    });
