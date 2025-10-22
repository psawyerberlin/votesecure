/**
 * CKB Service Bridge for Browser
 * Exposes ckbService functions to vanilla JavaScript
 * Integrated with VoteSecure Lockscript Configuration
 * This is a plain JS file that can be loaded directly in the browser
 */

import { connect, signTransaction } from "@joyid/ckb";
import { config, helpers, RPC, Indexer, BI } from '@ckb-lumos/lumos';

// ============================================================================
// VOTESECURE LOCKSCRIPT CONFIGURATION
// ============================================================================
// Loaded from deployment - this is the deployed VoteSecure contract
const VOTESECURE_CONFIG = {
  lockscript: {
    codeHash: "0x3b3f2d37f03fac4145aeb092d1e925b5624c86b2d7c9717d526be708c9efb6e1",
    hashType: "data",
    txHash: "0x0ebf65d3adbabb40bae687283b0a51b3dd0fa619e78c890fe0ba516f4eae061f",
    outPoint: {
      txHash: "0x0ebf65d3adbabb40bae687283b0a51b3dd0fa619e78c890fe0ba516f4eae061f",
      index: "0x0"
    },
    deployedAt: "2025-10-21T00:16:14.394657",
    deployedBy: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqdw2upan53dl6efk64fz6luewp8m6mjffctw548v",
    network: "testnet",
    binarySizeBytes: 3672,
    capacityShannons: 7100003672,
    capacityCkb: 71.00003672,
    rpcUrl: "http://192.168.178.94:8112",
    indexerUrl: "http://192.168.178.94:8112"
  }
};

// ============================================================================
// VOTESECURE CELL TYPE IDENTIFIERS
// ============================================================================
const VOTESECURE_CELL_TYPES = {
  METADATA: 0x01,
  VOTER: 0x02,
  RESULT: 0x03,
  EVENTFUND: 0x04  // New EventFund cell type
};

// ============================================================================
// CONFIGURATION
// ============================================================================
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

// ============================================================================
// INITIALIZATION
// ============================================================================
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

// ============================================================================
// CONSTANTS
// ============================================================================
const CKB_DECIMAL = BigInt(10 ** 8);
const MIN_CELL_CAPACITY = BigInt(61) * BigInt(100000000);  // 61 CKB in shannons
const EVENTFUND_CELL_CAPACITY = BigInt(70) * BigInt(100000000);  // 70 CKB per voter cell
const METADATA_CELL_CAPACITY = BigInt(150) * BigInt(100000000);  // 150 CKB for metadata

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

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

/**
 * Encode event fund cell data
 * @param {Object} data - EventFund data
 * @returns {string} Hex encoded data
 */
