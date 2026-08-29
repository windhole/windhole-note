import type { Database } from "bun:sqlite";
import type { BunRequest } from "bun";
import type { SaveInput } from "./pages";
import {
  deletePage,
  getByTitle,
  getPage,
  getRevision,
  listPages,
  listRevisions,
  restore,
  save,
} from "./pages";
import { backlinks, twoHop } from "./links";
import { resolveImagePath, saveImage } from "./upload";
import { search } from "./search";

export interface RouteOptions {
  imagesDir?: string;
}

// 例外を HTTP に変換するのはこの API 境界だけ(CLAUDE.md)。内側のモジュールは投げてよい
function errorResponse(e: unknown): Response {
  const message = e instanceof Error ? e.message : String(e);
  const status = message.includes("not found")
    ? 404
    : message.includes("UNIQUE constraint failed")
      ? 409
      : message.startsWith("invalid") || message.includes("unsupported image type")
        ? 400
        : 500;
  return Response.json({ error: message }, { status });
}

async function handle(fn: () => Response | Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    return errorResponse(e);
  }
}

function parseSaveBody(body: unknown): { input: SaveInput; leaving: boolean } {
  if (typeof body !== "object" || body === null) throw new Error("invalid body");
  const { title, lines, leaving } = body as Record<string, unknown>;
  if (typeof title !== "string" || title.trim() === "") throw new Error("invalid title");
  if (!Array.isArray(lines) || !lines.every((l) => typeof l === "string")) {
    throw new Error("invalid lines");
  }
  return { input: { title, lines: lines as string[] }, leaving: leaving === true };
}

function parseRevisionId(raw: string): number {
  const rid = Number(raw);
  if (!Number.isInteger(rid) || rid <= 0) throw new Error("invalid revision id");
  return rid;
}

// server.ts が Bun.serve の routes にそのまま並べる想定。
// パスパラメータは Bun が URL デコード済みの値を渡してくる
export function createRoutes(db: Database, opts: RouteOptions = {}) {
  const { imagesDir } = opts;

  return {
    "/api/pages": {
      GET: () => handle(() => Response.json(listPages(db))),
    },

    "/api/pages/by-title/:title": {
      GET: (req: BunRequest<"/api/pages/by-title/:title">) =>
        handle(() => Response.json(getByTitle(db, req.params.title))),
    },

    "/api/pages/:id": {
      GET: (req: BunRequest<"/api/pages/:id">) =>
        handle(() => {
          const page = getPage(db, req.params.id);
          if (!page) throw new Error(`page not found: ${req.params.id}`);
          return Response.json({
            ...page,
            backlinks: backlinks(db, page.id),
            twoHop: twoHop(db, page.id),
          });
        }),
      PUT: (req: BunRequest<"/api/pages/:id">) =>
        handle(async () => {
          const { input, leaving } = parseSaveBody(await req.json());
          return Response.json(save(db, req.params.id, input, { leaving }));
        }),
      DELETE: (req: BunRequest<"/api/pages/:id">) =>
        handle(() => {
          deletePage(db, req.params.id);
          return Response.json({ ok: true });
        }),
    },

    "/api/pages/:id/revisions": {
      GET: (req: BunRequest<"/api/pages/:id/revisions">) =>
        handle(() => Response.json(listRevisions(db, req.params.id))),
    },

    "/api/revisions/:rid": {
      GET: (req: BunRequest<"/api/revisions/:rid">) =>
        handle(() => {
          const rid = parseRevisionId(req.params.rid);
          const rev = getRevision(db, rid);
          if (!rev) throw new Error(`revision not found: ${rid}`);
          return Response.json(rev);
        }),
    },

    "/api/pages/:id/restore/:rid": {
      POST: (req: BunRequest<"/api/pages/:id/restore/:rid">) =>
        handle(() =>
          Response.json(restore(db, req.params.id, parseRevisionId(req.params.rid))),
        ),
    },

    "/api/search": {
      GET: (req: BunRequest<"/api/search">) =>
        handle(() => {
          const q = new URL(req.url).searchParams.get("q") ?? "";
          return Response.json(search(db, q));
        }),
    },

    "/api/upload": {
      // クライアントは画像 Blob を body に直接入れ、Content-Type にその MIME を載せる
      POST: (req: BunRequest<"/api/upload">) =>
        handle(async () => {
          const bytes = new Uint8Array(await req.arrayBuffer());
          if (bytes.length === 0) throw new Error("invalid body: empty");
          const contentType = req.headers.get("content-type") ?? "";
          return Response.json(await saveImage(bytes, contentType, imagesDir));
        }),
    },

    "/files/:name": {
      GET: (req: BunRequest<"/files/:name">) =>
        handle(async () => {
          const path = resolveImagePath(req.params.name, imagesDir);
          if (path === null) throw new Error(`file not found: ${req.params.name}`);
          const file = Bun.file(path);
          if (!(await file.exists())) throw new Error(`file not found: ${req.params.name}`);
          return new Response(file);
        }),
    },
  };
}
