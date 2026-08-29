import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb } from "../../src/server/db";
import { createRoutes } from "../../src/server/routes";

let db: Database;
let server: ReturnType<typeof Bun.serve>;
let imagesDir: string;

function url(path: string): string {
  return new URL(path, server.url).toString();
}

async function makePage(title: string, lines: string[]): Promise<{ id: string }> {
  const res = await fetch(url(`/api/pages/by-title/${encodeURIComponent(title)}`));
  const page = (await res.json()) as { id: string };
  await fetch(url(`/api/pages/${page.id}`), {
    method: "PUT",
    body: JSON.stringify({ title, lines }),
  });
  return page;
}

beforeEach(() => {
  db = createDb(":memory:");
  imagesDir = mkdtempSync(join(tmpdir(), "routes-test-"));
  server = Bun.serve({ port: 0, routes: createRoutes(db, { imagesDir }) });
});

afterEach(() => {
  server.stop(true);
  rmSync(imagesDir, { recursive: true, force: true });
});

describe("pages API", () => {
  test("by-title は未存在なら作成し、日本語タイトルもデコードされる", async () => {
    const res = await fetch(url(`/api/pages/by-title/${encodeURIComponent("日本語 ページ")}`));
    expect(res.status).toBe(200);
    const page = (await res.json()) as { title: string; lines: string[] };
    expect(page.title).toBe("日本語 ページ");
    expect(page.lines).toEqual(["日本語 ページ"]);
  });

  test("GET /api/pages は一覧を返す", async () => {
    await makePage("A", ["A", "本文"]);
    const res = await fetch(url("/api/pages"));
    const pages = (await res.json()) as { title: string }[];
    expect(pages.map((p) => p.title)).toEqual(["A"]);
  });

  test("GET /api/pages/:id は backlinks / twoHop を含む", async () => {
    const a = await makePage("A", ["A", "[B]"]);
    const b = await makePage("B", ["B", "[C]"]);
    await makePage("C", ["C"]);

    const res = await fetch(url(`/api/pages/${b.id}`));
    const body = (await res.json()) as {
      backlinks: { id: string }[];
      twoHop: { title: string }[];
    };
    expect(body.backlinks.map((r) => r.id)).toEqual([a.id]);

    const aRes = (await (await fetch(url(`/api/pages/${a.id}`))).json()) as {
      twoHop: { title: string }[];
    };
    expect(aRes.twoHop.map((r) => r.title)).toEqual(["C"]);
  });

  test("PUT は不正な body に 400 を返す", async () => {
    const a = await makePage("A", ["A"]);
    for (const body of ["null", "{}", '{"title":"","lines":[]}', '{"title":"A","lines":[1]}']) {
      const res = await fetch(url(`/api/pages/${a.id}`), { method: "PUT", body });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBeString();
    }
  });

  test("既存タイトルへの改名は 409", async () => {
    const a = await makePage("A", ["A"]);
    await makePage("B", ["B"]);
    const res = await fetch(url(`/api/pages/${a.id}`), {
      method: "PUT",
      body: JSON.stringify({ title: "B", lines: ["B"] }),
    });
    expect(res.status).toBe(409);
  });

  test("DELETE 後は一覧から消え、GET は 404", async () => {
    const a = await makePage("A", ["A"]);
    const del = await fetch(url(`/api/pages/${a.id}`), { method: "DELETE" });
    expect(del.status).toBe(200);
    expect((await (await fetch(url("/api/pages"))).json()) as unknown[]).toEqual([]);
    expect((await fetch(url(`/api/pages/${a.id}`))).status).toBe(404);
  });

  test("未存在 id の GET / PUT は 404", async () => {
    expect((await fetch(url("/api/pages/nope"))).status).toBe(404);
    const res = await fetch(url("/api/pages/nope"), {
      method: "PUT",
      body: JSON.stringify({ title: "X", lines: ["X"] }),
    });
    expect(res.status).toBe(404);
  });
});

describe("revisions API", () => {
  test("履歴一覧 → 単体取得 → 復元が一巡する", async () => {
    const a = await makePage("A", ["A", "v1"]);

    const revs = (await (
      await fetch(url(`/api/pages/${a.id}/revisions`))
    ).json()) as { id: number; line_count: number }[];
    expect(revs).toHaveLength(1);
    expect(revs[0]!.line_count).toBe(2);

    const rev = (await (await fetch(url(`/api/revisions/${revs[0]!.id}`))).json()) as {
      lines: string[];
    };
    expect(rev.lines).toEqual(["A", "v1"]);

    // 内容を進めてから復元
    await fetch(url(`/api/pages/${a.id}`), {
      method: "PUT",
      body: JSON.stringify({ title: "A", lines: ["A", "v2"] }),
    });
    const restored = await fetch(url(`/api/pages/${a.id}/restore/${revs[0]!.id}`), {
      method: "POST",
    });
    expect(restored.status).toBe(200);
    expect(((await restored.json()) as { lines: string[] }).lines).toEqual(["A", "v1"]);
  });

  test("不正・未存在のリビジョン id は 400 / 404", async () => {
    const a = await makePage("A", ["A"]);
    expect((await fetch(url("/api/revisions/abc"))).status).toBe(400);
    expect((await fetch(url("/api/revisions/999"))).status).toBe(404);
    expect(
      (await fetch(url(`/api/pages/${a.id}/restore/999`), { method: "POST" })).status,
    ).toBe(404);
  });
});

describe("search API", () => {
  test("q でヒットし、q 無しは空配列", async () => {
    const a = await makePage("Notes", ["Notes", "bun test の話"]);
    const hit = (await (await fetch(url("/api/search?q=test"))).json()) as { id: string }[];
    expect(hit.map((r) => r.id)).toEqual([a.id]);
    expect(await (await fetch(url("/api/search"))).json()).toEqual([]);
  });
});

describe("upload / files API", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  test("アップロードした画像を /files/:name で取り出せる", async () => {
    const up = await fetch(url("/api/upload"), {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: PNG,
    });
    expect(up.status).toBe(200);
    const { url: fileUrl } = (await up.json()) as { url: string };
    expect(fileUrl).toMatch(/^\/files\/[0-9a-f]{64}\.png$/);

    const got = await fetch(url(fileUrl));
    expect(got.status).toBe(200);
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(PNG);
  });

  test("未対応タイプは 400、空 body も 400", async () => {
    const bad = await fetch(url("/api/upload"), {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello",
    });
    expect(bad.status).toBe(400);
    const empty = await fetch(url("/api/upload"), {
      method: "POST",
      headers: { "content-type": "image/png" },
    });
    expect(empty.status).toBe(400);
  });

  test("不正なファイル名・未存在ファイルは 404", async () => {
    expect((await fetch(url("/files/evil.png"))).status).toBe(404);
    expect((await fetch(url(`/files/${"0".repeat(64)}.png`))).status).toBe(404);
  });
});
