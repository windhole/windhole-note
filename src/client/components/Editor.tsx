import { useEffect, useRef, useState } from "react";
import type { Page } from "../../shared/types";
import { savePage, uploadImage } from "../api";

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
  const [uploading, setUploading] = useState(false);
  const textRef = useRef(text);
  const lastSavedRef = useRef(text);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
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

  // カーソル位置に文字列を差し込み、キャレットを挿入直後に置く。
  // 制御コンポーネントなので React が value を再設定するとキャレットは末尾に飛ぶ。
  // 復元は「コミット後に必ず走る」useEffect で行う(rAF だとコミットより先に走りうる)
  const insertAtCursor = (snippet: string) => {
    const ta = taRef.current;
    const current = textRef.current;
    const start = ta?.selectionStart ?? current.length;
    const end = ta?.selectionEnd ?? current.length;
    onChange(current.slice(0, start) + snippet + current.slice(end));
    pendingCaretRef.current = start + snippet.length;
  };

  useEffect(() => {
    const pos = pendingCaretRef.current;
    if (pos === null) return;
    pendingCaretRef.current = null;
    const el = taRef.current;
    if (!el) return;
    el.selectionStart = el.selectionEnd = pos;
    el.focus();
  });

  // Cmd+V で画像を貼ったら upload して [/files/<hash>.<ext>] を挿入(SPEC.md)。
  // 本文にはホスト名を含まない相対 URL だけが入る
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (!file) return; // 通常のテキストペーストはブラウザ既定に任せる
    e.preventDefault();
    setUploading(true);
    uploadImage(file)
      .then(({ url }) => insertAtCursor(`[${url}]`))
      .catch((err) => onError((err as Error).message))
      .finally(() => setUploading(false));
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
    <div className="editor-wrap">
      <textarea
        ref={taRef}
        className="editor"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onPaste={onPaste}
        spellCheck={false}
      />
      {uploading && <p className="uploading">画像をアップロード中…</p>}
    </div>
  );
}
