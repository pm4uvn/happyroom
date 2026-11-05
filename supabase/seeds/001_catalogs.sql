-- Reference data required by the application. Idempotent.
-- Ids must match packages/shared/src/enums.ts (THEME_IDS, GIFT_CATALOG_IDS).

insert into public.room_themes (id, event_type, name_key, description_key, config, active, sort_order) values
  ('cozy_twilight', 'birthday', 'themes.cozy_twilight.name', 'themes.cozy_twilight.description',
   '{"preset":"cozy_twilight"}', true, 10),
  ('sunny_garden', 'birthday', 'themes.sunny_garden.name', 'themes.sunny_garden.description',
   '{"preset":"sunny_garden"}', true, 20)
on conflict (id) do update set
  name_key = excluded.name_key,
  description_key = excluded.description_key,
  config = excluded.config,
  active = excluded.active,
  sort_order = excluded.sort_order;

insert into public.gifts_catalog (id, name_key, icon, is_free, active, sort_order) values
  ('cake_topper', 'gifts.cake_topper', '🎂', true, true, 10),
  ('flower_bouquet', 'gifts.flower_bouquet', '💐', true, true, 20),
  ('teddy_bear', 'gifts.teddy_bear', '🧸', true, true, 30),
  ('balloon_bouquet', 'gifts.balloon_bouquet', '🎈', true, true, 40),
  ('star', 'gifts.star', '⭐', true, true, 50),
  ('confetti_box', 'gifts.confetti_box', '🎊', true, true, 60)
on conflict (id) do update set
  name_key = excluded.name_key,
  icon = excluded.icon,
  is_free = excluded.is_free,
  active = excluded.active,
  sort_order = excluded.sort_order;

-- No products are seeded: premium goods are out of MVP scope and payments are not integrated.
