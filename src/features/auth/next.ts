/** Lee ?next=/ruta y solo acepta rutas internas (evita open redirects). */
export function nextFromSearch(search: string): string {
  const next = new URLSearchParams(search).get('next')
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}
