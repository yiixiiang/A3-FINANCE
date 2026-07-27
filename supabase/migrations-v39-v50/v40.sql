-- V40: permission catalogue
create table if not exists public.a3_permissions(permission_key text primary key,description text not null);
create table if not exists public.a3_role_permissions(role text not null,permission_key text not null references public.a3_permissions(permission_key) on delete cascade,primary key(role,permission_key));
insert into public.a3_permissions(permission_key,description) values
('finance.read','Read finance data'),('finance.write','Create and edit drafts'),('finance.post','Post accounting entries'),('finance.approve','Approve controlled transactions'),('admin.users','Manage users and roles') on conflict do nothing;
insert into public.a3_schema_migrations(version,name) values(40,'rbac permission catalogue') on conflict(version) do update set name=excluded.name, applied_at=now();
