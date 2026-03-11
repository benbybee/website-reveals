-- Fix missing ON DELETE CASCADE on inbound_proposals.client_id
-- Without this, deleting a client fails if they have any inbound_proposals rows
ALTER TABLE inbound_proposals
  DROP CONSTRAINT IF EXISTS inbound_proposals_client_id_fkey;

ALTER TABLE inbound_proposals
  ADD CONSTRAINT inbound_proposals_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
