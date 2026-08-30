import type { Page, PageRef, Revision, RevisionMeta } from "../shared/types";

export interface PageDetail extends Page {
  backlinks: PageRef[];
  twoHop: PageRef[];
}

async function toJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function listPages(): Promise<Page[]> {
  return fetch("/api/pages").then((res) => toJson<Page[]>(res));
}

export function getPage(id: string): Promise<PageDetail> {
  return fetch(`/api/pages/${id}`).then((res) => toJson<PageDetail>(res));
}

export function getByTitle(title: string): Promise<Page> {
  return fetch(`/api/pages/by-title/${encodeURIComponent(title)}`).then((res) =>
    toJson<Page>(res),
  );
}

export function listRevisions(pageId: string): Promise<RevisionMeta[]> {
  return fetch(`/api/pages/${pageId}/revisions`).then((res) => toJson<RevisionMeta[]>(res));
}

export function getRevision(rid: number): Promise<Revision> {
  return fetch(`/api/revisions/${rid}`).then((res) => toJson<Revision>(res));
}

export function restorePage(pageId: string, rid: number): Promise<Page> {
  return fetch(`/api/pages/${pageId}/restore/${rid}`, { method: "POST" }).then((res) =>
    toJson<Page>(res),
  );
}

// 論理削除。ページは物理的には消えないが、UI からは辿れなくなる
export function deletePage(id: string): Promise<{ ok: true }> {
  return fetch(`/api/pages/${id}`, { method: "DELETE" }).then((res) =>
    toJson<{ ok: true }>(res),
  );
}

export function searchPages(q: string): Promise<PageRef[]> {
  return fetch(`/api/search?q=${encodeURIComponent(q)}`).then((res) => toJson<PageRef[]>(res));
}

// 画像 Blob をそのまま body に入れ、Content-Type に MIME を載せる(routes.ts の受け口に合わせる)
export function uploadImage(file: Blob): Promise<{ url: string }> {
  return fetch("/api/upload", {
    method: "POST",
    headers: { "content-type": file.type },
    body: file,
  }).then((res) => toJson<{ url: string }>(res));
}

export function savePage(
  id: string,
  body: { title: string; lines: string[]; leaving?: boolean },
): Promise<Page> {
  // keepalive: beforeunload からの離脱時保存でもリクエストが打ち切られないように
  return fetch(`/api/pages/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
    keepalive: true,
  }).then((res) => toJson<Page>(res));
}
