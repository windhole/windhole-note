import { useEffect, useState } from "react";
import type { Page } from "../../shared/types";
import type { PageDetail } from "../api";
import { deletePage, getPage } from "../api";
import { Editor } from "../components/Editor";
import { LineRenderer } from "../components/LineRenderer";
import { RelatedPages } from "../components/RelatedPages";
import { SearchBox } from "../components/SearchBox";

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

  // 論理削除なので DB からは消えないが、UI からは戻せない。確認を挟む
  const remove = async () => {
    if (page === null) return;
    if (!confirm(`「${page.title}」を削除しますか?`)) return;
    try {
      await deletePage(page.id);
      location.hash = "#/";
    } catch (e) {
      setError((e as Error).message);
    }
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
        <SearchBox />
        <span className="nav-actions">
          <a href={`#/p/${id}/history`}>履歴</a>
          <button type="button" onClick={() => setEditing(!editing)}>
            {editing ? "表示" : "編集"}
          </button>
          <button type="button" className="danger" onClick={() => void remove()}>
            削除
          </button>
        </span>
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
      <RelatedPages backlinks={page.backlinks} twoHop={page.twoHop} />
    </main>
  );
}
