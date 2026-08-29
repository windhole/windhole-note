import { mkdirSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_IMAGES_DIR = "data/images";

// v1 で受け付ける画像タイプ。拡張子は syntax.ts の画像判定と揃えている
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

// GET /files/:name で配信してよいファイル名。sha256 の16進64桁 + 既知の拡張子に
// 限定することで、パストラバーサルをファイル名の形で締め出す
const SERVABLE_NAME = /^[0-9a-f]{64}\.(png|jpg|gif|webp|svg)$/;

export interface UploadResult {
  url: string;
}

// 内容の sha256 をファイル名にする。同じ画像を何度貼っても1ファイルに収束し、
// 上書き競合も起きない(同名 = 同内容)。本文にはホスト名を含まない相対 URL を返す(SPEC.md)
export async function saveImage(
  bytes: Uint8Array,
  contentType: string,
  imagesDir: string = DEFAULT_IMAGES_DIR,
): Promise<UploadResult> {
  const ext = EXT_BY_MIME[contentType];
  if (!ext) throw new Error(`unsupported image type: ${contentType}`);

  const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  const name = `${hash}.${ext}`;

  mkdirSync(imagesDir, { recursive: true });
  const path = join(imagesDir, name);
  if (!(await Bun.file(path).exists())) {
    await Bun.write(path, bytes);
  }

  return { url: `/files/${name}` };
}

// 配信してよい名前ならディスク上のパスを、そうでなければ null を返す
export function resolveImagePath(name: string, imagesDir: string = DEFAULT_IMAGES_DIR): string | null {
  if (!SERVABLE_NAME.test(name)) return null;
  return join(imagesDir, name);
}
