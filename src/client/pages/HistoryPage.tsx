import { diffLines } from "diff";
import { useEffect, useState } from "react";
import type { Revision, RevisionMeta } from "../../shared/types";
import type { PageDetail } from "../api";
import { getPage, getRevision, listRevisions, restorePage } from "../api";

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString("ja-JP");
}

// 選択リビジョン → 現在、の向きの行 diff。復元したら何がどう変わるかを表す
function DiffView({ current, revision }: { current: string[]; revision: string[] }) {
  const changes = diffLines(current.join("\n") + "\n", revision.join("\n") + "\n");
  return (
    <pre className="diff">
      {changes.map((change, i) => (
        <span key={i} className={change.added ? "added" : change.removed ? "removed" : ""}>
          {change.value}
        </span>
      ))}
    </pre>
  );
}

export function HistoryPage({ id }: { id: string }) {
  const [page, setPage] = useState<PageDetail | null>(null);
  const [revisions, setRevisions] = useState<RevisionMeta[]>([]);
  const [selected, setSelected] = useState<Revision | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getPage(id), listRevisions(id)])
      .then(([p, revs]) => {
        setPage(p);
        setRevisions(revs);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  const select = (rid: number) => {
    getRevision(rid)
      .then(setSelected)
      .catch((e: Error) => setError(e.message));
  };

  const restore = async () => {
    if (selected === null) return;
    try {
      await restorePage(id, selected.id);
      location.hash = `#/p/${id}`;
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
        <a href={`#/p/${id}`}>← {page.title}</a>
      </nav>
      <div className="history">
        <ul className="revision-list">
          {revisions.length === 0 && <li className="empty">履歴はまだありません</li>}
          {revisions.map((rev) => (
            <li key={rev.id}>
              <button
                type="button"
                className={selected?.id === rev.id ? "selected" : ""}
                onClick={() => select(rev.id)}
              >
                {formatTime(rev.saved_at)}
                <small>{rev.line_count}行</small>
              </button>
            </li>
          ))}
        </ul>
        <div className="revision-detail">
          {selected === null ? (
            <p className="empty">リビジョンを選択すると現在との差分を表示します</p>
          ) : (
            <>
              <div className="revision-actions">
                <h2>{formatTime(selected.saved_at)} の版</h2>
                <button type="button" onClick={() => void restore()}>
                  この版に戻す
                </button>
              </div>
              <DiffView current={page.lines} revision={selected.lines} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
