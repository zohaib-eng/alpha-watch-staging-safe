const base = process.env.ZEROX_API_BASE_URL || "https://api.0x.org";

async function call(path, params) {
  const url = new URL(base + path);
  Object.entries(params).forEach(([k,v]) => v != null && url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), {
    headers: {
      ...(process.env.ZEROX_API_KEY ? { "0x-api-key": process.env.ZEROX_API_KEY } : {}),
      "0x-version": "v2"
    }
  });
  if (!res.ok) throw new Error(`0x request failed: ${res.status}`);
  return res.json();
}

export function zeroxPrice(params) {
  return call("/swap/allowance-holder/price", params);
}

export function zeroxQuote(params) {
  return call("/swap/allowance-holder/quote", params);
}
