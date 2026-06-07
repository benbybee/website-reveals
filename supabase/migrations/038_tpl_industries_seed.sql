-- Seed the tpl_industries taxonomy with the 20 most common local service
-- industries. Slugs are canonical kebab-case (the join key discover matches a
-- campaign's industry_slug against); google_categories are Google Maps category
-- search terms; sl_slug defaults to the slug (operator confirms against SL's
-- template library). Idempotent: ON CONFLICT (slug) refreshes name + categories.

INSERT INTO tpl_industries (slug, display_name, google_categories, sl_slug) VALUES
  ('pest-control',     'Pest Control',     ARRAY['Pest control service']::text[],                              'pest-control'),
  ('plumbing',         'Plumbing',         ARRAY['Plumber']::text[],                                           'plumbing'),
  ('hvac',             'HVAC',             ARRAY['HVAC contractor']::text[],                                   'hvac'),
  ('electrical',       'Electrical',       ARRAY['Electrician']::text[],                                       'electrical'),
  ('landscaping',      'Landscaping',      ARRAY['Landscaper','Lawn care service']::text[],                    'landscaping'),
  ('roofing',          'Roofing',          ARRAY['Roofing contractor']::text[],                                'roofing'),
  ('house-cleaning',   'House Cleaning',   ARRAY['House cleaning service']::text[],                             'house-cleaning'),
  ('painting',         'Painting',         ARRAY['Painter']::text[],                                           'painting'),
  ('garage-door',      'Garage Door',      ARRAY['Garage door supplier']::text[],                              'garage-door'),
  ('carpet-cleaning',  'Carpet Cleaning',  ARRAY['Carpet cleaning service']::text[],                           'carpet-cleaning'),
  ('window-cleaning',  'Window Cleaning',  ARRAY['Window cleaning service']::text[],                            'window-cleaning'),
  ('pressure-washing', 'Pressure Washing', ARRAY['Pressure washing service']::text[],                          'pressure-washing'),
  ('tree-service',     'Tree Service',     ARRAY['Tree service']::text[],                                      'tree-service'),
  ('locksmith',        'Locksmith',        ARRAY['Locksmith']::text[],                                         'locksmith'),
  ('appliance-repair', 'Appliance Repair', ARRAY['Appliance repair service']::text[],                          'appliance-repair'),
  ('handyman',         'Handyman',         ARRAY['Handyman']::text[],                                          'handyman'),
  ('pool-service',     'Pool Service',     ARRAY['Swimming pool repair service','Pool cleaning service']::text[], 'pool-service'),
  ('auto-repair',      'Auto Repair',      ARRAY['Auto repair shop']::text[],                                  'auto-repair'),
  ('concrete',         'Concrete',         ARRAY['Concrete contractor']::text[],                               'concrete'),
  ('fencing',          'Fencing',          ARRAY['Fence contractor']::text[],                                  'fencing')
ON CONFLICT (slug) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      google_categories = EXCLUDED.google_categories,
      sl_slug = EXCLUDED.sl_slug;

-- Reconcile the earlier free-text pest-control row + any campaign that used the
-- spaced "pest control" string to the canonical kebab slug, so the discover join
-- matches the seeded row. No-ops on a fresh DB where neither exists.
UPDATE tpl_campaigns  SET industry_slug = 'pest-control' WHERE industry_slug = 'pest control';
DELETE FROM tpl_industries WHERE slug = 'pest control';
