alter table public.profiles
  add column if not exists interface_language text not null default 'en';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_interface_language_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_interface_language_check
      check (interface_language in ('en', 'pt'));
  end if;
end $$;
