"use client";

/**
 * Open a tab synchronously inside the click (so popup blockers allow it), then point it at a URL
 * that a server action returns. Closes the tab if there's nothing to open.
 */
export function openAfter(fetchUrl: () => Promise<{ url?: string; error?: string }>, onError: (e: string) => void): Promise<void> {
  const tab = window.open("about:blank", "_blank");
  return fetchUrl().then((r) => {
    if (r.error) {
      tab?.close();
      onError(r.error);
    } else if (r.url && tab) tab.location.href = r.url;
    else tab?.close();
  });
}
