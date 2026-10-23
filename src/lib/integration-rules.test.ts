import { describe, expect, it } from "vitest";
import { chooseCompany, maskValue, stripeKeyMode, toEnvKeys, validateIntegration } from "../../supabase/functions/_shared/integration-rules";

describe("integration key rules", () => {
  it("detects sandbox vs live from the Stripe key itself", () => {
    expect(stripeKeyMode("sk_test_abc")).toBe("sandbox");
    expect(stripeKeyMode("pk_live_abc")).toBe("live");
  });
  it("rejects mixing a sandbox key with a live key", () => {
    expect(validateIntegration("stripe", { publishable_key: "pk_test_1", secret_key: "sk_live_1" })).toMatch(/do not match/);
    expect(validateIntegration("stripe", { publishable_key: "pk_live_1", secret_key: "sk_live_1" })).toBeNull();
  });
  it("requires every field and checks account formats", () => {
    expect(validateIntegration("ups", { client_id: "a", client_secret: "b", account_number: "" })).toMatch(/required/);
    expect(validateIntegration("ups", { client_id: "a", client_secret: "b", account_number: "12345" })).toMatch(/6/);
    expect(validateIntegration("fedex", { api_key: "a", secret_key: "b", account_number: "12ab" })).toMatch(/digits/);
  });
  it("only ever shows the last 4 characters", () => {
    expect(maskValue("sk_live_SECRET1234")).toBe("••••1234");
  });
  it("uses FedEx live names only for live keys", () => {
    expect(toEnvKeys("fedex", { api_key: "k", secret_key: "s", account_number: "1" }, "sandbox")).toHaveProperty("FEDEX_SANDBOX_API_KEY", "k");
    expect(toEnvKeys("fedex", { api_key: "k", secret_key: "s", account_number: "1" }, "live")).toHaveProperty("FEDEX_API_KEY", "k");
  });
  it("never guesses a company: staff use their own, otherwise exactly one configured company", () => {
    expect(chooseCompany("A", ["B"])).toBe("A");
    expect(chooseCompany(null, ["B", "B"])).toBe("B");
    expect(chooseCompany(null, ["A", "B"])).toBeNull();
    expect(chooseCompany(null, [])).toBeNull();
  });
});
