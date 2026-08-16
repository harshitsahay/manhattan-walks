import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export async function fetchWalks() {
  if (!SUPABASE_URL) return []
  const { data, error } = await supabase
    .from('walks')
    .select('*')
    .order('walked_on', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

export async function insertWalk(walk) {
  const { data, error } = await supabase
    .from('walks')
    .insert(walk)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteWalk(id) {
  const { error } = await supabase.from('walks').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
