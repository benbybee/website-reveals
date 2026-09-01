-- Coordinated-deploy switch (ADR 0007): SiteLaunchr shipped + synced templates
-- for garage-door, roofing, fencing (sitelaunchr-builder #6, sync-site-templates
-- confirmed). Flip them template-ready so the rep picker offers them and the
-- pre-dispatch guard allows them. hvac/landscaping/pool-service already ready.
UPDATE tpl_industries SET sl_template_ready = true
  WHERE slug IN ('garage-door', 'roofing', 'fencing');
