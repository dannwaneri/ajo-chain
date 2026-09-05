// Gathers the on-chain evidence Gemini needs to adjudicate a disputed
// default: the group's round state, plus the flagged member's transaction
// history around the round deadline (successes, failures, or total silence).

import { Connection, PublicKey } from "@solana/web3.js";
import { decodeGroup } from "./group_account.mjs";

export async function gatherEvidence({ connection, groupPubkey, memberPubkey, round }) {
  const groupAccount = await connection.getAccountInfo(new PublicKey(groupPubkey));
  if (!groupAccount) throw new Error(`Group account not found: ${groupPubkey}`);
  const group = decodeGroup(groupAccount.data);

  const memberIndex = group.members.findIndex((m) => m.toBase58() === memberPubkey);
  if (memberIndex === -1) throw new Error(`${memberPubkey} is not a member of this group`);

  const memberKey = new PublicKey(memberPubkey);
  const signatures = await connection.getSignaturesForAddress(memberKey, { limit: 25 });
  const balance = await connection.getBalance(memberKey);

  // Deadline for the disputed round: if we're past round_number, we don't have
  // the historical deadline on-chain (it gets overwritten each round), so we
  // report the current deadline as context and let Gemini reason from the tx
  // timestamps regardless.
  const roundDeadlineIso = new Date(Number(group.roundDeadline) * 1000).toISOString();

  const recentActivity = signatures.map((s) => ({
    signature: s.signature,
    blockTime: s.blockTime ? new Date(s.blockTime * 1000).toISOString() : null,
    err: s.err ?? null,
    confirmationStatus: s.confirmationStatus ?? null,
  }));

  return {
    group: {
      pubkey: groupPubkey,
      roundNumber: group.roundNumber,
      roundDeadlineIso,
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
    recentActivity,
  };
}

export function connectDevnet() {
  return new Connection("https://api.devnet.solana.com", "confirmed");
}
