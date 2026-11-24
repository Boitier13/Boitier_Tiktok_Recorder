import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElapsedTimer } from "@/components/elapsed-timer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("ElapsedTimer", () => {
  afterEach(() => vi.useRealTimers());

  it("ticks every second between engine snapshots", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => root.render(<ElapsedTimer elapsedSec={250} observedAtMs={1_000_000} />));
    expect(container.textContent).toBe("04:10");
    act(() => vi.advanceTimersByTime(3_000));
    expect(container.textContent).toBe("04:13");
    act(() => root.unmount());
  });
});
