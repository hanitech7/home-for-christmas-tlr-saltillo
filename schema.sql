-- =====================================================================
--  Home for Christmas · The Living Room
--  Pega TODO este archivo en Supabase → SQL Editor → New query → Run
-- =====================================================================

-- 1) Estudiantes ------------------------------------------------------
create table if not exists public.estudiantes (
  id               uuid primary key default gen_random_uuid(),
  nombre_completo  text not null check (length(trim(nombre_completo)) > 2),
  edad             int  not null check (edad between 10 and 99),
  grupo            text not null check (grupo in ('Mujeres','Fer Salas','Mario/Alberto','Staff','Primera vez')),
  correo           text not null,
  telefono         text not null,
  registrado_por   text default (auth.jwt() ->> 'email'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 2) Abonos (cada pago es una fila; el total se calcula sumando) -------
create table if not exists public.abonos (
  id               uuid primary key default gen_random_uuid(),
  estudiante_id    uuid not null references public.estudiantes(id) on delete cascade,
  monto            numeric(8,2) not null check (monto > 0),
  registrado_por   text default (auth.jwt() ->> 'email'),
  created_at       timestamptz not null default now()
);
create index if not exists abonos_estudiante_idx on public.abonos(estudiante_id);

-- 3) Regla: la suma de abonos nunca pasa de $750 ------------------------
create or replace function public.validar_tope_abono()
returns trigger language plpgsql as $$
declare
  v_total numeric;
begin
  select coalesce(sum(monto), 0) into v_total
  from public.abonos where estudiante_id = new.estudiante_id;

  if v_total + new.monto > 750 then
    raise exception 'Con este abono se pasa de $750. Lleva $% y le faltan $%.',
      v_total, 750 - v_total;
  end if;
  return new;
end $$;

drop trigger if exists trg_tope_abono on public.abonos;
create trigger trg_tope_abono
  before insert on public.abonos
  for each row execute function public.validar_tope_abono();

-- 4) Fecha de última modificación automática ---------------------------
create or replace function public.tocar_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_updated_at on public.estudiantes;
create trigger trg_updated_at
  before update on public.estudiantes
  for each row execute function public.tocar_updated_at();

-- 5) Vista con el total abonado, lo que falta y si ya liquidó ----------
create or replace view public.estudiantes_resumen
with (security_invoker = true) as
select
  e.*,
  coalesce(sum(a.monto), 0)                 as total_abonado,
  750 - coalesce(sum(a.monto), 0)           as restante,
  coalesce(sum(a.monto), 0) >= 750          as pagado
from public.estudiantes e
left join public.abonos a on a.estudiante_id = e.id
group by e.id;

-- 6) Registrar estudiante + abono inicial en un solo paso ---------------
create or replace function public.registrar_estudiante(
  p_nombre   text,
  p_edad     int,
  p_grupo    text,
  p_correo   text,
  p_telefono text,
  p_abono    numeric default 0
) returns uuid
language plpgsql security invoker as $$
declare
  v_id uuid;
begin
  if p_abono is null then p_abono := 0; end if;
  if p_abono < 0 or p_abono > 750 then
    raise exception 'El abono inicial debe estar entre $0 y $750.';
  end if;

  insert into public.estudiantes (nombre_completo, edad, grupo, correo, telefono)
  values (trim(p_nombre), p_edad, p_grupo, lower(trim(p_correo)), trim(p_telefono))
  returning id into v_id;

  if p_abono > 0 then
    insert into public.abonos (estudiante_id, monto) values (v_id, p_abono);
  end if;

  return v_id;
end $$;

-- 7) Seguridad: solo usuarios con sesión (líderes) pueden ver y escribir
alter table public.estudiantes enable row level security;
alter table public.abonos      enable row level security;

drop policy if exists "lideres_leen_estudiantes"      on public.estudiantes;
drop policy if exists "lideres_registran_estudiantes" on public.estudiantes;
drop policy if exists "lideres_modifican_estudiantes" on public.estudiantes;
drop policy if exists "lideres_leen_abonos"           on public.abonos;
drop policy if exists "lideres_agregan_abonos"        on public.abonos;
drop policy if exists "lideres_borran_abonos"         on public.abonos;

create policy "lideres_leen_estudiantes"      on public.estudiantes for select to authenticated using (true);
create policy "lideres_registran_estudiantes" on public.estudiantes for insert to authenticated with check (true);
create policy "lideres_modifican_estudiantes" on public.estudiantes for update to authenticated using (true) with check (true);

create policy "lideres_leen_abonos"    on public.abonos for select to authenticated using (true);
create policy "lideres_agregan_abonos" on public.abonos for insert to authenticated with check (true);
create policy "lideres_borran_abonos"  on public.abonos for delete to authenticated using (true);

-- Permisos: nadie sin sesión (anon) puede tocar nada
revoke all on public.estudiantes, public.abonos, public.estudiantes_resumen from anon;
grant select, insert, update on public.estudiantes         to authenticated;
grant select, insert, delete on public.abonos              to authenticated;
grant select                 on public.estudiantes_resumen to authenticated;

revoke execute on function public.registrar_estudiante(text,int,text,text,text,numeric) from public, anon;
grant  execute on function public.registrar_estudiante(text,int,text,text,text,numeric) to authenticated;
