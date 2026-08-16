let places = null

export async function loadPlaces() {
  if (places) return places
  const res = await fetch('/places.json')
  if (!res.ok) throw new Error('failed to load places')
  places = await res.json()
  return places
}

export function getPlaces() {
  return places
}

export const PLACE_COLORS = {
  park: '#5fb878',
  food: '#efb04e',
  museum: '#a195ff',
  culture: '#a195ff',
  education: '#58b7cd',
  landmark: '#e0b940',
  transport: '#b8beca',
}
