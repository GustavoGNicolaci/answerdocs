import { describe, expect, it } from "vitest";
import { hasUsefulImageText } from "@/lib/image";

describe("image OCR utilities", () => {
  it("accepts readable text with enough useful characters and tokens", () => {
    expect(
      hasUsefulImageText("Invoice 2026\nTotal amount due: 120 dollars"),
    ).toBe(true);
  });

  it("rejects empty OCR output", () => {
    expect(hasUsefulImageText("   ")).toBe(false);
  });

  it("rejects short noisy OCR output", () => {
    expect(hasUsefulImageText("A 1 ! ?")).toBe(false);
  });
});
