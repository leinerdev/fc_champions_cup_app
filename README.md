# FC CHAMPIONS CUP

PWA para organizar torneos de **FC27** con tus amigos: ligas, liguillas y copas, con roles, invitaciones por enlace y código de 6 dígitos, marcadores, desempates y eliminatorias.

**Stack:** React + Vite + TypeScript · Tailwind CSS · Motion · TanStack Query · Supabase (Auth, Postgres + RLS, Storage, Realtime, Edge Functions) · `vite-plugin-pwa` · Vercel.

---

## 1. Crear el proyecto de Supabase (una sola vez)

1. Entra a [supabase.com](https://supabase.com) → **New project**. Guarda la contraseña de la base de datos.
2. **Authentication → Providers → Email**: deja el proveedor activado y **desactiva "Confirm email"**.
   La app registra usuarios con `usuario@fccc.app` (email sintético): no se envía ningún correo.
3. **SQL Editor**: ejecuta en orden el contenido de
   - `supabase/migrations/0001_profiles_storage.sql`
   - `supabase/migrations/0002_tournaments.sql`

   (Crean tablas, RLS, funciones RPC, el bucket `avatars` y la publicación Realtime.)
4. **Project Settings → API**: copia `Project URL` y `anon public key`.
5. Copia `.env.example` a `.env.local` y pega ambos valores.

## 2. Tu cuenta de super admin

1. Corre la app (`npm run dev`), regístrate con tu usuario (ej. `leinerdev`) y completa tu perfil.
2. En el **SQL Editor** ejecuta `supabase/seed_super_admin.sql` (cambia el username si usas otro).
   Eso marca `is_super_admin = true`. La app no permite auto-promoverse: el campo está protegido por un trigger.

## 3. Restablecer contraseñas (Edge Function)

Supabase no permite cambiar la contraseña de otro usuario desde el navegador, por eso existe la función
`admin-reset-password`, que verifica que quien llama sea super admin y usa la *service role key* (que nunca llega al frontend).

```bash
npm i -g supabase            # o: brew install supabase/tap/supabase
supabase login
supabase link --project-ref TU-PROJECT-REF
supabase functions deploy admin-reset-password
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` ya están disponibles para las funciones; no hace falta configurar secretos.

## 4. Desarrollo

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # motor de torneo + migraciones SQL (PGlite)
npm run build        # producción + service worker
npm run icons        # regenera los iconos PWA desde public/icon.svg
```

> Sin variables de entorno la app muestra una pantalla de configuración en lugar de fallar.

## 5. Despliegue en Vercel

1. Importa el repositorio en [vercel.com](https://vercel.com) (framework **Vite**, detectado automáticamente).
2. Variables de entorno: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. `vercel.json` ya incluye el *rewrite* de SPA, necesario para los enlaces de invitación `/join/<código>`.
4. En Supabase → **Authentication → URL Configuration** pon tu dominio de Vercel como *Site URL*.

## Reglas del torneo (resumen)

| Tema | Regla |
| --- | --- |
| Liga / liguilla | Todos contra todos (opcional ida y vuelta), luego eliminatorias con los clasificados (cantidad par). Sorteo aleatorio. |
| Copa | Eliminación directa con participantes pares. Con tamaños que no son potencia de 2 se reparten *byes* aleatorios. |
| Clasificación | Puntos (3-1-0) → diferencia de goles → enfrentamiento directo → partido de desempate. |
| Eliminatorias | Partido único o ida y vuelta por ronda. Global → goles de visitante → penales. |
| Roles | `admin` (creador y quien él promueva) y `guest` (todos los invitados). El super admin gestiona todo. |
| Marcadores | Cualquiera de los dos jugadores del partido lo registra; solo un admin lo corrige. |
