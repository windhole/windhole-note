import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveImagePath, saveImage } from "../../src/server/upload";

// "hello" の sha256(既知値)
const HELLO_HASH = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const HELLO = new TextEncoder().encode("hello");

describe("saveImage", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "upload-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("内容の sha256 をファイル名にして保存し、相対 URL を返す", async () => {
    const { url } = await saveImage(HELLO, "image/png", dir);
    expect(url).toBe(`/files/${HELLO_HASH}.png`);

    const saved = Bun.file(join(dir, `${HELLO_HASH}.png`));
    expect(await saved.exists()).toBe(true);
    expect(new Uint8Array(await saved.arrayBuffer())).toEqual(HELLO);
  });

  test("同じ内容を2回保存しても1ファイルに収束し、同じ URL を返す", async () => {
    const first = await saveImage(HELLO, "image/png", dir);
    const second = await saveImage(HELLO, "image/png", dir);
    expect(second.url).toBe(first.url);
    expect(readdirSync(dir)).toHaveLength(1);
  });

  test("image/jpeg は .jpg 拡張子になる", async () => {
    const { url } = await saveImage(HELLO, "image/jpeg", dir);
    expect(url).toBe(`/files/${HELLO_HASH}.jpg`);
  });

  test("画像以外の Content-Type は投げる", async () => {
    expect(saveImage(HELLO, "text/html", dir)).rejects.toThrow("unsupported image type");
    expect(saveImage(HELLO, "application/octet-stream", dir)).rejects.toThrow();
  });
});

describe("resolveImagePath", () => {
  test("sha256 + 既知拡張子の名前ならパスを返す", () => {
    expect(resolveImagePath(`${HELLO_HASH}.png`, "data/images")).toBe(
      join("data/images", `${HELLO_HASH}.png`),
    );
  });

  test("パストラバーサルや不正な名前は null", () => {
    expect(resolveImagePath("../../etc/passwd", "data/images")).toBeNull();
    expect(resolveImagePath(`${HELLO_HASH}.png/../x.png`, "data/images")).toBeNull();
    expect(resolveImagePath("x.png", "data/images")).toBeNull(); // ハッシュ形式でない
    expect(resolveImagePath(`${HELLO_HASH}.exe`, "data/images")).toBeNull(); // 未知の拡張子
    expect(resolveImagePath(HELLO_HASH.toUpperCase() + ".png", "data/images")).toBeNull();
  });
});
