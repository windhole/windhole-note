import { useEffect, useState } from "react";
import type { Page } from "../../shared/types";
import { getByTitle, listPages } from "../api";

function PageCard({ page }: { page: Page }) {
  return (
    <a className="card" href={`#/p/${page.id}`}>
      <h2>{page.title}</h2>
      {/* 1行目はタイトルなので先頭数行のプレビューは2行目から */}
      <p>{page.lines.slice(1, 5).join("\n")}</p>
    </a>
  );
}

export function ListPage() {
  const [pages, setPages] = useState<Page[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPages().then(setPages).catch((e: Error) => setError(e.message));
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (t === "") return;
    try {
      const page = await getByTitle(t);
      location.hash = `#/p/${page.id}`;
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <main>
      <header>
        <h1>windhole-note</h1>
        <form onSubmit={create}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="新しいページのタイトル"
            aria-label="新しいページのタイトル"
          />
          <button type="submit">作成</button>
        </form>
      </header>
      {error && <p className="error">{error}</p>}
      <section className="grid">
        {pages.map((page) => (
          <PageCard key={page.id} page={page} />
        ))}
      </section>
    </main>
  );
}
