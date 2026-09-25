-- Click tracking for the sophiescrts campaign on onlybritishfans.com.
-- Same shared Supabase project as the sister sites' click tables — run once in the
-- Supabase SQL editor. Safe to re-run (IF NOT EXISTS everywhere).
--
-- The _obf_ prefix keeps this site's rows separate from the other sites' tables for the
-- same client (fanspedia: sponsor_clicks_<user>, findbyface: _fbf, onlyamericanfans: _oaf,
-- onlyaussiefans: sponsor_clicks_oaussief_<user>).
--
-- Includes from day one every column the older sponsor_clicks_* tables gained through
-- their 004 (ip_hash, is_datacenter_ip), 005 (link_verified), 006 (ip_address, country,
-- city) and 008 (botid_flagged) migrations, so this table matches the network schema.
-- link_verified and botid_flagged stay null/false here until this site mints click tokens.

CREATE TABLE IF NOT EXISTS public.sponsor_clicks_obf_sophiescrts (
    id BIGSERIAL PRIMARY KEY,
    clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    placement TEXT,
    user_agent TEXT,
    referrer TEXT,
    ip_hash TEXT,
    is_datacenter_ip BOOLEAN,
    link_verified BOOLEAN,
    ip_address TEXT,
    country TEXT,
    city TEXT,
    botid_flagged BOOLEAN
);

CREATE INDEX IF NOT EXISTS idx_sponsor_clicks_obf_sophiescrts_clicked_at
ON public.sponsor_clicks_obf_sophiescrts (clicked_at);

CREATE INDEX IF NOT EXISTS idx_sponsor_clicks_obf_sophiescrts_ip_hash
ON public.sponsor_clicks_obf_sophiescrts (ip_hash);
