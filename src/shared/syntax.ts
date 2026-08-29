// front/back 共通。DOM・bun:sqlite・Node API に依存させない(CLAUDE.md)。
// サーバはリンク抽出(links.ts)に、クライアントは描画に使う。

export type Node =
  | { type: "text"; text: string }
  | { type: "link"; title: string }
  | { type: "bold"; level: number; text: string }
  | { type: "url"; url: string }
  | { type: "image"; url: string }
  | { type: "codeBlockStart"; lang: string };

const CODE_BLOCK_START = /^code:(\S+)$/;
const BRACKET_OR_TAG = /\[([^\]]*)\]|#(\S+)/g;
const BOLD_CONTENT = /^(\*+)\s+(.*)$/;
const EXTERNAL_URL = /^https?:\/\/\S+$/;
const IMAGE_PATH = /^\/files\/\S+$/;
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|svg)$/i;

function parseBracket(content: string): Node {
  if (content === "") return { type: "text", text: "[]" };

  const bold = content.match(BOLD_CONTENT);
  // BOLD_CONTENT がマッチした時点でグループ1・2は必ず捕捉されている
  if (bold) return { type: "bold", level: bold[1]!.length, text: bold[2]! };

  if (EXTERNAL_URL.test(content) || IMAGE_PATH.test(content)) {
    return IMAGE_EXTENSION.test(content)
      ? { type: "image", url: content }
      : { type: "url", url: content };
  }

  return { type: "link", title: content };
}

// code:lang 単独行は、次行以降のインデントされた行をコードブロックとして扱う
// 開始マーカー。この判定は複数行にまたがるため、"行を跨いだ状態管理" は
// 呼び出し側(links.ts / LineRenderer)の責務とし、ここでは開始行の検出だけを行う。
export function parseLine(line: string): Node[] {
  const codeBlock = line.replace(/^[ \t]+/, "").match(CODE_BLOCK_START);
  if (codeBlock) return [{ type: "codeBlockStart", lang: codeBlock[1]! }];

  const nodes: Node[] = [];
  let lastIndex = 0;
  BRACKET_OR_TAG.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = BRACKET_OR_TAG.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: "text", text: line.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      nodes.push(parseBracket(match[1]));
    } else if (match[2] !== undefined) {
      nodes.push({ type: "link", title: match[2] });
    }
    lastIndex = BRACKET_OR_TAG.lastIndex;
  }

  if (lastIndex < line.length) {
    nodes.push({ type: "text", text: line.slice(lastIndex) });
  }
  if (nodes.length === 0) {
    nodes.push({ type: "text", text: "" });
  }

  return nodes;
}

// 行頭の空白/タブの個数 = 箇条書きのネスト深さ。tab とスペースは区別せず1文字1段。
export function indentOf(line: string): number {
  return line.match(/^[ \t]*/)?.[0].length ?? 0;
}
