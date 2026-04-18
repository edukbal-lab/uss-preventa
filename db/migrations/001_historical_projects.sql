-- Tablas para BD histórica de proyectos USS (migrada desde AppSheet / xlsx)
-- Correr una sola vez en Supabase SQL Editor

create table if not exists proyectos_historicos (
  id text primary key,                    -- ID original de AppSheet
  fecha date,
  lugar text,
  domicilio text,
  necesidad text,                         -- Necesidad del relevamiento
  rubro text,
  solicitud_elementos text,               -- tipo: Control de acceso / CCTV / Alarma / etc
  problematica_cliente text,
  problematica_resolver text,
  infraestructura text,
  prioridad text,                         -- costo / servicio
  vendedor text,
  responsable_lugar text,
  hecho text,                             -- estado del relevamiento
  venta text,                             -- Cerrado / etc
  resultado_comercial text,               -- Concretado / No concretado
  conclusion text,
  periferico text,                        -- B-Mediano / otros
  funnel_color text,
  costo_total numeric,
  instalacion numeric,
  abono numeric,
  cmf numeric,
  descuento numeric,
  archivo text,                           -- ruta a PDF original
  imagen_plano text,                      -- ruta a imagen del plano si existe
  created_at timestamptz default now()
);

create index if not exists idx_proyhist_resultado on proyectos_historicos(resultado_comercial);
create index if not exists idx_proyhist_solicitud on proyectos_historicos(solicitud_elementos);
create index if not exists idx_proyhist_rubro on proyectos_historicos(rubro);
create index if not exists idx_proyhist_periferico on proyectos_historicos(periferico);

create table if not exists materiales_historicos (
  id text primary key,                    -- ID original
  proyecto_id text references proyectos_historicos(id) on delete cascade,
  fecha date,
  codigo text,
  detalle text,
  cantidad numeric,
  costo numeric,
  iva numeric,
  marca text,
  proveedor text,
  created_at timestamptz default now()
);

create index if not exists idx_mathist_proyecto on materiales_historicos(proyecto_id);
create index if not exists idx_mathist_codigo on materiales_historicos(codigo);

create table if not exists mano_obra_historica (
  id text primary key,                    -- ID original
  proyecto_id text references proyectos_historicos(id) on delete cascade,
  nombre text,
  categoria text,                         -- B2B / Ayudante / Project Manager
  cantidad_hs numeric,
  costo_por_hora numeric,
  total numeric,
  extras text,
  created_at timestamptz default now()
);

create index if not exists idx_mohist_proyecto on mano_obra_historica(proyecto_id);
create index if not exists idx_mohist_categoria on mano_obra_historica(categoria);

-- Habilitar RLS con política abierta (mismo modelo que tabla productos)
alter table proyectos_historicos enable row level security;
alter table materiales_historicos enable row level security;
alter table mano_obra_historica enable row level security;

create policy "proyectos_historicos open read" on proyectos_historicos for select using (true);
create policy "proyectos_historicos open write" on proyectos_historicos for insert with check (true);
create policy "proyectos_historicos open update" on proyectos_historicos for update using (true) with check (true);

create policy "materiales_historicos open read" on materiales_historicos for select using (true);
create policy "materiales_historicos open write" on materiales_historicos for insert with check (true);
create policy "materiales_historicos open update" on materiales_historicos for update using (true) with check (true);

create policy "mano_obra_historica open read" on mano_obra_historica for select using (true);
create policy "mano_obra_historica open write" on mano_obra_historica for insert with check (true);
create policy "mano_obra_historica open update" on mano_obra_historica for update using (true) with check (true);
