import {
    resolveHttpsUrl,
    resolveManageBillingUrl,
} from "@/src/hosted/billingUtils";

describe("billing utils", () => {
    it("resolves only HTTPS manage billing URLs", () => {
        expect(
            resolveManageBillingUrl("https://api.example.test", {
                manage_billing_path: "/billing/session",
            }),
        ).toBe("https://api.example.test/billing/session");

        expect(
            resolveManageBillingUrl("https://api.example.test", {
                manage_billing_url: "https://billing.example.test/session",
            }),
        ).toBe("https://billing.example.test/session");

        expect(
            resolveManageBillingUrl("https://api.example.test", {
                manage_billing_url: "http://billing.example.test/session",
            }),
        ).toBeNull();

        expect(
            resolveManageBillingUrl("http://api.example.test", {
                manage_billing_path: "/billing/session",
            }),
        ).toBeNull();
    });

    it("rejects non-HTTPS URL schemes", () => {
        expect(resolveHttpsUrl("javascript:alert(1)")).toBeNull();
        expect(resolveHttpsUrl("data:text/plain,token")).toBeNull();
        expect(
            resolveHttpsUrl("ftp://billing.example.test/session"),
        ).toBeNull();
    });
});
