import { useEffect, useState } from "react";
import type { Page, PageRef } from "../../shared/types";
import type { PageDetail } from "../api";
import { getPage } from "../api";
import { Editor } from "../components/Editor";
import { LineRenderer } from "../components/LineRenderer";

function RefList({ heading, refs }: { heading: string; refs: PageRef[] }) {
  if (refs.length === 0) return null;
  return (
    <section className="related">
      <h3>{heading}</h3>
      <ul>
        {refs.map((ref) => (
          <li key={ref.id}>
            <a href={`#/p/${ref.id}`}>{ref.title}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PageView({ id }: { id: string }) {
  const [page, setPage] = useState<PageDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setPage(null);
    setError(null);
    getPage(id)
      .then((p) => {
        setPage(p);
        // 作りたてのページ(タイトル行のみ)はそのまま書き始められるように編集モードで開く
        setEditing(p.lines.length <= 1);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  // 保存結果でページ本体だけ更新する。backlinks / twoHop は取得時のまま
  // (自分の編集で自分のバックリンクは変わらないので再取得しない)
  const onSaved = (saved: Page) => {
    setError(null);
    setPage((prev) => (prev ? { ...prev, ...saved } : prev));
  };

  if (error !== null) {
    return (
      <main>
        <p className="error">{error}</p>
        <a href="#/">一覧へ戻る</a>
      </main>
    );
  }
  if (page === null) return <main />;

  return (
    <main>
      <nav>
        <a href="#/">← 一覧</a>
        <button type="button" onClick={() => setEditing(!editing)}>
          {editing ? "表示" : "編集"}
        </button>
      </nav>
      {editing ? (
        // 編集 → 表示に切り替えるとアンマウントされ、Editor の離脱時保存が走る
        <Editor key={page.id} page={page} onSaved={onSaved} onError={setError} />
      ) : (
        <>
          <h1>{page.title}</h1>
          <LineRenderer lines={page.lines.slice(1)} />
        </>
      )}
      <RefList heading="このページへのリンク" refs={page.backlinks} />
      <RefList heading="2ホップ先" refs={page.twoHop} />
    </main>
  );
}
