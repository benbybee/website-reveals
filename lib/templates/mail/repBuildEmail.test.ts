import { describe, it, expect } from "vitest";
import { buildLiveEmail, buildFailedEmail } from "./repBuildEmail";

describe("buildLiveEmail", () => {
  it("puts the business name in the subject and the preview URL in the body", () => {
    const { subject, html } = buildLiveEmail({
      businessName: "Reece HVAC",
      previewUrl: "https://reece.pages.dev",
    });
    expect(subject).toContain("Reece HVAC");
    expect(html).toContain("https://reece.pages.dev");
  });

  it("escapes HTML in the business name", () => {
    const { html } = buildLiveEmail({
      businessName: "<script>x</script>",
      previewUrl: "https://x.dev",
    });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("buildFailedEmail", () => {
  it("names the business and reads as a failure notice", () => {
    const { subject, html } = buildFailedEmail({ businessName: "Reece HVAC" });
    expect(subject).toContain("Reece HVAC");
    expect(html.toLowerCase()).toMatch(/could not|failed|issue/);
  });

  it("includes the error detail when provided, escaped", () => {
    const { html } = buildFailedEmail({ businessName: "Reece HVAC", error: "template <400>" });
    expect(html).toContain("template &lt;400&gt;");
  });
});
