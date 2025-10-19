/**
 * CKB Service Bridge for Browser
 * Exposes ckbService functions to vanilla JavaScript
 * This is a plain JS file that can be loaded directly in the browser
 */

import { connect, signTransaction } from "@joyid/ckb";
import { config, helpers, RPC, Indexer, BI } from '@ckb-lumos/lumos';

// ---------------- Configuration ----------------
const DEBUG_LOG = true;
const USE_MAINNET = false;
const USE_PRIVATE_NODE = false;

// JoyID endpoints
const JOYID_NET = USE_MAINNET ? 'mainnet' : 'testnet';
const JOYID_APP_URL = USE_MAINNET ? 'https://app.joy.id' : 'https://testnet.joyid.dev';
const JOYID_API_URL = USE_MAINNET ? 'https://api.joy.id' : 'https://api.joyid.dev';

// RPC/Indexer endpoints
const RPC_URL = USE_PRIVATE_NODE
  ? (USE_MAINNET ? 'http://192.168.178.94:8114' : 'http://192.168.178.94:8112')
  : (USE_MAINNET ? 'https://mainnet.ckb.dev/rpc' : 'https://testnet.ckb.dev/rpc');

const INDEXER_URL = USE_PRIVATE_NODE
  ? (USE_MAINNET ? 'http://192.168.178.94:8114' : 'http://192.168.178.94:8112')
  : (USE_MAINNET ? 'https://mainnet.ckb.dev/indexer' : 'https://testnet.ckb.dev/indexer');

// ---------------- Initialization ----------------
config.initializeConfig(USE_MAINNET ? config.predefined.LINA : config.predefined.AGGRON4);

const boundFetch = typeof window !== 'undefined'
  ? window.fetch.bind(window)
  : (globalThis.fetch ? globalThis.fetch.bind(globalThis) : undefined);

const rpc = new RPC(RPC_URL, { fetch: boundFetch });

let indexer;
if (USE_PRIVATE_NODE) {
  indexer = new Indexer(INDEXER_URL, { fetch: boundFetch });
} else {
  indexer = new Indexer(INDEXER_URL, RPC_URL, { fetch: boundFetch });
}

// ---------------- Constants ----------------
const CKB_DECIMAL = BigInt(10 ** 8);

// ---------------- Utility Functions ----------------
const padCkb = (s) => {
  const [i, f = "0"] = s.split(".");
  return `${i}.${(f + "00000000").slice(0, 8)}`;
};

function shannons2CKB(shannons) {
  const s = typeof shannons === "bigint" ? shannons : BigInt(shannons);
  const neg = s < 0n;
  const abs = neg ? -s : s;

  const integer = abs / CKB_DECIMAL;
  const fraction = abs % CKB_DECIMAL;

  const fracStr = fraction.toString().padStart(8, "0");
  return `${neg ? "-" : ""}${integer.toString()}.${fracStr}`;
}

async function getSpendableCapacityShannons(address, indexerInstance = indexer) {
  const lock = helpers.parseAddress(address);
  const collector = indexerInstance.collector({ lock, type: "empty", data: "0x" });

  const isPlainCkbCell = (cell) =>
    !cell?.cellOutput?.type &&
    (cell?.data === '0x' || cell?.data === undefined);

  let balance = BigInt(0);
  let cellCount = 0;

  for await (const cell of collector.collect()) {
    if (!isPlainCkbCell(cell)) {
      if (DEBUG_LOG) console.warn("Skipping cell without capacity:", cell);
      continue;
    }
    balance += BigInt(cell.cellOutput.capacity);
    cellCount++;
  }

  if (DEBUG_LOG) {
    console.log(`Spendable cells found: ${cellCount}, total capacity: ${balance.toString()} balance`);
  }

  return balance;
}

