// Versioned schema of the single shared store. Migrations only add; a deployed
// version is never edited in place. Session content (code, answers, feedback)
// lives encrypted in contenidos_sesion; analytic tables never hold it.
export const VERSION_ESQUEMA = 2
export const VERSION_EVENTOS = 1

export const MIGRACIONES = [[1, `
CREATE TABLE usuarios (
  id uuid PRIMARY KEY,
  clerk_id text UNIQUE,
  consentimiento_version text,
  consentido_en timestamptz,
  temas text,
  creado_en timestamptz NOT NULL
);
CREATE TABLE experimentos (
  id text PRIMARY KEY,
  estado text NOT NULL CHECK (estado IN ('preparacion', 'abierto', 'cerrado')),
  manifest_hash text,
  manifiesto jsonb,
  creado_en timestamptz NOT NULL,
  abierto_en timestamptz,
  cerrado_en timestamptz
);
CREATE TABLE participantes (
  id uuid PRIMARY KEY,
  experimento_id text NOT NULL REFERENCES experimentos(id),
  usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  icp_verificado boolean NOT NULL,
  fecha_entrega date,
  prueba boolean NOT NULL DEFAULT false,
  en_cohorte boolean NOT NULL DEFAULT false,
  sesion_inicial_id uuid,
  t0 timestamptz,
  ventana_fin timestamptz,
  retirado_en timestamptz,
  creado_en timestamptz NOT NULL,
  UNIQUE (experimento_id, usuario_id)
);
CREATE TABLE tareas (
  id uuid PRIMARY KEY,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  origen text NOT NULL CHECK (origen IN ('reclutamiento', 'declarada')),
  etiqueta text NOT NULL,
  proposito text,
  entradas_salida text,
  huella text NOT NULL,
  creado_en timestamptz NOT NULL,
  UNIQUE (usuario_id, huella)
);
CREATE TABLE artefactos (
  id uuid PRIMARY KEY,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tarea_id uuid NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  metodo text NOT NULL,
  huella_texto text NOT NULL,
  huella_primaria text NOT NULL,
  huella_estructural text NOT NULL,
  descriptores jsonb NOT NULL,
  creado_en timestamptz NOT NULL
);
CREATE TABLE sesiones (
  id uuid PRIMARY KEY,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  experimento_id text,
  artefacto_id uuid NOT NULL REFERENCES artefactos(id) ON DELETE CASCADE,
  visita_id uuid,
  clave_inicio text NOT NULL,
  digest_inicio text NOT NULL,
  manifest_hash text NOT NULL,
  version_producto text NOT NULL,
  fase text NOT NULL,
  revision integer NOT NULL,
  iniciada_en timestamptz NOT NULL,
  actividad_en timestamptz NOT NULL,
  calificada_en timestamptz,
  completada_en timestamptz,
  motivo_cierre text,
  UNIQUE (usuario_id, clave_inicio)
);
CREATE INDEX sesiones_usuario ON sesiones (usuario_id, iniciada_en);
CREATE TABLE contenidos_sesion (
  sesion_id uuid PRIMARY KEY REFERENCES sesiones(id) ON DELETE CASCADE,
  cifrado text NOT NULL,
  expira_en timestamptz NOT NULL
);
CREATE INDEX contenidos_expiracion ON contenidos_sesion (expira_en);
CREATE TABLE operaciones (
  sesion_id uuid NOT NULL REFERENCES sesiones(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  accion text NOT NULL,
  digest text NOT NULL,
  estado text NOT NULL CHECK (estado IN ('pendiente', 'completada')),
  arrendamiento text,
  arrendada_hasta timestamptz,
  creada_en timestamptz NOT NULL,
  PRIMARY KEY (sesion_id, revision)
);
CREATE TABLE eventos (
  secuencia bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id uuid NOT NULL UNIQUE,
  clave_dedup text NOT NULL UNIQUE,
  tipo text NOT NULL,
  usuario_id uuid REFERENCES usuarios(id) ON DELETE CASCADE,
  experimento_id text,
  sesion_id uuid,
  visita_id uuid,
  instancia text,
  servidor_en timestamptz NOT NULL,
  version_producto text NOT NULL,
  manifest_hash text NOT NULL,
  version_esquema integer NOT NULL,
  datos jsonb NOT NULL
);
CREATE INDEX eventos_usuario_tiempo ON eventos (usuario_id, servidor_en);
CREATE INDEX eventos_sesion ON eventos (sesion_id);
CREATE TABLE revisiones_novedad (
  artefacto_id uuid NOT NULL REFERENCES artefactos(id) ON DELETE CASCADE,
  politica text NOT NULL,
  revisor text NOT NULL,
  dictamen text NOT NULL CHECK (dictamen IN ('nuevo', 'no_nuevo', 'insuficiente')),
  razones jsonb NOT NULL,
  creado_en timestamptz NOT NULL,
  PRIMARY KEY (artefacto_id, politica, revisor)
);
CREATE TABLE incidentes (
  id uuid PRIMARY KEY,
  experimento_id text NOT NULL REFERENCES experimentos(id),
  participante_id uuid NOT NULL REFERENCES participantes(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('contacto', 'caida', 'cambio_tratamiento', 'asistencia', 'otro')),
  desde timestamptz NOT NULL,
  hasta timestamptz,
  sesion_id uuid,
  revisor text NOT NULL,
  creado_en timestamptz NOT NULL
);
CREATE TABLE cuotas (
  clave text PRIMARY KEY,
  usadas integer NOT NULL
);
CREATE TABLE pausas_proveedor (
  clave text PRIMARY KEY,
  hasta timestamptz NOT NULL
);
`], [2, `
ALTER TABLE sesiones ADD COLUMN ejemplo boolean NOT NULL DEFAULT false;
CREATE TABLE secretos (
  nombre text PRIMARY KEY,
  valor text NOT NULL,
  creado_en timestamptz NOT NULL
);
`]]
