const base = process.env.ZEROX_API_BASE_URL || 'https://api.0x.org';

async function call(path, params) {
  const url = new URL(base + path);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  });

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      ...(process.env.ZEROX_API_KEY ? { '0x-api-key': process.env.ZEROX_API_KEY } : {}),
      '0x-version': 'v2'
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`0x request failed ${res.status}: ${text}`);
  return JSON.parse(text);
}

export function zeroxPrice(params) {
  return call('/swap/allowance-holder/price', params);
}

export function zeroxQuote(params) {
  return call('/swap/allowance-holder/quote', params);
}
