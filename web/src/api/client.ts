export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } })
  } catch {
    throw new ApiError('Cannot reach the Royalty Ledger API.', 0)
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(body.detail ?? `Request failed (${res.status})`, res.status)
  return { status: res.status, body: body as T }
}

export const get = async <T>(path: string) => (await request<T>(path)).body
export const post = <T>(path: string, data: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(data) })
