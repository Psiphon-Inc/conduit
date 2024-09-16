export function handleError(error: Error): Error {
    // TODO: replace alert with some error surfacing mechanism
    //alert(error.message);
    console.error(unpackErrorMessage(error, false));
    return error;
}

export function wrapError(value: unknown, message: string): Error {
    if (value instanceof Error) {
        return new Error(message, { cause: value });
    }

    var stringified: string;
    try {
        stringified = JSON.stringify(value);
    } catch {
        stringified = `[Unable to stringify the thrown value]`;
    }

    const error = new Error(message, {
        cause: new Error(`Stringified value of causal Error: ${stringified}`),
    });
    return error;
}

export function unpackErrorMessage(
    err: Error | Array<Error>,
    includeStack = true,
): string {
    // recursively unpack error causes to create a string with the error name, message, and stack
    const doNewLines = includeStack;
    let txt = "";
    // support an array of errors as a cause
    if (Array.isArray(err)) {
        for (const e of err) {
            txt += unpackErrorMessage(e, includeStack);
        }
        return txt;
    }
    if (!(err instanceof Error)) {
        txt = "[Unknown error type]: " + JSON.stringify(err);
        return txt;
    }

    if (includeStack) {
        txt += err.stack;
    } else {
        txt += err.name + ": " + err.message;
    }

    if (err.cause != null) {
        if (err.cause instanceof Error || Array.isArray(err.cause)) {
            if (doNewLines) {
                txt += "\n\n\t[caused by] ";
            } else {
                txt += "\n\t[caused by] ";
            }
            txt += unpackErrorMessage(err.cause, includeStack);
        } else {
            txt += `\n\t[caused by] [Unknown error type]: ${JSON.stringify(
                err.cause,
            )}`;
        }
    }

    return txt;
}