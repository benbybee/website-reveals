-- Template "Find Your Site" v2: name-only typeahead for the /join landing page.
-- The flashy flow is type-name -> pick business -> confirm with ZIP, so the search
-- step matches on NAME ALONE and deliberately does NOT return preview_url (the
-- site link stays behind the ZIP-confirm step). strpos() gives wildcard-safe
-- substring matching for short fragments; the % operator adds trigram fuzziness
-- for typos. Only lookup-eligible rows (preview_url present) surface.

CREATE OR REPLACE FUNCTION tpl_search_prospects(p_name text)
RETURNS TABLE (id uuid, business_name text, city text, state text, sim real)
LANGUAGE sql STABLE AS $$
  SELECT id, business_name, city, state, similarity(business_name, p_name) AS sim
  FROM tpl_prospects
  WHERE preview_url IS NOT NULL
    AND (
      strpos(lower(business_name), lower(p_name)) > 0   -- substring, wildcard-safe
      OR business_name % p_name                          -- trigram fuzzy (typos)
    )
  ORDER BY
    (strpos(lower(business_name), lower(p_name)) = 1) DESC,  -- prefix matches first
    similarity(business_name, p_name) DESC,
    business_name ASC
  LIMIT 8;
$$;
