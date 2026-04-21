/*
 * Copyright (c) 2026, Psiphon Inc.
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
import {
    MAX_NICKNAME_LENGTH,
    MIN_NICKNAME_LENGTH,
    countRunes,
    isValidNickname,
    migrateLegacyNickname,
    normalizeNickname,
    precisNickname,
} from "@/src/common/precis";

describe("PRECIS Nickname Transformer", () => {
    describe("protected names", () => {
        test("should return false for protected names", () => {
            expect(isValidNickname("admin")).toBe(false);
            expect(isValidNickname("root")).toBe(false);
            expect(isValidNickname("sEcUrItY")).toBe(false);
            expect(isValidNickname("SUPERUSER")).toBe(false);
            // 𝖆𝖉𝖒𝖎𝖓 and 𝓻𝓸𝓸𝓽 are not NFKC normalized, so should not pass
            expect(isValidNickname("𝖆𝖉𝖒𝖎𝖓")).toBe(false);
            expect(isValidNickname("𝓻𝓸𝓸𝓽")).toBe(false);
        });
    });
    describe("countRunes", () => {
        test("should return 0 for empty input", () => {
            expect(countRunes("")).toBe(0);
        });
        test("should return 1 for character that is a single UTF-16 code unit", () => {
            expect(countRunes("a")).toBe(1);
            expect(countRunes("1")).toBe(1);
            expect(countRunes("é")).toBe(1);
            expect(countRunes("ℕ")).toBe(1);
        });
        test("should return 1 for character that is a single code point but multiple UTF-16 code units", () => {
            expect(countRunes("𐒀")).toBe(1);
            expect("𐒀".length).toBe(2);
            expect(countRunes("𠀋")).toBe(1);
            expect("𠀋".length).toBe(2);
            expect(countRunes("𠜎")).toBe(1);
            expect("𠜎".length).toBe(2);
        });
    });

    describe("normalizeNickname", () => {
        test("should return empty string for empty input", () => {
            expect(normalizeNickname("")).toBe("");
            expect(normalizeNickname(null as unknown as string)).toBe("");
            expect(normalizeNickname(undefined as unknown as string)).toBe("");
        });

        test("should preserve ASCII characters", () => {
            expect(normalizeNickname("abcABC123")).toBe("abcABC123");
        });

        test("should map non-ASCII spaces to ASCII space", () => {
            // Non-breaking space (U+00A0)
            expect(normalizeNickname("hello\u00A0world")).toBe("hello world");
            // Ideographic space (U+3000)
            expect(normalizeNickname("hello\u3000world")).toBe("hello world");
            // En space (U+2002)
            expect(normalizeNickname("hello\u2002world")).toBe("hello world");
        });

        test("should map apostrophe-like punctuation to ASCII apostrophe", () => {
            expect(normalizeNickname("O\u2019Connor")).toBe("O'Connor");
            expect(normalizeNickname("d\u02BCangelo")).toBe("d'angelo");
        });

        test("should remove spaces at beginning and end", () => {
            expect(normalizeNickname("  hello  ")).toBe("hello");
            expect(normalizeNickname("\u00A0hello\u3000")).toBe("hello");
        });

        test("should reduce multiple spaces to a single space", () => {
            expect(normalizeNickname("hello    world")).toBe("hello world");
            expect(normalizeNickname("hello\u00A0\u3000world")).toBe(
                "hello world",
            );
        });

        test("should map fullwidth ASCII variants to ASCII", () => {
            // Fullwidth 'A' (U+FF21) to ASCII 'A' (U+0041)
            expect(normalizeNickname("\uFF21\uFF22\uFF23")).toBe("ABC");
            // Fullwidth '1' (U+FF11) to ASCII '1' (U+0031)
            expect(normalizeNickname("\uFF11\uFF12\uFF13")).toBe("123");
        });

        test("should apply Unicode normalization (NFKC)", () => {
            // 'é' as e + combining acute accent vs single é character
            const combinedE = "e\u0301"; // e + combining acute accent
            const singleE = "é"; // single é character

            expect(normalizeNickname(combinedE)).toBe(singleE);

            // Mathematical double-struck letters
            const doublestruck = "ℕℚℝℤ"; // double-struck N, Q, R, Z
            const regularLetters = "NQRZ"; // regular letters
            expect(normalizeNickname(doublestruck)).toBe(regularLetters);

            // Superscript and subscript numbers
            const superscript = "x²y³z₁";
            const regularSuperscripts = "x2y3z1";
            expect(normalizeNickname(superscript)).toBe(regularSuperscripts);

            // Full-width Latin letters and symbols
            const fullWidth = "Ｈｅｌｌｏ　Ｗｏｒｌｄ！";
            const regularWidth = "Hello World!";
            expect(normalizeNickname(fullWidth)).toBe(regularWidth);

            // Common ligatures
            const ligatures = "ﬁﬂ";
            const regularLigatures = "fifl";
            expect(normalizeNickname(ligatures)).toBe(regularLigatures);

            // Circled letters and numbers
            const circled = "①②③ⓐⓑⓒ";
            const regularCircled = "123abc";
            expect(normalizeNickname(circled)).toBe(regularCircled);

            // Various compatibility characters from different Unicode blocks
            const compatibility = "ℹ℡№℉℃";
            const regularCompat = "iTELNo°F°C";
            expect(normalizeNickname(compatibility)).toBe(regularCompat);

            // Mix of characters requiring different normalization types
            const mixed = "ℍé\u0301ｌｌｏ² ①";
            const normalizedMixed = "Hé́llo2 1";
            expect(normalizeNickname(mixed)).toBe(normalizedMixed);
        });

        test("should handle complex cases with multiple transformations", () => {
            // Combining multiple rules: fullwidth, spaces, normalization
            expect(normalizeNickname("\uFF21\u3000\u3000e\u0301\uFF11")).toBe(
                "A é1",
            );
        });

        test("should not trim whitespace if name editing is in progress", () => {
            expect(normalizeNickname(" Gregory ", true)).toBe(" Gregory ");
        });

        test("should reduce excess whitespace if name editing is in progress", () => {
            expect(normalizeNickname("  Gregory  ", true)).toBe(" Gregory ");
        });

        test("should normalize strings appropriately while name editing in progress", () => {
            expect(normalizeNickname("\uFF11\uFF12\uFF13", true)).toBe("123");
            expect(normalizeNickname("hello\u3000world", true)).toBe(
                "hello world",
            );
            expect(normalizeNickname("abcABC123", true)).toBe("abcABC123");
        });
    });

    describe("isValidNickname", () => {
        test("should return false for empty or null inputs", () => {
            expect(isValidNickname("")).toBe(false);
            expect(isValidNickname(null as unknown as string)).toBe(false);
            expect(isValidNickname(undefined as unknown as string)).toBe(false);
        });

        test("should validate basic valid nicknames", () => {
            expect(isValidNickname("john")).toBe(true);
            expect(isValidNickname("jane_doe")).toBe(true);
            expect(isValidNickname("user.name")).toBe(true);
            expect(isValidNickname("user-name")).toBe(true);
            expect(isValidNickname("user123")).toBe(true);
            expect(isValidNickname("John Doe")).toBe(true);
        });

        test("should validate nicknames with international characters", () => {
            expect(isValidNickname("José")).toBe(true);
            expect(isValidNickname("名字字")).toBe(true);
            expect(isValidNickname("用户名")).toBe(true);
            expect(isValidNickname("Ñiçölås")).toBe(true);
        });

        test("should validate nicknames with special allowed characters", () => {
            expect(isValidNickname("user.name")).toBe(true);
            expect(isValidNickname("user-name")).toBe(true);
            expect(isValidNickname("user_name")).toBe(true);
            expect(isValidNickname("user name")).toBe(true);
            expect(isValidNickname("O'Connor")).toBe(true);
            expect(isValidNickname(normalizeNickname("O\u2019Connor"))).toBe(
                true,
            );
        });

        test("should reject nicknames with disallowed characters", () => {
            expect(isValidNickname("user@name")).toBe(false);
            expect(isValidNickname("user:name")).toBe(false);
            expect(isValidNickname("user/name")).toBe(false);
            expect(isValidNickname("user\\name")).toBe(false);
            expect(isValidNickname("user#name")).toBe(false);
            expect(isValidNickname("user!name")).toBe(false);
            expect(isValidNickname("user$name")).toBe(false);
            expect(isValidNickname("user%name")).toBe(false);
            expect(isValidNickname("user^name")).toBe(false);
            expect(isValidNickname("user&name")).toBe(false);
            expect(isValidNickname("user*name")).toBe(false);
            expect(isValidNickname("user(name)")).toBe(false);
            expect(isValidNickname("user+name")).toBe(false);
            expect(isValidNickname("user=name")).toBe(false);
        });

        test("should reject nicknames that are too short", () => {
            // Create string of length MIN_NICKNAME_LENGTH - 1
            const tooShort = "a".repeat(MIN_NICKNAME_LENGTH - 1);
            expect(isValidNickname(tooShort)).toBe(false);
        });

        test("should reject nicknames that are too long", () => {
            // Create string of length MAX_NICKNAME_LENGTH + 1
            const tooLong = "a".repeat(MAX_NICKNAME_LENGTH + 1);
            expect(isValidNickname(tooLong)).toBe(false);
        });

        test("should validate nicknames at min and max length boundaries", () => {
            const minLength = "a".repeat(MIN_NICKNAME_LENGTH);
            const maxLength = "a".repeat(MAX_NICKNAME_LENGTH);

            expect(isValidNickname(minLength)).toBe(true);
            expect(isValidNickname(maxLength)).toBe(true);
        });

        test("should validate a nickname at max length that uses a multiple UTF-16 code unit character", () => {
            const maxRunes = "𠀋".repeat(MAX_NICKNAME_LENGTH);
            expect(isValidNickname(maxRunes)).toBe(true);
        });

        test("should reject nicknames with extraneous spaces", () => {
            expect(isValidNickname("  john  ")).toBe(false); // Spaces are trimmed during normalization
            expect(isValidNickname("john    doe")).toBe(false); // Multiple spaces become one
        });

        test("should reject nicknames with non-Ascii spaces", () => {
            expect(isValidNickname("Helen\u00A0Harris\u2003the\u2009III")).toBe(
                false,
            );
        });

        test("should reject nicknames with fullwidth characters", () => {
            expect(isValidNickname("\uFF21\uFF22\uFF23")).toBe(false); // Fullwidth 'ABC'
        });
    });

    describe("migrateLegacyNickname", () => {
        test("should preserve valid nicknames", () => {
            expect(migrateLegacyNickname("O'Connor")).toBe("O'Connor");
        });

        test("should repair invalid punctuation where possible", () => {
            expect(migrateLegacyNickname("Legacy Alias!!!")).toBe(
                "Legacy Alias",
            );
            expect(migrateLegacyNickname("O\u2019Connor!!!")).toBe("O'Connor");
        });

        test("should truncate overlong nicknames to the max supported length", () => {
            expect(
                migrateLegacyNickname("a".repeat(MAX_NICKNAME_LENGTH + 5)),
            ).toBe("a".repeat(MAX_NICKNAME_LENGTH));
        });

        test("should clear unrecoverable or protected nicknames", () => {
            expect(migrateLegacyNickname("@$")).toBe("");
            expect(migrateLegacyNickname("admin!!!")).toBe("");
        });
    });

    describe("precisNickname zod schema", () => {
        test("should validate valid nicknames", () => {
            const result = precisNickname.safeParse("valid_nickname");
            expect(result.success).toBe(true);
        });

        test("should reject invalid nicknames", () => {
            const result = precisNickname.safeParse("invalid@nickname");
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.errors[0].message).toBe(
                    "Invalid nickname, not PRECIS!",
                );
            }
        });

        test("should handle edge cases consistently with isValidNickname", () => {
            // Test empty string
            expect(precisNickname.safeParse("").success).toBe(false);

            // Test too long
            const tooLong = "a".repeat(MAX_NICKNAME_LENGTH + 1);
            expect(precisNickname.safeParse(tooLong).success).toBe(false);

            // Test too short
            const tooShort = "".repeat(MIN_NICKNAME_LENGTH - 1);
            expect(precisNickname.safeParse(tooShort).success).toBe(false);

            // Test with spaces that will be normalized
            expect(
                precisNickname.safeParse("  valid  nickname  ").success,
            ).toBe(true);

            // Test with fullwidth characters
            expect(precisNickname.safeParse("\uFF21\uFF22\uFF23").success).toBe(
                true,
            );
        });
    });
});
