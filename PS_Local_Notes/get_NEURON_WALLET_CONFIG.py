import json, pathlib

def _normalize_hex_key(s: str) -> str:
    s = s.strip()
    hex_part = s[2:] if s.startswith("0x") else s
    if len(hex_part) != 64 or any(c not in "0123456789abcdefABCDEF" for c in hex_part):
        raise ValueError("wallet.txt line 1 must be a 32-byte hex key (64 hex chars).")
    return "0x" + hex_part.lower()

def get_NEURON_WALLET_CONFIG (wallet_path):
    json_key = json.loads(pathlib.Path(wallet_path).read_text(encoding="utf-8"))
    NEURON_WALLET_CONFIG = {"address": json_key["address"], "private_key": _normalize_hex_key(json_key["rawprivatekey(hex)"])}
    return NEURON_WALLET_CONFIG

wallet_path = r"C:\temp\NeuronKey.json"
NEURON_WALLET_CONFIG = get_NEURON_WALLET_CONFIG(wallet_path)
print(NEURON_WALLET_CONFIG)



