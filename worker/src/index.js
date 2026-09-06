import { decodeGroup } from "./group_account.js";
import { getAccountInfoBase64, getSignaturesForAddress, getBalance } from "./solana_rpc.js";
import { draftAdjudicationNote, sendTelegramMessage } from "./adjudicate.js";

function explorerTx(sig) {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}
function explorerAddress(pk) {
  return `https://explorer.solana.com/address/${pk}?cluster=devnet`;
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function html(body) {
  return new Response(body, { headers: { "content-type": "text/html;charset=UTF-8" } });
}

// The status page is public and unauthenticated (anyone can POST /disputes),
// so anything not verified to be a real base58 pubkey/signature -- notably
// Gemini's free-form note text -- must be escaped before going into HTML.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function handleSync(request, env) {
  const { groupPubkey } = await request.json();
  if (!groupPubkey) return json({ error: "groupPubkey required" }, 400);

  const dataB64 = await getAccountInfoBase64(env.SOLANA_RPC_URL, groupPubkey);
  if (!dataB64) return json({ error: "group account not found on-chain" }, 404);
  const group = decodeGroup(dataB64);

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO groups (pubkey, creator, contribution_amount_lamports, round_duration_secs, round_number, round_deadline, completed, synced_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT(pubkey) DO UPDATE SET
       round_number = excluded.round_number,
       round_deadline = excluded.round_deadline,
       completed = excluded.completed,
       synced_at = excluded.synced_at`
  )
    .bind(
      groupPubkey,
      group.creator,
      group.contributionAmount.toString(),
      Number(group.roundDurationSecs),
      group.roundNumber,
      Number(group.roundDeadline),
      group.completed ? 1 : 0,
      now
    )
    .run();

  for (let i = 0; i < group.members.length; i++) {
    await env.DB.prepare(
      `INSERT INTO members (group_pubkey, idx, wallet_address, has_contributed, defaulted)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(group_pubkey, idx) DO UPDATE SET
         has_contributed = excluded.has_contributed,
         defaulted = excluded.defaulted`
    )
      .bind(groupPubkey, i, group.members[i], group.hasContributed[i] ? 1 : 0, group.defaulted[i] ? 1 : 0)
      .run();
  }

  // Every instruction (create_group, contribute, mark_default, release_payout)
  // touches the group account as writable, so its own signature history is a
  // complete transaction log for the group -- no separate escrow lookup needed.
  const signatures = await getSignaturesForAddress(env.SOLANA_RPC_URL, groupPubkey, 50);
  for (const sig of signatures) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO transactions (signature, group_pubkey, block_time, err) VALUES (?1, ?2, ?3, ?4)`
    )
      .bind(sig.signature, groupPubkey, sig.blockTime ?? null, sig.err ? JSON.stringify(sig.err) : null)
      .run();
  }

  return json({ synced: true, group: { ...group, contributionAmount: group.contributionAmount.toString(), groupId: group.groupId.toString(), roundDeadline: Number(group.roundDeadline), roundDurationSecs: Number(group.roundDurationSecs) }, transactionsIndexed: signatures.length });
}

