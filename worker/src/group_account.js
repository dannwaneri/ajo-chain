// Manual decoder for the on-chain Group account layout (matches
// programs/ajo_chain/src/state.rs). Kept dependency-free so the Worker
// doesn't need to bundle @solana/web3.js just to read one struct.

const GROUP_SIZE = 5;

function base58Encode(bytes) {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  for (const byte of bytes) {
    if (byte === 0) digits.push(0);
    else break;
  }
  return digits
    .reverse()
    .map((d) => ALPHABET[d])
    .join("");
}

export function decodeGroup(base64Data) {
  const data = Buffer.from(base64Data, "base64");
  let offset = 8; // skip anchor discriminator

  const readPubkey = () => {
    const pk = base58Encode(data.subarray(offset, offset + 32));
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
