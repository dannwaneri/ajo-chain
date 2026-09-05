// Creates a group on devnet where one member deliberately never contributes,
// waits past the round deadline, and calls mark_default -- producing a real
// disputed-default case (with real on-chain evidence) to test the Gemini
// adjudication script against.
//
// Usage: node scripts/devnet_default_scenario.mjs

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROGRAM_ID = new PublicKey("9RGBLQCcQnsiCdu9RcmEzG4SvihkfTvi1KMz98KCWPoT");
const DEVNET_URL = "https://api.devnet.solana.com";
const GROUP_SIZE = 5;
const CONTRIBUTION_LAMPORTS = 1_000_000;
const ROUND_DURATION_SECS = 25n; // short, so the demo doesn't have to wait long
const MEMBER_FUNDING_LAMPORTS = 10_000_000;

const DISCRIMINATORS = {
  create_group: Buffer.from([79, 60, 158, 134, 61, 199, 56, 248]),
  contribute: Buffer.from([82, 33, 68, 131, 32, 0, 205, 95]),
  mark_default: Buffer.from([182, 231, 123, 132, 66, 208, 137, 139]),
};

function loadKeypair(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}
function explorerTx(sig) {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}
function u64le(n) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n));
  return buf;
}
function i64le(n) {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(n));
  return buf;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const connection = new Connection(DEVNET_URL, "confirmed");
  const creator = loadKeypair(path.join(os.homedir(), ".config/solana/id.json"));

  const members = Array.from({ length: GROUP_SIZE }, () => Keypair.generate());
  const groupId = BigInt(Date.now());

  const [groupPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("group"), creator.publicKey.toBuffer(), u64le(groupId)],
    PROGRAM_ID
  );
  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), groupPda.toBuffer()],
    PROGRAM_ID
  );

  console.log(`Group PDA:  ${groupPda.toBase58()}`);
  const defaultingMember = members[4];
  console.log(`Deliberately defaulting member: ${defaultingMember.publicKey.toBase58()}`);

  console.log("\nFunding member wallets...");
  const fundTx = new Transaction();
  for (const member of members) {
    fundTx.add(
      SystemProgram.transfer({
        fromPubkey: creator.publicKey,
        toPubkey: member.publicKey,
        lamports: MEMBER_FUNDING_LAMPORTS,
      })
    );
  }
  await sendAndConfirmTransaction(connection, fundTx, [creator]);
  console.log("  funded 5 members");

  console.log("\nCreating group (25s round deadline)...");
  const membersData = Buffer.concat(members.map((m) => m.publicKey.toBuffer()));
  const createGroupData = Buffer.concat([
    DISCRIMINATORS.create_group,
    u64le(groupId),
    membersData,
    u64le(CONTRIBUTION_LAMPORTS),
    i64le(ROUND_DURATION_SECS),
  ]);
  const createGroupIx = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: creator.publicKey, isSigner: true, isWritable: true },
      { pubkey: groupPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: createGroupData,
  };
  const createSig = await sendAndConfirmTransaction(connection, new Transaction().add(createGroupIx), [creator]);
  console.log(`  group created -> ${explorerTx(createSig)}`);

  console.log("\nCollecting contributions from members 0-3 (member 4 deliberately skips)...");
  for (const member of members.slice(0, 4)) {
    const ix = {
      programId: PROGRAM_ID,
      keys: [
        { pubkey: member.publicKey, isSigner: true, isWritable: true },
        { pubkey: groupPda, isSigner: false, isWritable: true },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: DISCRIMINATORS.contribute,
    };
    const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [member]);
    console.log(`  ${member.publicKey.toBase58()} contributed -> ${explorerTx(sig)}`);
  }

  console.log(`\nWaiting ${ROUND_DURATION_SECS}s for the round deadline to pass...`);
  await sleep(Number(ROUND_DURATION_SECS) * 1000 + 3000);

  console.log("Calling mark_default...");
  const markDefaultIx = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: creator.publicKey, isSigner: true, isWritable: false },
      { pubkey: groupPda, isSigner: false, isWritable: true },
    ],
    data: DISCRIMINATORS.mark_default,
  };
  const markSig = await sendAndConfirmTransaction(connection, new Transaction().add(markDefaultIx), [creator]);
  console.log(`  mark_default -> ${explorerTx(markSig)}`);

  console.log("\nDisputed default is live on devnet. Run:");
  console.log(
    `  node scripts/gemini/adjudicate_dispute.mjs ${groupPda.toBase58()} ${defaultingMember.publicKey.toBase58()} 0`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
