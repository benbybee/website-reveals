-- Template Site GTM: saved sender-identity book. The operator selects a return
-- address per campaign from a dropdown (tpl_campaigns.return_address_id) instead
-- of retyping it. Fields mirror Lob's `from` address shape. state is 2-letter,
-- country defaults 'US'. `is_default` marks the address pre-selected in the
-- dropdown for new campaigns.

CREATE TABLE IF NOT EXISTS tpl_return_addresses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label         text NOT NULL,
  name          text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city          text NOT NULL,
  state         text NOT NULL,
  zip           text NOT NULL,
  country       text NOT NULL DEFAULT 'US',
  is_default    boolean NOT NULL DEFAULT false,
  archived      boolean NOT NULL DEFAULT false,
  created_by    text,
  created_at    timestamp with time zone NOT NULL DEFAULT now(),
  updated_at    timestamp with time zone NOT NULL DEFAULT now()
);

-- At most one default return address.
CREATE UNIQUE INDEX tpl_return_addresses_one_default_idx
  ON tpl_return_addresses(is_default) WHERE is_default = true;

ALTER TABLE tpl_return_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on tpl_return_addresses"
  ON tpl_return_addresses FOR ALL USING (true) WITH CHECK (true);