async function handleDispute(request, env) {
  const { groupPubkey, memberPubkey, round } = await request.json();
  if (!groupPubkey || !memberPubkey || round === undefined) {
    return json({ error: "groupPubkey, memberPubkey, round required" }, 400);
  }

  const dataB64 = await getAccountInfoBase64(env.SOLANA_RPC_URL, groupPubkey);
  if (!dataB64) return json({ error: "group account not found on-chain" }, 404);
  const group = decodeGroup(dataB64);
  const memberIndex = group.members.indexOf(memberPubkey);
  if (memberIndex === -1) return json({ error: "not a member of this group" }, 400);

  const [signatures, balance] = await Promise.all([
    getSignaturesForAddress(env.SOLANA_RPC_URL, memberPubkey, 25),
    getBalance(env.SOLANA_RPC_URL, memberPubkey),
  ]);

  const evidence = {
    group: {
      pubkey: groupPubkey,
      roundNumber: group.roundNumber,
      roundDeadlineIso: new Date(Number(group.roundDeadline) * 1000).toISOString(),
      roundDurationSecs: Number(group.roundDurationSecs),
      contributionAmountLamports: group.contributionAmount.toString(),
      completed: group.completed,
    },
    member: {
      pubkey: memberPubkey,
      index: memberIndex,
      currentBalanceLamports: balance,
      hasContributedThisRound: group.hasContributed[memberIndex],
      isFlaggedDefaulted: group.defaulted[memberIndex],
    },
    disputedRound: round,
    recentActivity: signatures.map((s) => ({
      signature: s.signature,
      blockTime: s.blockTime ? new Date(s.blockTime * 1000).toISOString() : null,
      err: s.err ?? null,
      confirmationStatus: s.confirmationStatus ?? null,
    })),
  };

  const note = await draftAdjudicationNote(evidence, { apiKey: env.GEMINI_API_KEY });

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO disputes (group_pubkey, member_wallet, round_number, evidence_json, note, status, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6)`
  )
    .bind(groupPubkey, memberPubkey, round, JSON.stringify(evidence), note, now)
    .run();

  let telegramSent = false;
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    await sendTelegramMessage({
      botToken: env.TELEGRAM_BOT_TOKEN,
      chatId: env.TELEGRAM_CHAT_ID,
      text: `Ajo Chain dispute review needed\nGroup: ${groupPubkey}\nMember: ${memberPubkey}\nRound: ${round}\n\n${note}`,
    });
    telegramSent = true;
  }

  return json({ note, telegramSent, evidence });
}

function renderStatusPage({ groupPubkey, group, members, transactions, disputes }) {
  const rows = members
    .map((m) => {
      const isNext = group && !group.completed && m.idx === group.round_number;
      return `<tr class="${isNext ? "next" : ""}">
        <td>${m.idx + 1}</td>
        <td><code>${escapeHtml(m.wallet_address)}</code></td>
        <td>${m.has_contributed ? "✅ contributed" : "⬜ pending"}</td>
        <td>${m.defaulted ? "🚩 defaulted (permanent record)" : "—"}</td>
        <td>${isNext ? "→ next payout" : ""}</td>
      </tr>`;
    })
    .join("\n");

  const txRows = transactions
    .map(
      (t) =>
        `<tr><td>${t.block_time ? new Date(t.block_time * 1000).toISOString() : "unknown"}</td>
         <td><a href="${explorerTx(t.signature)}" target="_blank" rel="noopener">${escapeHtml(t.signature.slice(0, 16))}…</a></td>
         <td>${t.err ? "❌ failed" : "✅ success"}</td></tr>`
    )
    .join("\n");

  const disputeRows = disputes
    .map(
      (d) =>
        `<tr><td>${escapeHtml(d.member_wallet.slice(0, 8))}…</td><td>${escapeHtml(d.round_number)}</td><td>${escapeHtml(d.status)}</td>
         <td style="white-space:pre-wrap">${escapeHtml(d.note)}</td></tr>`
    )
    .join("\n");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Ajo Chain — Group Status</title>
<style>
body{font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#1a1a1a;background:#fafafa}
h1{font-size:1.4rem}
table{width:100%;border-collapse:collapse;margin:1rem 0}
th,td{text-align:left;padding:.5rem;border-bottom:1px solid #ddd;font-size:.9rem}
tr.next{background:#fff8e1}
code{font-size:.8rem;word-break:break-all}
a{color:#5145f0}
.pill{display:inline-block;padding:.2rem .6rem;border-radius:999px;background:#eee;font-size:.8rem}
</style></head>
<body>
<h1>Ajo Chain — Group Transparency</h1>
<p><span class="pill">devnet</span> Group: <a href="${explorerAddress(groupPubkey)}" target="_blank">${escapeHtml(groupPubkey)}</a></p>
${
  group
    ? `<p>Round ${group.round_number + 1} of 5 &middot; ${group.completed ? "✅ circle complete" : "in progress"} &middot; contribution ${group.contribution_amount_lamports} lamports/round</p>`
    : `<p>No cached state yet — POST /sync with this group's pubkey first.</p>`
}
<h2>Rotation order &amp; this round</h2>
<table><thead><tr><th>#</th><th>Wallet</th><th>Round status</th><th>Default record</th><th></th></tr></thead>
<tbody>${rows || "<tr><td colspan=5>No members cached yet.</td></tr>"}</tbody></table>

<h2>On-chain transaction log</h2>
<table><thead><tr><th>Time</th><th>Signature</th><th>Result</th></tr></thead>
<tbody>${txRows || "<tr><td colspan=3>No transactions indexed yet.</td></tr>"}</tbody></table>

<h2>Dispute adjudication (Gemini-drafted, human-reviewed)</h2>
<table><thead><tr><th>Member</th><th>Round</th><th>Status</th><th>Note</th></tr></thead>
<tbody>${disputeRows || "<tr><td colspan=4>No disputes.</td></tr>"}</tbody></table>
</body></html>`;
}

async function handleStatus(groupPubkey, env) {
  const groupRow = await env.DB.prepare(`SELECT * FROM groups WHERE pubkey = ?1`).bind(groupPubkey).first();
  const members = (
    await env.DB.prepare(`SELECT * FROM members WHERE group_pubkey = ?1 ORDER BY idx`).bind(groupPubkey).all()
  ).results;
  const transactions = (
    await env.DB.prepare(`SELECT * FROM transactions WHERE group_pubkey = ?1 ORDER BY block_time DESC LIMIT 50`)
      .bind(groupPubkey)
      .all()
  ).results;
  const disputes = (
    await env.DB.prepare(`SELECT * FROM disputes WHERE group_pubkey = ?1 ORDER BY created_at DESC`)
      .bind(groupPubkey)
      .all()
  ).results;

  return html(renderStatusPage({ groupPubkey, group: groupRow, members, transactions, disputes }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return html(
        `<!doctype html><title>Ajo Chain</title><body style="font-family:system-ui;max-width:640px;margin:3rem auto">
        <h1>Ajo Chain orchestration API</h1>
        <p>POST /sync {"groupPubkey"} — index a group's on-chain state and transactions</p>
        <p>POST /disputes {"groupPubkey","memberPubkey","round"} — Gemini dispute adjudication</p>
        <p>GET /status/:groupPubkey — public transparency page</p></body>`
      );
    }

    if (url.pathname === "/sync" && request.method === "POST") {
      try {
        return await handleSync(request, env);
      } catch (err) {
        return json({ error: String(err) }, 500);
      }
    }

    if (url.pathname === "/disputes" && request.method === "POST") {
      try {
        return await handleDispute(request, env);
      } catch (err) {
        return json({ error: String(err) }, 500);
      }
    }

    const statusMatch = url.pathname.match(/^\/status\/([1-9A-HJ-NP-Za-km-z]{32,44})$/);
    if (statusMatch && request.method === "GET") {
      try {
        return await handleStatus(statusMatch[1], env);
      } catch (err) {
        return json({ error: String(err) }, 500);
      }
    }

    return json({ error: "not found" }, 404);
  },
};
