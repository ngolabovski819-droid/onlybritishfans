/**
 * Paid placements for onlybritishfans.com.
 *
 * This site has no sponsor cards or pinned slots (unlike the sister sites) — the only
 * thing a campaign is used for here is the `/go/<username>` click-tracking redirect, so
 * a campaign needs just the outbound link and the table its clicks land in.
 *
 * Every shared link must route through `/go/` (src/app/go/[username]/route.ts) rather
 * than linking straight out: that route logs the click, then redirects. One click table
 * per client per site (`sponsor_clicks_obf_<username>` here — the `_obf_` suffix keeps
 * this site's rows separate from the sister sites' in the shared Supabase project), so
 * each campaign's delivered-click count is trivially isolated.
 *
 * Username matching is case-insensitive.
 */
export interface SponsorCampaign {
  /** Real OnlyFans username — the key everything else is looked up by. */
  username: string;
  /** Client's tracking/referral URL; falls back to onlyfans.com/<username> when unset. */
  linkOverride?: string;
  /**
   * Supabase table that logs clicks on this campaign's /go/ link. Create it with a
   * migration under supabase-migrations/ before clicks start landing — the redirect
   * works without the table, but clicks are silently not logged.
   */
  clickTable?: string;
}

export const SPONSOR_CAMPAIGNS: readonly SponsorCampaign[] = [
  {
    username: 'sophiescrts',
    linkOverride: 'https://onlyfans.com/sophiescrts/c7',
    clickTable: 'sponsor_clicks_obf_sophiescrts', // supabase-migrations/002_*.sql
  },
];

const NORMALIZED = new Map(
  SPONSOR_CAMPAIGNS.map((campaign) => [campaign.username.trim().toLowerCase(), campaign]),
);

/** Case-insensitive campaign lookup. */
export function getSponsorCampaign(username: string): SponsorCampaign | undefined {
  return NORMALIZED.get(username.trim().toLowerCase());
}

/**
 * Vanity slugs for the `/go/<slug>` redirect ONLY. Lets a sponsor share
 * `onlybritishfans.com/go/<anything>` — the OF username of a profile in the owner's promo
 * sheet, an IG/TikTok persona, a per-campaign name — instead of `/go/<of-username>`. The
 * route resolves the alias to the target's campaign and logs the click with
 * `placement: 'vanity:<alias>'`, so each shared link reports separately.
 *
 * Alias → real OF username, both matched case-insensitively. Adding one is a single line
 * + deploy: no DNS, no Vercel config, no migration (it reuses the target's table).
 *
 * Mirrors GO_ALIASES in the fanspedia, findbyface and onlyaussiefans repos; each site's
 * alias list is independent, since promo-sheet rows are sold per-site.
 */
export const GO_ALIASES: Record<string, string> = {
  // sophiescrts
  'diana.saliva': 'sophiescrts',
};

const NORMALIZED_ALIASES = new Map(
  Object.entries(GO_ALIASES).map(([alias, username]) => [
    alias.trim().toLowerCase(),
    username.trim().toLowerCase(),
  ]),
);

// Build-time guard (runs on module load, so `next build` fails loudly on a bad config): an
// alias that shadows a real campaign username would silently hijack that sponsor's /go/
// link, and an alias pointing at a non-sponsor would redirect but never log.
for (const [alias, username] of NORMALIZED_ALIASES) {
  if (NORMALIZED.has(alias)) {
    throw new Error(`GO_ALIASES: "${alias}" collides with a SPONSOR_CAMPAIGNS username`);
  }
  if (!NORMALIZED.has(username)) {
    throw new Error(`GO_ALIASES: "${alias}" points at "${username}", which has no campaign`);
  }
}

/**
 * Resolve a `/go/<slug>` path segment to the real sponsor username. Non-aliases resolve to
 * themselves unchanged, so plain `/go/<username>` behaves exactly as before.
 */
export function resolveGoAlias(slug: string): { username: string; isAlias: boolean } {
  const target = NORMALIZED_ALIASES.get(slug.trim().toLowerCase());
  return target ? { username: target, isAlias: true } : { username: slug, isAlias: false };
}
