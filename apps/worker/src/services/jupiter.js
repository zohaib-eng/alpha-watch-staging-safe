const base = process.env.JUPITER_SWAP_BASE_URL || "https://lite-api.jup.ag/swap/v1";
const priceBase = "https://price.jup.ag/v4";

export async function jupiterPrice(params) {
  const url = new URL(`${priceBase}/price`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), {
    headers: {
      ...(process.env.JUPITER_API_KEY ? { "x-api-key": process.env.JUPITER_API_KEY } : {})
    }
  });
  if (!res.ok) throw new Error(`Jupiter price failed: ${res.status}`);
  return res.json();
}

export async function jupiterOrder(body) {
  const url = new URL(`${base}/quote`);
  Object.entries(body).forEach(([key, value]) => {
    if (value !== undefined && value !== null && key !== "taker") url.searchParams.set(key, String(value));
  });

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "accept": "application/json",
      ...(process.env.JUPITER_API_KEY ? { "x-api-key": process.env.JUPITER_API_KEY } : {})
    }
  });
  if (!res.ok) throw new Error(`Jupiter quote failed: ${res.status}`);
  return res.json();
}

export async function jupiterExecute(body) {
  const res = await fetch(`${base}/execute`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.JUPITER_API_KEY ? { "x-api-key": process.env.JUPITER_API_KEY } : {})
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Jupiter execute failed: ${res.status}`);
  return res.json();
}
