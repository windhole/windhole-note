import { useEffect, useRef, useState } from "react";
import type { Page } from "../../shared/types";
import { savePage } from "../api";

const AUTOSAVE_MS = 500;

interface EditorProps {
  page: Page;
  onSaved: (page: Page) => void;
  onError: (message: string) => void;
}

// 1行目 = タイトル。本文全体を1つの textarea で編集し、
// 500ms デバウンスで自動保存、アンマウント/beforeunload で離脱時保存(leaving)
export function Editor({ page, onSaved, onError }: EditorProps) {
  const [text, setText] = useState(page.lines.join("\n"));
  const textRef = useRef(text);
  const lastSavedRef = useRef(text);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  textRef.current = text;

  const doSave = async (leaving: boolean) => {
    const current = textRef.current;
    if (current === lastSavedRef.current) return;
    const lines = current.split("\n");
    const title = (lines[0] ?? "").trim();
    // タイトル行が空の状態は保存しない(UNIQUE 制約以前に不正なページになる)
    if (title === "") return;
    try {
      const saved = await savePage(page.id, { title, lines, leaving });
      lastSavedRef.current = current;
      onSaved(saved);
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const onChange = (value: string) => {
    setText(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void doSave(false), AUTOSAVE_MS);
  };

  useEffect(() => {
    // タブを閉じる・リロードも「ページ離脱」。keepalive fetch なので送信は生き残る
    const onBeforeUnload = () => void doSave(true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timerRef.current) clearTimeout(timerRef.current);
      void doSave(true);
    };
    // doSave は ref 経由で常に最新の内容を見るため、マウント時の登録だけでよい
  }, []);

  return (
    <textarea
      className="editor"
      value={text}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
    />
  );
}
