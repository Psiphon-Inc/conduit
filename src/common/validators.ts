/*
 * Copyright (c) 2024, Psiphon Inc.
 * All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */
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
