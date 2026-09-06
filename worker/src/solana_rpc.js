// Minimal raw JSON-RPC client for devnet reads. Avoids bundling
// @solana/web3.js in the Worker for what's just a handful of GET-style calls.

async function rpcCall(rpcUrl, method, params) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`RPC ${method} failed: ${JSON.stringify(json.error)}`);
  return json.result;
}

export async function getAccountInfoBase64(rpcUrl, pubkey) {
  const result = await rpcCall(rpcUrl, "getAccountInfo", [pubkey, { encoding: "base64" }]);
  if (!result?.value) return null;
  return result.value.data[0];
}

export async function getSignaturesForAddress(rpcUrl, pubkey, limit = 25) {
  return rpcCall(rpcUrl, "getSignaturesForAddress", [pubkey, { limit }]);
}

export async function getBalance(rpcUrl, pubkey) {
  const result = await rpcCall(rpcUrl, "getBalance", [pubkey]);
  return result?.value ?? 0;
}
