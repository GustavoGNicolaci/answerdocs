import { describe, expect, it } from "vitest";
import { detectResponseLanguage } from "@/lib/language";

describe("language detection", () => {
  it("detects Portuguese from the current user message", () => {
    expect(detectResponseLanguage("Você pode explicar melhor isso?")).toBe("pt");
  });

  it("detects English from the current user message", () => {
    expect(detectResponseLanguage("Can you explain that in more detail?")).toBe(
      "en",
    );
  });

  it("defaults to English when the language is unclear", () => {
    expect(detectResponseLanguage("PDF")).toBe("en");
  });
});
