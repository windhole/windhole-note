import type { Page, PageRef } from "../shared/types";

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

export function searchPages(q: string): Promise<PageRef[]> {
  return fetch(`/api/search?q=${encodeURIComponent(q)}`).then((res) => toJson<PageRef[]>(res));
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
