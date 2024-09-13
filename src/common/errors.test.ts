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
