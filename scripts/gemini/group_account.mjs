// Minimal manual decoder for the Group account layout (matches
// programs/ajo_chain/src/state.rs). No borsh dependency needed for a single
// fixed-size struct.

import { PublicKey } from "@solana/web3.js";

const GROUP_SIZE = 5;

export function decodeGroup(data) {
  let offset = 8; // skip anchor discriminator

  const readPubkey = () => {
    const pk = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    return pk;
  };
  const readU64 = () => {
    const v = data.readBigUInt64LE(offset);
    offset += 8;
    return v;
  };
  const readI64 = () => {
    const v = data.readBigInt64LE(offset);
    offset += 8;
    return v;
  };
  const readU8 = () => {
    const v = data.readUInt8(offset);
    offset += 1;
    return v;
  };
  const readBoolArray = (n) => {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push(data.readUInt8(offset + i) !== 0);
    offset += n;
    return arr;
  };

  const creator = readPubkey();
  const groupId = readU64();
  const members = Array.from({ length: GROUP_SIZE }, () => readPubkey());
  const contributionAmount = readU64();
  const roundNumber = readU8();
  const roundDeadline = readI64();
  const roundDurationSecs = readI64();
  const hasContributed = readBoolArray(GROUP_SIZE);
  const defaulted = readBoolArray(GROUP_SIZE);
  const completed = data.readUInt8(offset) !== 0;

  return {
    creator,
    groupId,
    members,
    contributionAmount,
    roundNumber,
    roundDeadline,
    roundDurationSecs,
    hasContributed,
    defaulted,
    completed,
  };
}