function encodeEventFundData(data) {
  const jsonStr = JSON.stringify(data);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(jsonStr);
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Encode voter cell data
 * @param {Object} data - Voter cell data
 * @returns {string} Hex encoded data
 */
function encodeVoterData(data) {
  const jsonStr = JSON.stringify(data);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(jsonStr);
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Encode metadata cell data
 * @param {Object} data - Metadata
 * @returns {string} Hex encoded data
 */
function encodeMetadataData(data) {
  const jsonStr = JSON.stringify(data);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(jsonStr);
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Encode result cell data
 * @param {Object} data - Result data
 * @returns {string} Hex encoded data
 */
function encodeResultData(data) {
  const jsonStr = JSON.stringify(data);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(jsonStr);
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
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
    console.log(`Spendable cells found: ${cellCount}, total capacity: ${balance.toString()} shannons`);
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

// ============================================================================
// MAIN SERVICE FUNCTIONS
// ============================================================================

/**
 * Connect to JoyID wallet
 * @returns {{address: string, balance: string, network: string}}
 */
async function connectJoyID() {
  try {
    if (DEBUG_LOG) {
      console.log('Connecting to JoyID...');
    }

    const logo = new URL('./logo.png', import.meta.url).href;
    const auth = await connect({
      rpcURL: RPC_URL,
      network: JOYID_NET,
      name: 'VoteSecure',
      logo: 'https://psawyer.de/votesecure/pic/logo.png',
    });

    const address = auth.address;
    
    if (DEBUG_LOG) {
      console.log('JoyID connected:', address);
    }

    const spendable = await getSpendableCapacityShannons(address, indexer);
    
    return {
      address,
      balance: padCkb(shannons2CKB(spendable)),
      network: JOYID_NET
    };
  } catch (error) {
    console.error('JoyID connection failed:', error);
    throw new Error(`Failed to connect JoyID: ${error.message}`);
  }
}

/**
 * Sign and send a transaction
 * @param {string} fromAddress - Sender address
 * @param {string} toAddress - Recipient address
 * @param {number} amountCkb - Amount in CKB
 * @returns {string} Transaction hash
 */
async function signAndSendTransaction(fromAddress, toAddress, amountCkb) {
  try {
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
      name: 'VoteSecure',
      logo: 'https://psawyer.de/votesecure/pic/logo.png',
    });

    if (DEBUG_LOG) {
      console.log(`signTransaction result:`, signedTx);
    }

    const rpcTx = toSnakeCaseTx(signedTx);

    if (DEBUG_LOG) {
      console.log(`Converted RPC Transaction:`, rpcTx);
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
  } catch (error) {
    console.error('Transaction failed:', error);
    throw error;
  }
}

/**
 * Get transaction status from blockchain
 * @param {string} txHash - Transaction hash
 * @returns {Object} Transaction status
 */
async function getTransactionStatus(txHash) {
  try {
    const tx = await rpc.getTransaction(txHash);
    
    if (!tx) {
      return { status: 'not_found', txHash };
    }

    return {
      status: tx.txStatus?.status || 'pending',
      blockHash: tx.txStatus?.blockHash,
      txHash: txHash,
      transaction: tx
    };
  } catch (error) {
    console.error('Failed to get transaction status:', error);
    return { status: 'error', error: error.message, txHash };
  }
}

/**
 * Get block number
 * @returns {string} Current block number
 */
async function getBlockNumber() {
  try {
    const tipHeader = await rpc.getTipHeader();
    return tipHeader.number;
  } catch (error) {
    console.error('Failed to get block number:', error);
    throw error;
  }
}

/**
 * Get cells by lock script
 * @param {string} address - CKB address
 * @returns {Array} Cells
 */
async function getCellsByAddress(address) {
  try {
    const lock = helpers.parseAddress(address);
    const collector = indexer.collector({ lock });
    
    const cells = [];
    for await (const cell of collector.collect()) {
      cells.push(cell);
    }
    
    if (DEBUG_LOG) {
      console.log(`Found ${cells.length} cells for address ${address}`);
    }
    
    return cells;
  } catch (error) {
    console.error('Failed to get cells:', error);
    throw error;
  }
}

/**
 * Query EventFund cells for an event
 * @param {string} eventId - Event identifier
 * @returns {Array} EventFund cells
 */
async function queryEventFundCells(eventId) {
  try {
    const script = {
      codeHash: VOTESECURE_CONFIG.lockscript.codeHash,
      hashType: VOTESECURE_CONFIG.lockscript.hashType,
      args: '0x04' + eventId.padStart(62, '0')  // 0x04 = EventFund type
    };
    
    const collector = indexer.collector({ lock: script });
    const cells = [];
    
    for await (const cell of collector.collect()) {
      cells.push(cell);
    }
    
    if (DEBUG_LOG) {
      console.log(`Found ${cells.length} EventFund cells for event ${eventId}`);
    }
    
    return cells;
  } catch (error) {
    console.error('Failed to query EventFund cells:', error);
    throw error;
  }
}

/**
 * Query Metadata cells for an event
 * @param {string} eventId - Event identifier
 * @returns {Array} Metadata cells
 */
async function queryMetadataCells(eventId) {
  try {
    const script = {
      codeHash: VOTESECURE_CONFIG.lockscript.codeHash,
      hashType: VOTESECURE_CONFIG.lockscript.hashType,
      args: '0x01' + eventId.padStart(62, '0')  // 0x01 = Metadata type
    };
    
    const collector = indexer.collector({ type: script });
    const cells = [];
    
    for await (const cell of collector.collect()) {
      cells.push(cell);
    }
    
    if (DEBUG_LOG) {
      console.log(`Found ${cells.length} Metadata cells for event ${eventId}`);
    }
    
    return cells;
  } catch (error) {
    console.error('Failed to query Metadata cells:', error);
    throw error;
  }
}

/**
 * Query Voter cells for an event
 * @param {string} eventId - Event identifier
 * @returns {Array} Voter cells
 */
async function queryVoterCells(eventId) {
  try {
    const script = {
      codeHash: VOTESECURE_CONFIG.lockscript.codeHash,
      hashType: VOTESECURE_CONFIG.lockscript.hashType,
      args: '0x02' + eventId.padStart(62, '0')  // 0x02 = Voter type
    };
    
    const collector = indexer.collector({ type: script });
    const cells = [];
    
    for await (const cell of collector.collect()) {
      cells.push(cell);
    }
    
    if (DEBUG_LOG) {
      console.log(`Found ${cells.length} Voter cells for event ${eventId}`);
    }
    
    return cells;
  } catch (error) {
    console.error('Failed to query Voter cells:', error);
    throw error;
  }
}

/**
 * Query Result cells for an event
 * @param {string} eventId - Event identifier
 * @returns {Array} Result cells
 */
async function queryResultCells(eventId) {
  try {
    const script = {
      codeHash: VOTESECURE_CONFIG.lockscript.codeHash,
      hashType: VOTESECURE_CONFIG.lockscript.hashType,
      args: '0x03' + eventId.padStart(62, '0')  // 0x03 = Result type
    };
    
    const collector = indexer.collector({ type: script });
    const cells = [];
    
    for await (const cell of collector.collect()) {
      cells.push(cell);
    }
    
    if (DEBUG_LOG) {
      console.log(`Found ${cells.length} Result cells for event ${eventId}`);
    }
    
    return cells;
  } catch (error) {
    console.error('Failed to query Result cells:', error);
    throw error;
  }
}

/**
 * Wait for transaction confirmation
 * @param {string} txHash - Transaction hash
 * @param {number} maxAttempts - Maximum polling attempts
 * @param {number} interval - Polling interval in ms
 * @returns {Object} Transaction status
 */
async function waitForTransaction(txHash, maxAttempts = 60, interval = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getTransactionStatus(txHash);
    
    if (status.status === 'committed') {
      if (DEBUG_LOG) {
        console.log(`Transaction ${txHash} confirmed after ${i + 1} attempts`);
      }
      return status;
    }
    
    if (status.status === 'rejected') {
      throw new Error(`Transaction ${txHash} was rejected`);
    }
    
    if (DEBUG_LOG && i % 5 === 0) {
      console.log(`Waiting for transaction ${txHash}... attempt ${i + 1}/${maxAttempts}, status: ${status.status}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Transaction ${txHash} confirmation timeout after ${maxAttempts} attempts`);
}

// ============================================================================
// VOTESECURE-SPECIFIC OPERATIONS
// ============================================================================

/**
 * Create EventFund cell for event
 * @param {string} organizerAddress - Organizer's address
 * @param {string} eventId - Event identifier
 * @param {number} fundAmountCkb - Amount to fund in CKB
 * @returns {Object} EventFund cell creation result
 */
async function createEventFund(organizerAddress, eventId, fundAmountCkb) {
  try {
    if (DEBUG_LOG) {
      console.log(`Creating EventFund cell for event ${eventId} with ${fundAmountCkb} CKB`);
    }
    
    const fundAmount = BigInt(Math.floor(fundAmountCkb * 1e8));
    
    // Check balance
    const spendable = await getSpendableCapacityShannons(organizerAddress);
    if (BigInt(spendable) < fundAmount) {
      throw new Error(`Insufficient balance. Need ${fundAmountCkb} CKB`);
    }
    
    return {
      success: true,
      eventId,
      organizerAddress,
      fundAmount: fundAmountCkb,
      message: `EventFund cell ready for creation with ${fundAmountCkb} CKB`
    };
  } catch (error) {
    console.error('EventFund creation failed:', error);
    throw error;
  }
}

/**
 * Get lockscript configuration for use in blockchain.js
 * @returns {Object} Lockscript configuration
 */
function getLockscriptConfig() {
  return VOTESECURE_CONFIG.lockscript;
}

/**
 * Get all cell type IDs
 * @returns {Object} Cell type identifiers
 */
function getCellTypes() {
  return VOTESECURE_CELL_TYPES;
}

// ============================================================================
// EXPORT TO WINDOW
// ============================================================================
// Make functions available globally for blockchain.js and organizer.js
window.CKBService = {
  // Connection
  connectJoyID,
  
  // Transactions
  signAndSendTransaction,
  getTransactionStatus,
  waitForTransaction,
  
  // Balance & Cells
  getSpendableCapacityShannons,
  getCellsByAddress,
  
  // VoteSecure cell queries
  queryEventFundCells,
  queryMetadataCells,
  queryVoterCells,
  queryResultCells,
  
  // VoteSecure operations
  createEventFund,
  encodeEventFundData,
  encodeVoterData,
  encodeMetadataData,
  encodeResultData,
  
  // Blockchain Info
  getBlockNumber,
  
  // Configuration access
  getLockscriptConfig,
  getCellTypes,
  
  // Utilities
  shannons2CKB,
  padCkb,
  toSnakeCaseTx,
  
  // Constants
  config: {
    USE_MAINNET,
    USE_PRIVATE_NODE,
    RPC_URL,
    INDEXER_URL,
    JOYID_NET,
    DEBUG_LOG,
    VOTESECURE_CONFIG,
    VOTESECURE_CELL_TYPES,
    MIN_CELL_CAPACITY: MIN_CELL_CAPACITY.toString(),
    EVENTFUND_CELL_CAPACITY: EVENTFUND_CELL_CAPACITY.toString(),
    METADATA_CELL_CAPACITY: METADATA_CELL_CAPACITY.toString()
  },
  
  // Raw access to RPC and Indexer
  rpc,
  indexer,
  
  // Status indicator
  isReady: true
};

// Dispatch custom event to notify that service is ready
window.dispatchEvent(new CustomEvent('ckbServiceReady', {
  detail: {
    network: JOYID_NET,
    rpcUrl: RPC_URL,
    indexerUrl: INDEXER_URL,
    votesecureConfig: VOTESECURE_CONFIG
  }
}));

console.log('✓ CKB Service Bridge loaded successfully');
console.log(`  Network: ${JOYID_NET}`);
console.log(`  RPC: ${RPC_URL}`);
console.log(`  Indexer: ${INDEXER_URL}`);
console.log(`  VoteSecure Lockscript Code Hash: ${VOTESECURE_CONFIG.lockscript.codeHash}`);
console.log(`  VoteSecure Lockscript Deployed At: ${VOTESECURE_CONFIG.lockscript.deployedAt}`);
