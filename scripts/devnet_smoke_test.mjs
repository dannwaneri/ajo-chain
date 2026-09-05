// One-shot devnet end-to-end smoke test for the Ajo Chain Anchor program.
// Creates a fresh group, has all 5 members contribute, and releases the
// payout to the first member in rotation order — all on real devnet, so the
// resulting signatures can be linked from Solana Explorer.
//
// Usage: node scripts/devnet_smoke_test.mjs

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
const CONTRIBUTION_LAMPORTS = 1_000_000; // 0.001 SOL per member per round
const ROUND_DURATION_SECS = 300n; // 5 minutes, generous for a manual demo
const MEMBER_FUNDING_LAMPORTS = 10_000_000; // 0.01 SOL, covers contribution + fees

const DISCRIMINATORS = {
  create_group: Buffer.from([79, 60, 158, 134, 61, 199, 56, 248]),
  contribute: Buffer.from([82, 33, 68, 131, 32, 0, 205, 95]),
  release_payout: Buffer.from([181, 87, 198, 92, 64, 3, 24, 155]),
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

async function main() {
  const connection = new Connection(DEVNET_URL, "confirmed");
  const creator = loadKeypair(path.join(os.homedir(), ".config/solana/id.json"));

  const balance = await connection.getBalance(creator.publicKey);
  console.log(`Creator ${creator.publicKey.toBase58()} balance: ${balance / 1e9} SOL`);
  if (balance < MEMBER_FUNDING_LAMPORTS * GROUP_SIZE + 20_000_000) {
    throw new Error("Creator wallet needs more devnet SOL — request more from the faucet.");
  }

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
  console.log(`Escrow PDA: ${escrowPda.toBase58()}`);

  // Fund each member from the creator wallet.
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
  const fundSig = await sendAndConfirmTransaction(connection, fundTx, [creator]);
  console.log(`  funded 5 members -> ${explorerTx(fundSig)}`);

  // create_group
  console.log("\nCreating group...");
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
  const createGroupSig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(createGroupIx),
    [creator]
  );
  console.log(`  group created -> ${explorerTx(createGroupSig)}`);

  // contribute x5
  console.log("\nCollecting contributions...");
  const contributeIxData = DISCRIMINATORS.contribute;
  for (const member of members) {
    const ix = {
      programId: PROGRAM_ID,
      keys: [
        { pubkey: member.publicKey, isSigner: true, isWritable: true },
        { pubkey: groupPda, isSigner: false, isWritable: true },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: contributeIxData,
    };
    const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [member]);
    console.log(`  ${member.publicKey.toBase58()} contributed -> ${explorerTx(sig)}`);
  }

  // release_payout to members[0]
  console.log("\nReleasing payout to round-1 recipient...");
  const recipient = members[0].publicKey;
  const recipientBalanceBefore = await connection.getBalance(recipient);
  const releaseIx = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: creator.publicKey, isSigner: true, isWritable: false },
      { pubkey: groupPda, isSigner: false, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: recipient, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: DISCRIMINATORS.release_payout,
  };
  const releaseSig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(releaseIx),
    [creator]
  );
  const recipientBalanceAfter = await connection.getBalance(recipient);
  console.log(`  payout released -> ${explorerTx(releaseSig)}`);
  console.log(
    `  recipient balance: ${recipientBalanceBefore / 1e9} SOL -> ${recipientBalanceAfter / 1e9} SOL` +
      ` (+${(recipientBalanceAfter - recipientBalanceBefore) / 1e9} SOL)`
  );

  console.log("\nFull round cycle confirmed end-to-end on devnet.");
  console.log(`Group account: https://explorer.solana.com/address/${groupPda.toBase58()}?cluster=devnet`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
