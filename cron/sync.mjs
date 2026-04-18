/**
 * Gmail → Supabase sync, Node port of the Python budget-sync CLI.
 *
 * Runs in Render Cron Job each morning before the email nudge fires, so the
 * 8am notification reflects emails that arrived overnight even if Lynette's
 * Mac was off.
 *
 * Skipped vs Python:
 *  - retry-detection (low value once she's reviewing daily)
 *  - FX conversion (foreign-card transactions still record original currency)
 *  - dual-write to Sheets (Supabase is source of truth now)
 *
 * Env vars (all required):
 *  - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_USER_ID
 *  - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 */

const FNB_SENDER = "inContact@fnb.co.za";
const DISCOVERY_SENDER = "no-reply@discovery.bank";
const SYNC_LOOKBACK_DAYS = 3;     // pull last 3 days each run; dedup handles overlap

// ────────────────────────────────────────────────────────────────────────────
// Google OAuth — exchange refresh token for access token
// ────────────────────────────────────────────────────────────────────────────

async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`OAuth refresh failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

// ────────────────────────────────────────────────────────────────────────────
// Gmail fetch
// ────────────────────────────────────────────────────────────────────────────

async function gmailListMessages(accessToken, query) {
  const ids = [];
  let pageToken;
  do {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`Gmail list failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    for (const m of data.messages ?? []) ids.push(m.id);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return ids;
}

