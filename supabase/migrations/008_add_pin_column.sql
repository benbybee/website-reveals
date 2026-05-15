-- Add plaintext PIN column so it can be included in all client emails
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pin text;
