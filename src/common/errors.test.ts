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


import * as errors from "@/src/common/errors";

describe("errors", () => {
    it("wrapError", () => {
        const error = new Error("message");
        const wrappedError = errors.wrapError(error, "wrapped message");

        expect(wrappedError.message).toBe("wrapped message");
        expect(wrappedError.cause).toBe(error);

        const nonErrorError = "just a string";
        const wrappedNonErrorError = errors.wrapError(
            nonErrorError,
            "wrapped message",
        );
        expect(wrappedNonErrorError.message).toBe("wrapped message");
        expect(wrappedNonErrorError.cause).toBeInstanceOf(Error);
        expect((wrappedNonErrorError.cause as Error).message).toBe(
            'Stringified value of causal Error: "just a string"',
        );
    });
    it("unpackErrorMessage", () => {
        const rootCause = new TypeError("root cause is a type error");
        const causedInitiallyBy = new Error("intermediate cause", {
            cause: rootCause,
        });
        const ultimatelyCaused = new Error("error call", {
            cause: causedInitiallyBy,
        });
        expect(errors.unpackErrorMessage(ultimatelyCaused, false)).toEqual(
            "Error: error call\n\t[caused by] Error: intermediate cause\n\t[caused by] TypeError: root cause is a type error",
        );
        const stackOutput = errors.unpackErrorMessage(ultimatelyCaused, true);
        expect(stackOutput).toMatch("Error: error call");
        expect(stackOutput).toMatch("[caused by] Error: intermediate cause");
        expect(stackOutput).toMatch(
            "[caused by] TypeError: root cause is a type error",
        );
    });

    it("unpackErrorMessage with no cause", () => {
        const ultimatelyCaused = new Error("error call");
        expect(errors.unpackErrorMessage(ultimatelyCaused, false)).toEqual(
            "Error: error call",
        );
        const stackOutput = errors.unpackErrorMessage(ultimatelyCaused, true);
        expect(stackOutput).toMatch("Error: error call");
    });

    it("unpackErrorMessage with non-error input", () => {
        const nonErrorObject =
            "This is a plain string someone erroneously threw as an error";
        expect(
            // @ts-ignore (explicitly testing non-error input)
            errors.unpackErrorMessage(nonErrorObject, false),
        ).toEqual(
            '[Unknown error type]: "This is a plain string someone erroneously threw as an error"',
        );
        const realError = new Error("This is a real error", {
            cause: nonErrorObject,
        });
        expect(errors.unpackErrorMessage(realError, false)).toEqual(
            'Error: This is a real error\n\t[caused by] [Unknown error type]: "This is a plain string someone erroneously threw as an error"',
        );
    });
});
