import { useRef, useState } from "react";
import type { PageRef } from "../../shared/types";
import { searchPages } from "../api";

const DEBOUNCE_MS = 300;

// タイトル + 本文の検索。入力を 300ms デバウンスして /api/search に投げ、
// 結果をドロップダウンで出す。結果クリックで #/p/<id> へ遷移して閉じる
export function SearchBox() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PageRef[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 遅く返ってきた古いレスポンスが新しい結果を上書きしないように連番で守る
  const seqRef = useRef(0);

  const onChange = (value: string) => {
    setQ(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    const query = value.trim();
    if (query === "") {
      setResults(null);
      return;
    }
    timerRef.current = setTimeout(() => {
      const seq = ++seqRef.current;
      searchPages(query)
        .then((refs) => {
          if (seq === seqRef.current) setResults(refs);
        })
        .catch(() => {
          if (seq === seqRef.current) setResults([]);
        });
    }, DEBOUNCE_MS);
  };

  const close = () => {
    setQ("");
    setResults(null);
  };

  return (
    <div className="searchbox">
      <input
        value={q}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
        placeholder="検索"
        aria-label="検索"
      />
      {results !== null && (
        <ul className="search-results">
          {results.length === 0 && <li className="empty">ヒットなし</li>}
          {results.map((ref) => (
            <li key={ref.id}>
              <a href={`#/p/${ref.id}`} onClick={close}>
                {ref.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
