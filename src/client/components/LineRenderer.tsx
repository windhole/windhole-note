import type { Node as SyntaxNode } from "../../shared/syntax";
import { groupLines } from "../../shared/syntax";

function NodeView({ node }: { node: SyntaxNode }) {
  switch (node.type) {
    case "text":
      return <>{node.text}</>;
    case "link":
      // 未存在タイトルは開いたときに by-title が自動作成する(#/t/ ルート)。
      // `#タグ` は書いたとおり # 付きで見せる(リンク先は [タグ] と同じ)
      return (
        <a className={node.tag ? "tag" : undefined} href={`#/t/${encodeURIComponent(node.title)}`}>
          {node.tag ? `#${node.title}` : node.title}
        </a>
      );
    case "url":
      return (
        <a href={node.url} target="_blank" rel="noreferrer">
          {node.url}
        </a>
      );
    case "image":
      return <img src={node.url} alt="" />;
    case "bold":
      return <strong className={`bold-${Math.min(node.level, 3)}`}>{node.text}</strong>;
    case "codeBlockStart":
      // 行を跨ぐ構造は groupLines がブロックにまとめるので、ここには来ない
      return null;
  }
}

export function LineRenderer({ lines }: { lines: string[] }) {
  return (
    <div className="content">
      {groupLines(lines).map((block, i) =>
        block.type === "code" ? (
          <pre key={i}>
            <code>{block.content.join("\n")}</code>
          </pre>
        ) : (
          <div className="line" style={{ paddingLeft: `${block.indent}em` }} key={i}>
            {block.indent > 0 && <span className="bullet">•</span>}
            {block.nodes.map((node, j) => (
              <NodeView key={j} node={node} />
            ))}
          </div>
        ),
      )}
    </div>
  );
}
