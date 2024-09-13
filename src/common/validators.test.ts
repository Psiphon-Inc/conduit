import * as validators from "@/src/common/validators";

describe("validators", () => {
    it("Uint8Array32", () => {
        const valid = new Uint8Array(32);
        const invalid1 = new Uint8Array(31);
        const invalid2 = new Uint8Array(0);
        expect(validators.Uint8Array32.safeParse(valid).success).toBe(true);
        expect(validators.Uint8Array32.safeParse(invalid1).success).toBe(false);
        expect(validators.Uint8Array32.safeParse(invalid2).success).toBe(false);
    });
});