function toSnakeCaseTx(tx) {
  const keyMap = {
    cellDeps: "cell_deps",
    headerDeps: "header_deps",
    outputsData: "outputs_data",
    outPoint: "out_point",
    depType: "dep_type",
    previousOutput: "previous_output",
    txHash: "tx_hash",
    codeHash: "code_hash",
    hashType: "hash_type",
  };

  function normalizeValueForKey(key, value) {
    if (key === "dep_type" && typeof value === "string") {
      if (value === "depGroup") return "dep_group";
      if (value === "DepGroup") return "dep_group";
      if (value === "CODE") return "code";
      if (value === "DEP_GROUP") return "dep_group";
      if (value === "dep_group" || value === "code") return value;
    }
    return value;
  }

  const convert = (v) => {
    if (Array.isArray(v)) return v.map(convert);
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        const mappedKey = keyMap[k] ?? k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
        const convertedVal = convert(val);
        out[mappedKey] = normalizeValueForKey(mappedKey, convertedVal);
      }
      return out;
    }
    return v;
  };

  const out = convert(tx);

  if (out.outputsData && !out.outputs_data) {
    out.outputs_data = out.outputsData;
    delete out.outputsData;
  }
  if (out.headerDeps && !out.header_deps) {
    out.header_deps = out.headerDeps;
    delete out.headerDeps;
  }
  if (out.cellDeps && !out.cell_deps) {
    out.cell_deps = out.cellDeps;
    delete out.cellDeps;
  }

  if (typeof out.version === "number") {
    out.version = "0x" + out.version.toString(16);
  } else if (typeof out.version === "bigint") {
    out.version = "0x" + out.version.toString(16);
  }

  return out;
}

// ---------------- Main Service Functions ----------------
async function connectJoyID() {
  const logo = new URL('./logo.png', import.meta.url).href;
  const auth = await connect({
    rpcURL: RPC_URL,
    network: JOYID_NET,
    name: 'Votesecure',
    logo: 'https://psawyer.de/votesecure/pic/logo.png',
  });

  const address = auth.address;
  const spendable = await getSpendableCapacityShannons(address, indexer);
  
  return {
    address,
    balance: padCkb(shannons2CKB(spendable)),
    network: JOYID_NET
  };
}

async function signAndSendTransaction(fromAddress, toAddress, amountCkb) {
  const shannons = BigInt(Math.floor(Number(amountCkb) * 1e8)).toString();
  const spendable = await getSpendableCapacityShannons(fromAddress, indexer);

  const FEE_BUFFER = BI.from(1_000n);
  const spendableBI = BI.from(spendable);
  const amountBI = BI.from(shannons);
  const needBI = amountBI.add(FEE_BUFFER);

  if (spendableBI.lt(needBI)) {
    throw new Error(
      `Insufficient spendable balance: have ${spendableBI.toString()} shannons, ` +
      `need ≥ ${needBI.toString()} (amount ${amountBI.toString()} + fee buffer ${FEE_BUFFER.toString()}).`
    );
  }

  if (DEBUG_LOG) {
    console.log(
      `Transaction Info: from ${fromAddress} → ${toAddress}, amount ${shannons.toString()} shannons (spendable ${spendable.toString()})`
    );
  }

  const signedTx = await signTransaction({
    from: fromAddress,
    to: toAddress,
    amount: shannons,
    rpcURL: RPC_URL,
    network: JOYID_NET,
    name: 'PS First dApp',
    logo: '/logo.png',
  });

  if (DEBUG_LOG) {
    console.log(`signTransaction:`, signedTx);
  }

  const rpcTx = toSnakeCaseTx(signedTx);

  if (DEBUG_LOG) {
    console.log(`signed RPC Transaction:`, rpcTx);
  }

  let txHash;
  try {
    txHash = await rpc.sendTransaction(signedTx, 'passthrough');
    if (DEBUG_LOG) {
      console.log("Transaction sent, txHash:", txHash);
    }
  } catch (err) {
    if (DEBUG_LOG) {
      console.error("Error sending transaction:", err);
      console.log("SignedTx that failed:", signedTx);
    }
    throw err;
  }

  return txHash;
}

// ---------------- Export to Window ----------------
// Make functions available globally for organizer.js
window.CKBService = {
  connectJoyID,
  signAndSendTransaction,
  getSpendableCapacityShannons,
  shannons2CKB,
  padCkb,
  config: {
    USE_MAINNET,
    USE_PRIVATE_NODE,
    RPC_URL,
    INDEXER_URL,
    JOYID_NET
  },
  // Status indicator
  isReady: true
};

// Dispatch custom event to notify that service is ready
window.dispatchEvent(new CustomEvent('ckbServiceReady', {
  detail: {
    network: JOYID_NET,
    rpcUrl: RPC_URL,
    indexerUrl: INDEXER_URL
  }
}));

console.log('✓ CKB Service Bridge loaded successfully');
console.log(`  Network: ${JOYID_NET}`);
console.log(`  RPC: ${RPC_URL}`);
console.log(`  Indexer: ${INDEXER_URL}`);