import { describe, expect, it } from "vitest";
import {
  buildLandingPage,
  buildVCard,
  CONTACT_DEFAULTS,
  destinationUrl,
  escVCard,
  fileBase,
  makeMatrix,
  normalizeUrl,
  type QrContact,
} from "@/lib/qrStudio";

const person: QrContact = {
  ...CONTACT_DEFAULTS,
  first: "Joseph Rannie",
  last: "Buluran",
  title: "Co-Founder",
  mobile: "+63 917 000 0000",
  email: "joseph@bughaw.ph",
  site: "bughaw.ph",
};

describe("normalizeUrl / destinationUrl", () => {
  it("adds https and trims leading slashes", () => {
    expect(normalizeUrl("  bughaw.ph ")).toBe("https://bughaw.ph");
    expect(normalizeUrl("//bughaw.ph")).toBe("https://bughaw.ph");
    expect(normalizeUrl("http://x.ph")).toBe("http://x.ph");
    expect(normalizeUrl("")).toBe("");
  });

  it("appends an encoded src tag with the right separator", () => {
    expect(destinationUrl("bughaw.ph", "expo booth")).toBe("https://bughaw.ph?src=expo-booth");
    expect(destinationUrl("https://bughaw.ph/a?x=1", "card")).toBe("https://bughaw.ph/a?x=1&src=card");
    expect(destinationUrl("bughaw.ph", "")).toBe("https://bughaw.ph");
    expect(destinationUrl("", "card")).toBe("");
  });
});

describe("buildVCard", () => {
  it("escapes special characters", () => {
    expect(escVCard("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("emits a CRLF-delimited vCard 3.0 with only filled fields", () => {
    const v = buildVCard(person);
    expect(v.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(v.endsWith("END:VCARD")).toBe(true);
    expect(v).toContain("FN:Joseph Rannie Buluran");
    expect(v).toContain("TEL;TYPE=CELL:+63 917 000 0000");
    expect(v).toContain("URL:https://bughaw.ph");
    expect(v).not.toContain("TEL;TYPE=WORK");
    expect(v).not.toContain("NOTE:");
  });

  it("includes ADR when any address part is set (country default counts)", () => {
    expect(buildVCard(person)).toContain("ADR;TYPE=WORK:;;;;;;Philippines");
  });
});

describe("fileBase", () => {
  it("slugs the name and falls back when empty", () => {
    expect(fileBase({ first: "Joseph Rannie", last: "Buluran" })).toBe("joseph-rannie-buluran");
    expect(fileBase({ first: "", last: "" })).toBe("bughaw-contact");
    expect(fileBase({ first: "Zoë!", last: "O'Neil" })).toBe("zo-oneil");
  });
});

describe("makeMatrix", () => {
  it("encodes a URL with square size 4n+17 and finder pattern", () => {
    const m = makeMatrix("https://bughaw.ph");
    expect(m).not.toBeNull();
    expect((m!.size - 17) % 4).toBe(0);
    expect(m!.isDark(0, 0)).toBe(true);
    expect(m!.isDark(0, m!.size - 1)).toBe(true);
  });

  it("returns null when the payload cannot fit", () => {
    expect(makeMatrix("x".repeat(5000))).toBeNull();
  });
});

describe("buildLandingPage", () => {
  it("escapes user input in HTML and the inline script", () => {
    const html = buildLandingPage(
      { ...person, first: '<img src=x onerror=1>', note: "</script><script>alert(1)</script>" },
      "data:image/png;base64,AAAA"
    );
    expect(html).not.toContain("<img src=x");
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).toContain("&lt;img src=x onerror=1&gt;");
  });

  it("drops non-image logo sources", () => {
    const html = buildLandingPage(person, 'javascript:alert(1)');
    expect(html).not.toContain("javascript:");
  });

  it("makes mobile the primary call action", () => {
    const html = buildLandingPage(person, "");
    expect(html).toContain('class="act primary" href="tel:+639170000000"');
    expect(html).toContain("mailto:joseph@bughaw.ph");
  });
});
