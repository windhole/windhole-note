import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ListPage } from "./pages/ListPage";
import { PageView } from "./pages/PageView";

// ルーティングはハッシュだけで済ませる(#/ = 一覧、#/p/<id> = ページ)。
// ルータライブラリは入れない(CLAUDE.md の依存最小方針)
function useHashRoute(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function App() {
  const hash = useHashRoute();
  const pageMatch = hash.match(/^#\/p\/(.+)$/);
  if (pageMatch) return <PageView id={pageMatch[1]!} />;
  return <ListPage />;
}

createRoot(document.getElementById("root")!).render(<App />);
