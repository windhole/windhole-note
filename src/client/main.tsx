import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Page } from "../shared/types";
import { getByTitle, listPages } from "./api";

function PageCard({ page }: { page: Page }) {
  return (
    <article className="card">
      <h2>{page.title}</h2>
      {/* 1行目はタイトルなので先頭数行のプレビューは2行目から */}
      <p>{page.lines.slice(1, 5).join("\n")}</p>
    </article>
  );
}

function ListPage() {
  const [pages, setPages] = useState<Page[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    listPages().then(setPages).catch((e: Error) => setError(e.message));
  };
  useEffect(reload, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (t === "") return;
    try {
      await getByTitle(t);
      setTitle("");
      setError(null);
      reload();
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

createRoot(document.getElementById("root")!).render(<ListPage />);
