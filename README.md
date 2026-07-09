# mygraph

Aplicación en TypeScript para ingestión, modelado y exposición de datos de grafos. Incluye una API HTTP documentada con OpenAPI y componentes para ingesta, transformación y almacenamiento de grafos.

## Resumen
mygraph proporciona:
- Endpoints HTTP para operar sobre grafos (rutas en `src/api`).
- Un agente de grafos con lógica en `src/agent/graphAgent.ts`.
- Pipelines de ingesta y validación en `src/ingestion`.
- Capa de almacenamiento en `src/storage/graphStore.ts`.
- Especificación OpenAPI en `openapi/mygraph.yaml` / `openapi/mygraph.json`.
- Contenido estático en `public/`.

## Requisitos
- Node.js (versión compatible con las dependencias del proyecto)
- npm
- TypeScript (se usa tsconfig.json)

## Instalación
1. Clona este repositorio:
   ```bash
   git clone https://github.com/erickgomez-tech/mygraph.git
   cd mygraph
   ```

2. Copia el fichero de ejemplo de variables de entorno y complétalo:
   ```bash
   cp .env.example .env
   # Edita .env con los valores necesarios
   ```

3. Instala dependencias:
   ```bash
   npm install
   ```

## Ejecutar en desarrollo
Revisa los scripts en `package.json`. Ejemplos comunes:
- Si existe: `npm run dev`
- Si no existe, usar `ts-node-dev/ts-node` (instálalo globalmente o como devDependency) o compilar y ejecutar:
  - Compilar: `npx tsc`
  - Ejecutar: `node dist/index.js`

## Ejecutar en producción
1. Compilar:
   ```bash
   npm run build    # si existe
   # o: npx tsc
   ```

2. Ejecutar:
   ```bash
   npm start        # si existe
   # o: node dist/index.js
   ```

## Variables de entorno
- Revisa `.env.example` para las variables configurables (base de datos, claves de API, endpoints externos). Asegúrate de definirlas en `.env` antes de ejecutar.

## API
- La especificación OpenAPI está en `openapi/mygraph.yaml` y `openapi/mygraph.json`.
- Para ver la documentación localmente, puedes usar herramientas como Swagger UI o Redoc:
  - Redoc CLI: `npx redoc-cli serve openapi/mygraph.yaml`

## Estructura principal
- `src/index.ts`, `src/startup.ts` — arranque e inicialización
- `src/api/` — definiciones de rutas y handlers
- `src/agent/graphAgent.ts` — lógica específica del agente de grafos
- `src/ingestion/` — extractor, transformador, validador y runner para pipelines de ingestión
- `src/storage/graphStore.ts` — abstracción de almacenamiento del grafo
- `src/types/graph.ts` — tipos TypeScript relacionados con grafos
- `openapi/` — especificación OpenAPI
- `public/` — archivos estáticos (index.html)

## Desarrollo y tests
- Añade aquí los pasos para ejecutar los tests si existen (revisar `package.json` para scripts `test`).
- Para formateo/lint, revisa las dependencias dev en `package.json`.

## Contribuir
1. Crea una rama con tu feature/bugfix.
2. Abre un Pull Request describiendo los cambios.
3. Sigue las normas de estilo y añade tests si aplica.

## Licencia
Añade la licencia del proyecto (por ejemplo MIT) o el texto que corresponda.
