/** Parse what a guest pasted into "Join a room": a full invite URL or a bare room code. */
export function parseInviteInput(raw: string): { slug: string; token?: string } | null {
  const value = raw.trim();
  if (!value) return null;
  const code = value.toLowerCase();
  if (/^[a-z0-9-]{6,48}$/.test(code)) return { slug: code };
  let url: URL;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    return null;
  }
  const m = /\/r\/([a-z0-9-]{6,48})\/?$/i.exec(url.pathname);
  if (!m?.[1]) return null;
  const token = url.searchParams.get("i") ?? undefined;
  return { slug: m[1].toLowerCase(), ...(token && /^[A-Za-z0-9_-]{16,128}$/.test(token) ? { token } : {}) };
}