async function gmailGetMessage(accessToken, id) {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Gmail get ${id} failed: ${res.status}`);
  return res.json();
}

function decodeBase64Url(b64) {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/").padEnd(b64.length + (4 - (b64.length % 4)) % 4, "=");
  return Buffer.from(padded, "base64").toString("utf-8");
}

function extractBody(payload) {
  const plain = [];
  const html = [];
  function walk(part) {
    const mime = part.mimeType ?? "";
    if (mime.startsWith("multipart/")) {
      for (const sub of part.parts ?? []) walk(sub);
      return;
    }
    const data = part.body?.data;
    if (!data) return;
    try {
      const decoded = decodeBase64Url(data);
      if (mime === "text/plain") plain.push(decoded);
      else if (mime === "text/html") html.push(decoded);
    } catch {}
  }
  walk(payload);

  let text;
  if (plain.length) {
    text = plain.join("\n");
  } else if (html.length) {
    text = html.join("\n")
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#8211;/g, "–")
      .replace(/&ndash;/g, "–");
  } else {
    text = "";
  }
  return text.replace(/\s+/g, " ").trim();
}

function rawEmail(msg) {
  const headers = Object.fromEntries(
    (msg.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value])
  );
  let sender = headers.from ?? "";
  const m = sender.match(/<([^>]+)>/);
  if (m) sender = m[1];
  const internalMs = parseInt(msg.internalDate ?? "0", 10);
  const receivedAt = new Date(internalMs);
  return {
    messageId: msg.id,
    sender,
    subject: headers.subject ?? "",
    bodyText: extractBody(msg.payload ?? {}),
    receivedAt,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Parsers — ports of src/budget_sync/parsers/{fnb,discovery}.py
// ────────────────────────────────────────────────────────────────────────────

const MONTHS = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
  January: 1, February: 2, March: 3, April: 4, June: 6, July: 7, August: 8,
  September: 9, October: 10, November: 11, December: 12,
};

const FNB_PREFIX = /^FNB\s*:-\)\s*/;
const FNB_PURCHASE = /R(?<amount>[\d,]+\.\d{2})\s+reserved for purchase @\s+(?<merchant>.+?)\s+from\s+(?<account>.+?)\s+a\/c\.\.(?<acctLast>\d+)\s+using card\.\.(?<cardLast>\d+)\.\s*(?<day>\d+)(?<mon>[A-Z][a-z]{2})\s+(?<time>\d{2}:\d{2})/;
const FNB_PAID = /R(?<amount>[\d,]+\.\d{2})\s+paid from\s+(?<account>.+?)\s+a\/c\.\.(?<acctLast>\d+)\s+@\s+(?<channel>Smartapp|Online Banking)\.\s*Ref\.(?<ref>.+?)\.?\s*(?<day>\d+)(?<mon>[A-Z][a-z]{2})\s+(?<time>\d{2}:\d{2})/;
const FNB_TRANSFER = /R(?<amount>[\d,]+\.\d{2})\s+t\/fer from\s+(?<src>.+?)\s+a\/c\.\.(?<srcLast>\d+)\s+to\s+(?<dst>.+?)\s+a\/c\.\.(?<dstLast>\d+)\s+@\s+\S+\.\s*(?<day>\d+)(?<mon>[A-Z][a-z]{2})\s+(?<time>\d{2}:\d{2})/;
const FNB_PAYMENT_LINK = /Payment Link created/;

const DISC_PAYMENT = /Card payment\s+(?<merchant>.+?)\s+–\s+(?<currency>[A-Z]{3}|R)\s*(?<amount>[\d,]+\.\d{2})\s+From\s+\*{3}(?<acctLast>\d{4})\s+Card ending\s+\*{3}(?<cardLast>\d{4})\s+(?<weekday>\w+),\s+(?<day>\d+)\s+(?<month>\w+)(?:\s+\d{4})?\s+at\s+(?<time>\d{2}:\d{2})/;
const DISC_DECLINED = /Card declined\s+(?<merchant>.+?)\s+–\s+(?<currency>[A-Z]{3}|R)\s*(?<amount>[\d,]+\.\d{2})\s+On account ending\s+\*{3}(?<acctLast>\d{4})\s+Card ending\s+\*{3}(?<cardLast>\d{4})\s+(?<reason>.+?)\s+(?<weekday>\w+),\s+(?<day>\d+)\s+(?<month>\w+)(?:\s+\d{4})?\s+at\s+(?<time>\d{2}:\d{2})/;
const DISC_DEBIT = /Debit order\s+R\s*(?<amount>[\d,]+\.\d{2})\s+From account ending\s+\*{3}(?<acctLast>\d{4})\s+Reference:\s+(?<ref>.+?)\s+(?<weekday>\w+),\s+(?<day>\d+)\s+(?<month>\w+)(?:\s+\d{4})?\s+at\s+(?<time>\d{2}:\d{2})/;

function fnbResolveAccount(name, last) {
  if (name.includes("Aspire") || last === "485298") return "Aspire ...485298";
  if (name.toLowerCase().includes("fnb card") || last === "736000") return "FNB Card ...736000";
  return `${name.trim()} ...${last}`;
}

function discResolveAccount(last) {
  if (last === "7557") return "Discovery ...7557";
  return `Discovery ...${last}`;
}

function parseFnb(subject, year, messageId) {
  const m = FNB_PREFIX.exec(subject);
  if (!m) return { error: "no FNB prefix" };
  const body = subject.slice(m[0].length);

  if (FNB_PAYMENT_LINK.test(body)) return { skipped: true };

  const p = FNB_PURCHASE.exec(body);
  if (p) {
    const g = p.groups;
    return {
      tx: {
        date: `${year}-${String(MONTHS[g.mon]).padStart(2, "0")}-${String(g.day).padStart(2, "0")}`,
        time: g.time,
        description: g.merchant.trim(),
        amount: g.amount.replace(/,/g, ""),
        tx_type: "Purchase",
        status: "Completed",
        account: fnbResolveAccount(g.account, g.acctLast),
        bank: "FNB",
        message_id: messageId,
        notes: `Card ${g.cardLast}`,
      },
    };
  }

  const t = FNB_TRANSFER.exec(body);
  if (t) {
    const g = t.groups;
    return {
      tx: {
        date: `${year}-${String(MONTHS[g.mon]).padStart(2, "0")}-${String(g.day).padStart(2, "0")}`,
        time: g.time,
        description: `Transfer — ${g.src.trim()} → ${g.dst.trim()}`,
        amount: g.amount.replace(/,/g, ""),
        tx_type: "Transfer",
        status: "Completed",
        account: fnbResolveAccount(g.src, g.srcLast),
        bank: "FNB",
        message_id: messageId,
        notes: `To ${fnbResolveAccount(g.dst, g.dstLast)}`,
      },
    };
  }

  const pd = FNB_PAID.exec(body);
  if (pd) {
    const g = pd.groups;
    const ref = g.ref.trim().replace(/\.$/, "");
    return {
      tx: {
        date: `${year}-${String(MONTHS[g.mon]).padStart(2, "0")}-${String(g.day).padStart(2, "0")}`,
        time: g.time,
        description: g.channel === "Smartapp" ? `Smartapp — ${ref}` : `Online Banking — ${ref}`,
        amount: g.amount.replace(/,/g, ""),
        tx_type: "EFT Out",
        status: "Completed",
        account: fnbResolveAccount(g.account, g.acctLast),
        bank: "FNB",
        message_id: messageId,
        notes: `Ref: ${ref}`,
      },
    };
  }

  return { error: "FNB prefix matched but no variant regex did" };
}

function parseDiscovery(body, year, messageId) {
  const text = body.replace(/\s+/g, " ").trim();

  const d = DISC_DEBIT.exec(text);
  if (d) {
    const g = d.groups;
    const ref = g.ref.trim();
    return {
      tx: {
        date: `${year}-${String(MONTHS[g.month]).padStart(2, "0")}-${String(g.day).padStart(2, "0")}`,
        time: g.time,
        description: ref,
        amount: g.amount.replace(/,/g, ""),
        tx_type: "Debit Order",
        status: "Completed",
        account: discResolveAccount(g.acctLast),
        bank: "Discovery",
        message_id: messageId,
        notes: `Ref: ${ref}`,
      },
    };
  }

  const dec = DISC_DECLINED.exec(text);
  if (dec) {
    const g = dec.groups;
    const currency = g.currency === "R" ? "ZAR" : g.currency;
    const orig = g.amount.replace(/,/g, "");
    return {
      tx: {
        date: `${year}-${String(MONTHS[g.month]).padStart(2, "0")}-${String(g.day).padStart(2, "0")}`,
        time: g.time,
        description: g.merchant.trim(),
        amount: orig,
        currency,
        original_amount: currency !== "ZAR" ? orig : null,
        tx_type: "Purchase",
        status: "Declined",
        account: discResolveAccount(g.acctLast),
        bank: "Discovery",
        message_id: messageId,
        notes: g.reason.trim(),
      },
    };
  }

  const p = DISC_PAYMENT.exec(text);
  if (p) {
    const g = p.groups;
    const currency = g.currency === "R" ? "ZAR" : g.currency;
    const orig = g.amount.replace(/,/g, "");
    return {
      tx: {
        date: `${year}-${String(MONTHS[g.month]).padStart(2, "0")}-${String(g.day).padStart(2, "0")}`,
        time: g.time,
        description: g.merchant.trim(),
        amount: orig,
        currency,
        original_amount: currency !== "ZAR" ? orig : null,
        tx_type: "Purchase",
        status: "Completed",
        account: discResolveAccount(g.acctLast),
        bank: "Discovery",
        message_id: messageId,
      },
    };
  }

  return { error: "no Discovery variant matched" };
}

// ────────────────────────────────────────────────────────────────────────────
// Supabase client (service role, REST)
// ────────────────────────────────────────────────────────────────────────────

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = process.env.SUPABASE_USER_ID;
const SB_HEADERS = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

async function sbSelect(table, query) {
  const url = new URL(`${SB_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: SB_HEADERS });
  if (!res.ok) throw new Error(`Supabase select ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbInsert(table, rows) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=user_id,message_id`, {
    method: "POST",
    headers: { ...SB_HEADERS, Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase insert ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchCategories() {
  return sbSelect("categories", {
    user_id: `eq.${USER_ID}`,
    select: "id,name",
  });
}

async function fetchCategoryRules() {
  // Active rules ordered by priority (lower first wins)
  return sbSelect("category_rules", {
    user_id: `eq.${USER_ID}`,
    is_active: "eq.true",
    select: "id,pattern,category_id,priority",
    order: "priority.asc",
  });
}

async function fetchAccounts() {
  return sbSelect("accounts", {
    user_id: `eq.${USER_ID}`,
    select: "id,display_name",
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Categorise — apply DB rules in order
// ────────────────────────────────────────────────────────────────────────────

function categorise(description, notes, rules) {
  const haystack = `${description} ${notes ?? ""}`.toLowerCase();
  for (const r of rules) {
    try {
      const re = new RegExp(r.pattern, "i");
      if (re.test(haystack)) return r.category_id;
    } catch {
      // bad regex — skip
    }
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

export async function runSync() {
  console.log("[sync] starting");

  for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_USER_ID",
                   "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]) {
    if (!process.env[k]) throw new Error(`Missing env: ${k}`);
  }

  const accessToken = await getAccessToken();
  console.log("[sync] OAuth token refreshed");

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - SYNC_LOOKBACK_DAYS);
  const sinceStr = since.toISOString().slice(0, 10).replace(/-/g, "/");
  const query = `(from:${FNB_SENDER} OR from:${DISCOVERY_SENDER}) after:${sinceStr}`;

  const ids = await gmailListMessages(accessToken, query);
  console.log(`[sync] Gmail list: ${ids.length} candidate messages since ${sinceStr}`);

  const [categories, rules, accounts] = await Promise.all([
    fetchCategories(),
    fetchCategoryRules(),
    fetchAccounts(),
  ]);
  const accountIdByName = Object.fromEntries(accounts.map((a) => [a.display_name, a.id]));

  let parsed = 0, skipped = 0, errors = 0;
  const rows = [];

  for (const id of ids) {
    let msg;
    try {
      msg = await gmailGetMessage(accessToken, id);
    } catch (e) {
      console.error(`[sync] get ${id} failed:`, e.message);
      errors++;
      continue;
    }
    const re = rawEmail(msg);
    const year = re.receivedAt.getUTCFullYear();

    let result;
    if (re.sender.endsWith(FNB_SENDER)) {
      result = parseFnb(re.subject, year, re.messageId);
    } else if (re.sender.endsWith(DISCOVERY_SENDER)) {
      result = parseDiscovery(re.bodyText, year, re.messageId);
    } else {
      continue;
    }

    if (result.skipped) { skipped++; continue; }
    if (result.error) { errors++; console.warn(`[sync] parse error: ${result.error} (${id})`); continue; }
    parsed++;

    const tx = result.tx;
    const categoryId = categorise(tx.description, tx.notes, rules);
    const accountId = accountIdByName[tx.account] ?? null;

    rows.push({
      user_id: USER_ID,
      occurred_on: tx.date,
      occurred_time: tx.time,
      description: tx.description,
      category_id: categoryId,
      amount_zar: tx.amount,
      currency: tx.currency ?? "ZAR",
      original_amount: tx.original_amount ?? null,
      tx_type: tx.tx_type,
      status: tx.status,
      account_id: accountId,
      bank: tx.bank,
      notes: tx.notes ?? "",
      message_id: tx.message_id,
      source: "sync",
    });
  }

  console.log(`[sync] parsed=${parsed} skipped=${skipped} errors=${errors}`);

  let inserted = 0;
  if (rows.length > 0) {
    // Insert in chunks to avoid PostgREST size limits
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50);
      const result = await sbInsert("transactions", chunk);
      inserted += Array.isArray(result) ? result.length : 0;
    }
  }
  console.log(`[sync] inserted=${inserted} (dedup via unique(user_id,message_id))`);

  return { parsed, skipped, errors, inserted };
}

// Allow running directly: `node cron/sync.mjs`
if (import.meta.url === `file://${process.argv[1]}`) {
  runSync()
    .then((r) => { console.log("done", r); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
