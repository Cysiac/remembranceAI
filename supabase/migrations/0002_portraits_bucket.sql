-- Storage bucket for generated portrait variants (signed-URL access only).
insert into storage.buckets (id, name, public)
values ('portraits', 'portraits', false)
on conflict (id) do nothing;
