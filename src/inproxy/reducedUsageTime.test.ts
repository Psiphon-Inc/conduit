import {
    convertLocalTimeToUtc,
    convertUtcTimeToLocal,
    formatTimeIndex,
    formatTimeLabel,
    parseTimeIndex,
} from "@/src/inproxy/reducedUsageTime";

describe("reducedUsageTime", () => {
    beforeAll(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date("2024-01-15T12:00:00Z"));
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    test("formatTimeLabel zero pads", () => {
        expect(formatTimeLabel(0, 0)).toBe("00:00");
        expect(formatTimeLabel(7, 5)).toBe("07:05");
        expect(formatTimeLabel(23, 30)).toBe("23:30");
    });

    test("formatTimeIndex uses 30 minute steps", () => {
        expect(formatTimeIndex(0)).toBe("00:00");
        expect(formatTimeIndex(1)).toBe("00:30");
        expect(formatTimeIndex(2)).toBe("01:00");
        expect(formatTimeIndex(47)).toBe("23:30");
    });

    test("parseTimeIndex accepts HH:MM with :00 or :30", () => {
        expect(parseTimeIndex("00:00")).toBe(0);
        expect(parseTimeIndex("00:30")).toBe(1);
        expect(parseTimeIndex("07:00")).toBe(14);
        expect(parseTimeIndex("07:30")).toBe(15);
        expect(parseTimeIndex("23:30")).toBe(47);
    });

    test("parseTimeIndex rejects invalid inputs", () => {
        expect(parseTimeIndex("01:15")).toBeNull();
        expect(parseTimeIndex("24:00")).toBeNull();
        expect(parseTimeIndex("nope")).toBeNull();
    });

    test("utc and local conversions round-trip", () => {
        const samples = ["00:00", "07:30", "12:00", "23:30"];
        for (const value of samples) {
            const utc = convertLocalTimeToUtc(value);
            const local = convertUtcTimeToLocal(utc);
            expect(local).toBe(value);
        }
    });

    test("utc and local conversions return input for invalid values", () => {
        expect(convertLocalTimeToUtc("bad")).toBe("bad");
        expect(convertUtcTimeToLocal("bad")).toBe("bad");
    });
});
