import type { PageRef } from "../../shared/types";

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

// ページ下部の関連ページ。バックリンクと2ホップ先をまとめて受け持つ(SPEC.md)
export function RelatedPages({ backlinks, twoHop }: { backlinks: PageRef[]; twoHop: PageRef[] }) {
  return (
    <>
      <RefList heading="このページへのリンク" refs={backlinks} />
      <RefList heading="2ホップ先" refs={twoHop} />
    </>
  );
}
