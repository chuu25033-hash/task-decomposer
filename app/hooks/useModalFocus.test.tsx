// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useModalFocus } from "@/app/hooks/useModalFocus";

// jsdom はレイアウトを計算しないため、表示中の要素とみなせるようにする
const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return this.parentNode;
    },
  });
});
afterAll(() => {
  if (original) Object.defineProperty(HTMLElement.prototype, "offsetParent", original);
});
afterEach(cleanup);

function Dialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref, onClose);
  return (
    <div ref={ref} tabIndex={-1} role="dialog">
      <button>最初</button>
      <button>最後</button>
    </div>
  );
}

function App({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>開く</button>
      {open && (
        <Dialog
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

describe("useModalFocus", () => {
  it("開くとモーダル内にフォーカスし、Tab で外に出ず、Esc で閉じて元の場所に戻る", () => {
    const onClose = vi.fn();
    render(<App onClose={onClose} />);
    const opener = screen.getByText("開く");
    opener.focus();
    fireEvent.click(opener);

    expect(document.activeElement).toBe(screen.getByText("最初"));

    screen.getByText("最後").focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByText("最初"));

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText("最後"));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
