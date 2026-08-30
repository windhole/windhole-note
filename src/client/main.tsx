import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getByTitle } from "./api";
import { HistoryPage } from "./pages/HistoryPage";
import { ListPage } from "./pages/ListPage";
import { PageView } from "./pages/PageView";

// ルーティングはハッシュだけで済ませる(#/ = 一覧、#/p/<id> = ページ、
// #/t/<title> = タイトル解決)。ルータライブラリは入れない(CLAUDE.md の依存最小方針)
function useHashRoute(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

// [リンク] のクリック先。by-title で解決(未存在なら自動作成)して id の URL に置き換える
function TitleRedirect({ title }: { title: string }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getByTitle(title)
      .then((page) => {
        // 履歴に #/t/ を残さない(戻るで解決画面に戻っても意味がない)
        location.replace(`#/p/${page.id}`);
      })
      .catch((e: Error) => setError(e.message));
  }, [title]);
  return <main>{error && <p className="error">{error}</p>}</main>;
}

function App() {
  const hash = useHashRoute();
  const historyMatch = hash.match(/^#\/p\/([^/]+)\/history$/);
  if (historyMatch) return <HistoryPage id={historyMatch[1]!} />;
  const pageMatch = hash.match(/^#\/p\/([^/]+)$/);
  if (pageMatch) return <PageView id={pageMatch[1]!} />;
  const titleMatch = hash.match(/^#\/t\/(.+)$/);
  if (titleMatch) {
    const title = decodeURIComponent(titleMatch[1]!);
    return <TitleRedirect key={title} title={title} />;
  }
  return <ListPage />;
}

createRoot(document.getElementById("root")!).render(<App />);
