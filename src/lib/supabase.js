import { API_BASE_URL } from '../config'

function authHeaders() {
  const token = import.meta.env.VITE_API_TOKEN
  return token ? { 'X-Auth-Token': token } : {}
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    ...options,
  })
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch { /* ignore */ }
    throw new Error(message)
  }
  return res.json()
}

export async function fetchWalks() {
  return request('/walks')
}

export async function insertWalk(walk) {
  return request('/walks', { method: 'POST', body: JSON.stringify(walk) })
}

export async function updateWalk(id, changes) {
  return request(`/walks?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(changes) })
}

export async function deleteWalk(id) {
  await request(`/walks?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}
