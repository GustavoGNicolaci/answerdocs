import { describe, expect, it } from "vitest";
import { encodeWav } from "@/lib/voice-recorder";

describe("voice recorder WAV encoder", () => {
  it("creates a valid mono PCM WAV buffer", () => {
    const buffer = encodeWav(new Float32Array([0, 1, -1]), 16_000);
    const view = new DataView(buffer);

    expect(readAscii(view, 0, 4)).toBe("RIFF");
    expect(readAscii(view, 8, 4)).toBe("WAVE");
    expect(readAscii(view, 12, 4)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(readAscii(view, 36, 4)).toBe("data");
    expect(view.byteLength).toBe(50);
  });
});

function readAscii(view: DataView, offset: number, length: number) {
  return Array.from({ length }, (_, index) =>
    String.fromCharCode(view.getUint8(offset + index)),
  ).join("");
}
