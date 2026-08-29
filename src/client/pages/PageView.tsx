import { useEffect, useState } from "react";
import type { Page, PageRef } from "../../shared/types";
import type { PageDetail } from "../api";
import { getPage } from "../api";
import { Editor } from "../components/Editor";

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

  useEffect(() => {
    setPage(null);
    setError(null);
    getPage(id)
      .then(setPage)
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
      </nav>
      {/* id が変わったら Editor を作り直してローカル編集状態を捨てる */}
      <Editor key={page.id} page={page} onSaved={onSaved} onError={setError} />
      <RefList heading="このページへのリンク" refs={page.backlinks} />
      <RefList heading="2ホップ先" refs={page.twoHop} />
    </main>
  );
}
