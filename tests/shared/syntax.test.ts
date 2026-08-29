import { describe, expect, test } from "bun:test";
import { groupLines, indentOf, parseLine } from "../../src/shared/syntax";

describe("parseLine", () => {
  test("記法を含まない行はそのままテキストノードになる", () => {
    expect(parseLine("ただの文章")).toEqual([{ type: "text", text: "ただの文章" }]);
  });

  test("空行は空文字のテキストノードになる", () => {
    expect(parseLine("")).toEqual([{ type: "text", text: "" }]);
  });

  describe("[タイトル] ページリンク", () => {
    test("単独のリンク", () => {
      expect(parseLine("[タイトル]")).toEqual([{ type: "link", title: "タイトル" }]);
    });

    test("前後のテキストと混在する", () => {
      expect(parseLine("見よ [タイトル] を")).toEqual([
        { type: "text", text: "見よ " },
        { type: "link", title: "タイトル" },
        { type: "text", text: " を" },
      ]);
    });

    test("空の角括弧はリテラルのテキストとして扱う", () => {
      expect(parseLine("[]")).toEqual([{ type: "text", text: "[]" }]);
    });
  });

  describe("#タグ", () => {
    test("[タグ] と同じ link ノードになる", () => {
      expect(parseLine("#タグ")).toEqual([{ type: "link", title: "タグ" }]);
    });

    test("文中のタグと通常のリンクが混在する", () => {
      expect(parseLine("メモ #tag と [Link]")).toEqual([
        { type: "text", text: "メモ " },
        { type: "link", title: "tag" },
        { type: "text", text: " と " },
        { type: "link", title: "Link" },
      ]);
    });
  });

  describe("[* 強調]", () => {
    test("* の数で level が決まる", () => {
      expect(parseLine("[* 強調]")).toEqual([{ type: "bold", level: 1, text: "強調" }]);
      expect(parseLine("[*** もっと強調]")).toEqual([
        { type: "bold", level: 3, text: "もっと強調" },
      ]);
    });

    test("* の後にスペースが無ければリンク扱いになる", () => {
      expect(parseLine("[*not-bold]")).toEqual([{ type: "link", title: "*not-bold" }]);
    });
  });

  describe("外部リンクと画像", () => {
    test("[https://...] は外部リンク", () => {
      expect(parseLine("[https://example.com/page]")).toEqual([
        { type: "url", url: "https://example.com/page" },
      ]);
    });

    test("[/files/<hash>.png] は画像", () => {
      expect(parseLine("[/files/abc123.png]")).toEqual([
        { type: "image", url: "/files/abc123.png" },
      ]);
    });

    test("[https://...png] のような外部画像 URL も画像", () => {
      expect(parseLine("[https://example.com/pic.jpg]")).toEqual([
        { type: "image", url: "https://example.com/pic.jpg" },
      ]);
    });
  });

  describe("code:lang コードブロック開始行", () => {
    test("code:lang 単独行を検出する", () => {
      expect(parseLine("code:js")).toEqual([{ type: "codeBlockStart", lang: "js" }]);
    });

    test("インデントされていても検出する", () => {
      expect(parseLine("  code:ts")).toEqual([{ type: "codeBlockStart", lang: "ts" }]);
    });

    test("行に他の内容が続く場合はマーカーとして扱わない", () => {
      expect(parseLine("code:js だよ")).toEqual([{ type: "text", text: "code:js だよ" }]);
    });
  });
});

describe("groupLines", () => {
  test("通常行はインデントを剥がしたノード列になる", () => {
    expect(groupLines(["本文", "  ネスト [A]"])).toEqual([
      { type: "line", indent: 0, nodes: [{ type: "text", text: "本文" }] },
      {
        type: "line",
        indent: 2,
        nodes: [
          { type: "text", text: "ネスト " },
          { type: "link", title: "A" },
        ],
      },
    ]);
  });

  test("code:lang の後のインデント行はひとつの code ブロックにまとまる", () => {
    expect(groupLines(["code:ts", " const a = 1;", " const b = 2;", "外側"])).toEqual([
      { type: "code", lang: "ts", content: ["const a = 1;", "const b = 2;"] },
      { type: "line", indent: 0, nodes: [{ type: "text", text: "外側" }] },
    ]);
  });

  test("インデントされたコードブロックはマーカー基準で中身の字下げを剥がす", () => {
    expect(groupLines(["  code:js", "    x = 1;"])).toEqual([
      { type: "code", lang: "js", content: [" x = 1;"] },
    ]);
  });

  test("末尾までコードブロックが続いても閉じる", () => {
    expect(groupLines(["code:sh", " echo hi"])).toEqual([
      { type: "code", lang: "sh", content: ["echo hi"] },
    ]);
  });

  test("空行は空テキストの line ブロックになる", () => {
    expect(groupLines([""])).toEqual([
      { type: "line", indent: 0, nodes: [{ type: "text", text: "" }] },
    ]);
  });
});

describe("indentOf", () => {
  test("インデント無しは 0", () => {
    expect(indentOf("text")).toBe(0);
  });

  test("スペース/タブの個数がそのまま深さになる", () => {
    expect(indentOf("  text")).toBe(2);
    expect(indentOf("\ttext")).toBe(1);
    expect(indentOf("\t \ttext")).toBe(3);
  });
});
