import type { Page } from "../shared/types";

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

export function getByTitle(title: string): Promise<Page> {
  return fetch(`/api/pages/by-title/${encodeURIComponent(title)}`).then((res) =>
    toJson<Page>(res),
  );
}
