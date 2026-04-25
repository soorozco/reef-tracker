# Reef Tracker

App estática para llevar registro y control de un acuario marino de arrecife: parámetros, dosificación de aditivos Red Sea, soluciones preparadas y mantenimiento.

## Stack

- **Frontend**: HTML + JavaScript vanilla + CSS (sin build, sin framework)
- **Backend**: [Supabase](https://supabase.com) (Postgres + REST API)
- **Deploy**: GitHub Pages
- **Compatibilidad**: pensado para correr en iPad con iOS 9.3.5 (Safari 9)

## Setup local

```bash
python3 -m http.server 8080
```

Abre http://localhost:8080

## Configuración

`js/config.js` contiene la URL del proyecto Supabase y la `anon key`.

> La `anon key` es pública por diseño (va en el cliente del navegador). La seguridad real está en las políticas Row Level Security (RLS) configuradas en Supabase.

## Esquema de base de datos

Ver [`schema.sql`](schema.sql). Para aplicar:

1. Entra a tu proyecto en [Supabase](https://app.supabase.com)
2. Sidebar → **SQL Editor** → New query
3. Pega el contenido de `schema.sql` y ejecuta

## Estructura

```
reef-tracker/
├── index.html        Página única (SPA)
├── styles.css        Estilos
├── schema.sql        Esquema y políticas para Supabase
└── js/
    ├── config.js     URL y anon key de Supabase
    ├── api.js        Cliente HTTP (XHR -> PostgREST)
    └── app.js        Orquestación de UI
```
