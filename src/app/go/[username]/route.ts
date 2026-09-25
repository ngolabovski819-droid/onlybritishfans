// Click-tracking redirect for sponsored creators. Looks up the campaign for the slug
// (resolving vanity aliases first), logs a click when a click table is configured and the
// request isn't a bot/crawler, then redirects to the real destination either way.
//
// Ported from the onlyaussiefans repo. Two deliberate differences, because this site has no
// sponsor cards of its own — every link here is shared off-site:
//   * no click-token verification: there is no card renderer minting tokens on this site, so
//     link_verified is always false (the column is kept for schema parity with the sister
//     sites' tables).
//   * placements are either 'vanity:<alias>' or 'external:<host>' in practice; the internal
//     path cases below only fire if a future on-site link points here.
//
// GOTCHA: never link here with rel="noreferrer" — it stops the browser sending a Referer to
// this route, silently zeroing placement data even for internal traffic. Use
// noopener/nofollow(+sponsored) instead.
// GOTCHA: never enable prefetching on a link pointing here — a same-origin prefetch fires
// this route (and the click log) before any real click happens, logging views as clicks.
import { NextRequest, NextResponse } from 'next/server';
import { getSponsorCampaign, resolveGoAlias } from '@/config/sponsors';
import { isBotUserAgent } from '@/lib/botDetection';
import { extractClientIp, hashIp, isDatacenterIp, isRateLimited, extractGeo } from '@/lib/clickIntegrity';

export const runtime = 'nodejs';
// Not set for this project yet — without it, clicks are logged with a null ip_hash and the
// rate-limit check below is skipped (it needs a hash to count prior clicks by). Add
// CLICK_IP_SALT in the Vercel project settings to turn both on.
const CLICK_IP_SALT = process.env.CLICK_IP_SALT;
const OWN_HOSTS = new Set([
  'onlybritishfans.com',
  'www.onlybritishfans.com',
  'localhost',
  '127.0.0.1',
]);

function derivePlacement(referrer: string | null): string | null {
  if (!referrer) return null; // legitimate — pasted links and in-app browsers strip referrers

  try {
    const url = new URL(referrer);
    if (!OWN_HOSTS.has(url.hostname)) return `external:${url.hostname}`.slice(0, 120);

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return 'home';
    if (parts[0] === 'search') return 'search';
    if (parts[0] === 'onlyfans-search') return 'directory';
    if (parts[0] === 'blog') return parts[1] ? `blog:${parts[1]}` : 'blog';
    if (parts.length === 1) return `location:${parts[0]}`;
    return `internal:/${parts.join('/')}`.slice(0, 120);
  } catch {
    return null;
  }
}

interface ClickData {
  userAgent: string | null;
  referrer: string | null;
  placement: string | null;
  clientIp: string | null;
  country: string | null;
  city: string | null;
}

async function logSponsorClick(table: string, data: ClickData) {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const supabaseKey = process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey || !/^sponsor_clicks_[a-z0-9_]+$/u.test(table)) return;

  try {
    // Awaited by the caller rather than deferred: a deferred write let the redirect return
    // before the row (and the rate-limit check it depends on) landed, so a rapid-fire script
    // could get several requests' worth of "no prior clicks yet" checks in before any of them
    // had written a row. Rate limiting only means anything if "how many clicks already
    // happened" is accurate at check time.
    const ipHash = data.clientIp && CLICK_IP_SALT ? hashIp(data.clientIp, CLICK_IP_SALT) : null;

    // Same IP hammering this exact link is a script, whatever UA it claims — checked before
    // logging so a rate-limited hit still gets its redirect but never counts as a click.
    if (ipHash) {
      const rateLimited = await isRateLimited({
        supabaseUrl,
        supabaseKey,
        table,
        timestampColumn: 'clicked_at',
        ipHash,
      });
      if (rateLimited) return;
    }

    await fetch(`${supabaseUrl}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify([{
        user_agent: data.userAgent,
        referrer: data.referrer,
        placement: data.placement,
        ip_hash: ipHash,
        is_datacenter_ip: isDatacenterIp(data.clientIp),
        link_verified: false, // no token minting on this site — see the header comment
        ip_address: data.clientIp,
        country: data.country,
        city: data.city,
      }]),
      cache: 'no-store',
    });
  } catch {
    // Tracking must never delay or break the advertiser redirect.
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  let slug = username;
  try { slug = decodeURIComponent(username); } catch {}
  // Vanity aliases (GO_ALIASES in src/config/sponsors.ts): `/go/diana.saliva` resolves to
  // sophiescrts' campaign and is logged as placement 'vanity:diana.saliva', so every shared
  // link reports separately. Non-aliases resolve to themselves, so plain `/go/<username>` is
  // unchanged.
  const { username: resolvedUsername, isAlias } = resolveGoAlias(slug);
  const campaign = getSponsorCampaign(resolvedUsername);
  const destination = campaign?.linkOverride
    ?? `https://onlyfans.com/${encodeURIComponent(resolvedUsername)}`;
  const userAgent = request.headers.get('user-agent');
  const referrer = request.headers.get('referer');

  if (campaign?.clickTable && !isBotUserAgent(userAgent)) {
    // A vanity alias self-identifies its placement; anything else is guessed from the referrer.
    const placement = isAlias ? `vanity:${slug.trim().toLowerCase()}` : derivePlacement(referrer);
    const geo = extractGeo(request.headers);
    await logSponsorClick(campaign.clickTable, {
      userAgent,
      referrer,
      placement,
      clientIp: extractClientIp(request.headers.get('x-forwarded-for')),
      country: geo.country,
      city: geo.city,
    });
  }

  return NextResponse.redirect(destination, { status: 302 });
}
