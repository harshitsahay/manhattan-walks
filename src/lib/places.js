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
  park: '#00933C',
  food: '#FF6319',
  museum: '#EE352E',
  culture: '#FCCC0A',
  education: '#0039A6',
  landmark: '#FCCC0A',
  transport: '#6E6E6E',
}
