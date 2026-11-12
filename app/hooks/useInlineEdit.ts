"use client";

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";

// 確定の Enter かどうか（日本語入力の変換確定の Enter では反応しない）
export const isSubmitEnter = (e: KeyboardEvent) =>
  e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229;

// その場での名前の編集（Enter・フォーカスが外れたら保存 / Esc で取り消し）
export function useInlineEdit(onCommit: (value: string) => void) {
  const [draft, setDraft] = useState<string | null>(null);
  // Esc で取り消したあとのフォーカス外れで保存しないための目印
  const skipBlurRef = useRef(false);

  const start = (value: string) => {
    skipBlurRef.current = false;
    setDraft(value);
  };

  const commit = () => {
    if (draft === null) return;
    const value = draft;
    setDraft(null);
    onCommit(value);
  };

  const cancel = () => {
    skipBlurRef.current = true;
    setDraft(null);
  };

  const inputProps = {
    value: draft ?? "",
    onChange: (e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (isSubmitEnter(e)) {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        // モーダルなど、他の Esc 処理に伝えない
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    },
    onBlur: () => {
      if (skipBlurRef.current) {
        skipBlurRef.current = false;
        return;
      }
      commit();
    },
  };

  return { isEditing: draft !== null, start, commit, cancel, inputProps };
}
