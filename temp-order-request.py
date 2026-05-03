import urllib.request
import json

payload = json.dumps({
    "candidateId": "SOL/USDC-1776536508341-l0seunmzi",
    "wallet": "11111111111111111111111111111112"
}).encode("utf-8")

req = urllib.request.Request(
    "http://localhost:3003/api/trades/order",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST"
)

try:
    with urllib.request.urlopen(req, timeout=20) as res:
        print("STATUS", res.status)
        print(res.read().decode("utf-8")[:1000])
except urllib.error.HTTPError as e:
    print("STATUS", e.code)
    print(e.read().decode("utf-8")[:1000])
