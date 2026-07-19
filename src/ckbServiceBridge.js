/**
 * CKB Service Bridge for Browser using @ckb-ccc/connector-react
 * Exposes CKB connection functions to vanilla JavaScript
 * Integrated with VoteSecure Lockscript Configuration
 */

import { ccc } from "@ckb-ccc/connector-react";

// ============================================================================
// VOTESECURE LOCKSCRIPT CONFIGURATION
// ============================================================================
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
    rpcUrl: "https://testnet.ckb.dev/rpc",
    indexerUrl: "https://testnet.ckb.dev/indexer"	
  }
};

// ============================================================================
// VOTESECURE CELL TYPE IDENTIFIERS
// ============================================================================
const VOTESECURE_CELL_TYPES = {
  METADATA: 0x01,
  VOTER: 0x02,
  RESULT: 0x03,
  EVENTFUND: 0x04
};

// ============================================================================
// CONFIGURATION
// ============================================================================
const DEBUG_LOG = true;
const USE_MAINNET = false;

// Network configuration
const NETWORK = USE_MAINNET ? 'mainnet' : 'testnet';

// ============================================================================
// CONSTANTS
// ============================================================================
const CKB_DECIMAL = BigInt(10 ** 8);
const MIN_CELL_CAPACITY = BigInt(61) * BigInt(100000000);
const EVENTFUND_CELL_CAPACITY = BigInt(70) * BigInt(100000000);
const METADATA_CELL_CAPACITY = BigInt(150) * BigInt(100000000);

// ============================================================================
// GLOBAL CLIENT AND SIGNER
// ============================================================================
let globalClient = null;
let globalSigner = null;

/**
 * Initialize the CCC client
 */
function initializeClient() {
  if (!globalClient) {
    globalClient = USE_MAINNET 
      ? new ccc.ClientPublicMainnet()
      : new ccc.ClientPublicTestnet();
    
    if (DEBUG_LOG) {
      console.log(`CCC Client initialized for ${NETWORK}`);
    }
  }
  return globalClient;
}

/**
 * Set the signer from the React context
 * This should be called from the React component after connection
 */
function setSigner(signer) {
  globalSigner = signer;
  if (DEBUG_LOG && signer) {
    console.log('CCC Signer set successfully');
  }
}

/**
 * Get the current signer
 */
function getSigner() {
  return globalSigner;
}

/**
 * Get the current client
 */
function getClient() {
  return globalClient || initializeClient();
}

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
 */
function encodeEventFundData(data) {
  const jsonStr = JSON.stringify(data);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(jsonStr);
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Encode voter cell data
 */
function encodeVoterData(data) {
  const jsonStr = JSON.stringify(data);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(jsonStr);
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Encode metadata cell data
 */
function encodeMetadataData(data) {
  const jsonStr = JSON.stringify(data);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(jsonStr);
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Encode result cell data
 */
function encodeResultData(data) {
  const jsonStr = JSON.stringify(data);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(jsonStr);
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get spendable capacity for an address
 */
async function getSpendableCapacityShannons(address) {
  try {
    const client = getClient();
    const signer = getSigner();
    
    if (!signer) {
      throw new Error('No signer available. Please connect wallet first.');
    }

    // Parse the address to get the lock script
    const addressObj = await ccc.Address.fromString(address, client);
    
    // Collect cells with this lock script (empty type, empty data)
    let balance = ccc.Zero;
    
    // Use the client to find cells
    for await (const cell of client.findCellsByLock(addressObj.script, "0x", true)) {
      // Only count cells without type script (plain CKB)
      if (!cell.cellOutput.type) {
        balance = balance + cell.cellOutput.capacity;
      }
    }

    if (DEBUG_LOG) {
      console.log(`Spendable capacity for ${address}: ${balance.toString()} shannons`);
    }

    return balance;
  } catch (error) {
    console.error('Failed to get spendable capacity:', error);
    throw error;
  }
}

// ============================================================================
// CONNECTION FUNCTIONS
// ============================================================================

/**
 * Connect wallet using CCC
 * Note: Actual connection happens in React via ccc.Provider
 * This function just checks if connection exists
 */
async function connectWallet() {
  try {
    const signer = getSigner();
    
    if (!signer) {
      throw new Error('No signer available. Please use the Connect button in the UI.');
    }

    const addresses = await signer.getAddresses();
    const address = addresses[0] || '';
    
    const balance = await getSpendableCapacityShannons(address);
    const balanceCKB = shannons2CKB(balance);

    if (DEBUG_LOG) {
      console.log('Wallet connected:', {
        address,
        balance: balanceCKB,
        network: NETWORK
      });
    }

    return {
      address,
      balance: balanceCKB,
      network: NETWORK
    };
  } catch (error) {
    console.error('Wallet connection failed:', error);
    throw error;
  }
}

// ============================================================================
// TRANSACTION FUNCTIONS
// ============================================================================

/**
 * Sign and send transaction using CCC
 */
async function signAndSendTransaction(tx) {
  try {
    const signer = getSigner();
    
    if (!signer) {
      throw new Error('No signer available. Please connect wallet first.');
    }

    if (DEBUG_LOG) {
      console.log('Signing and sending transaction...');
    }

    // Convert transaction to CCC format if needed
    let cccTx = tx;
    if (!(tx instanceof ccc.Transaction)) {
      cccTx = ccc.Transaction.from(tx);
    }

    // Send the transaction
    const txHash = await signer.sendTransaction(cccTx);

    if (DEBUG_LOG) {
      console.log('Transaction sent:', txHash);
    }

    return txHash;
  } catch (error) {
    console.error('Transaction failed:', error);
    throw error;
  }
}

/**
 * Get transaction status
 */
async function getTransactionStatus(txHash) {
  try {
    const client = getClient();
    const tx = await client.getTransaction(txHash);

    if (!tx) {
      return { status: 'pending', txHash };
    }

    const status = tx.txStatus.status;
    
    return {
      status: status === 'committed' ? 'committed' : 
              status === 'rejected' ? 'rejected' : 'pending',
      txHash,
      blockHash: tx.txStatus.blockHash,
      blockNumber: tx.txStatus.blockNumber
    };
  } catch (error) {
    console.error('Failed to get transaction status:', error);
    return { status: 'unknown', txHash, error: error.message };
  }
}

/**
 * Wait for transaction confirmation
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
      console.log(`Waiting for transaction ${txHash}... attempt ${i + 1}/${maxAttempts}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Transaction ${txHash} confirmation timeout`);
}

// ============================================================================
// BLOCKCHAIN INFO FUNCTIONS
// ============================================================================

/**
 * Get current block number
 */
async function getBlockNumber() {
  try {
    const client = getClient();
    const tip = await client.getTip();
    return Number(tip);
  } catch (error) {
    console.error('Failed to get block number:', error);
    throw error;
  }
}

/**
 * Get cells by address
 */
async function getCellsByAddress(address) {
  try {
    const client = getClient();
    const addressObj = await ccc.Address.fromString(address, client);
    
    const cells = [];
    for await (const cell of client.findCellsByLock(addressObj.script)) {
      cells.push({
        outPoint: cell.outPoint,
        cellOutput: cell.cellOutput,
        data: cell.outputData
      });
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

// ============================================================================
// VOTESECURE-SPECIFIC OPERATIONS
// ============================================================================

/**
 * Query EventFund cells for an event
 */
async function queryEventFundCells(eventId) {
  try {
    const client = getClient();
    
    const script = ccc.Script.from({
      codeHash: VOTESECURE_CONFIG.lockscript.codeHash,
      hashType: VOTESECURE_CONFIG.lockscript.hashType,
      args: '0x04' + eventId.padStart(62, '0')
    });
    
    const cells = [];
    for await (const cell of client.findCellsByType(script)) {
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
 */
async function queryMetadataCells(eventId) {
  try {
    const client = getClient();
    
    const script = ccc.Script.from({
      codeHash: VOTESECURE_CONFIG.lockscript.codeHash,
      hashType: VOTESECURE_CONFIG.lockscript.hashType,
      args: '0x01' + eventId.padStart(62, '0')
    });
    
    const cells = [];
    for await (const cell of client.findCellsByType(script)) {
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
 */
async function queryVoterCells(eventId) {
  try {
    const client = getClient();
    
    const script = ccc.Script.from({
      codeHash: VOTESECURE_CONFIG.lockscript.codeHash,
      hashType: VOTESECURE_CONFIG.lockscript.hashType,
      args: '0x02' + eventId.padStart(62, '0')
    });
    
    const cells = [];
    for await (const cell of client.findCellsByType(script)) {
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
 */
async function queryResultCells(eventId) {
  try {
    const client = getClient();
    
    const script = ccc.Script.from({
      codeHash: VOTESECURE_CONFIG.lockscript.codeHash,
      hashType: VOTESECURE_CONFIG.lockscript.hashType,
      args: '0x03' + eventId.padStart(62, '0')
    });
    
    const cells = [];
    for await (const cell of client.findCellsByType(script)) {
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
 * Create EventFund cell for event
 */
async function createEventFund(organizerAddress, eventId, fundAmountCkb) {
  try {
    if (DEBUG_LOG) {
      console.log(`Creating EventFund cell for event ${eventId} with ${fundAmountCkb} CKB`);
    }
    
    const fundAmount = ccc.fixedPointFrom(fundAmountCkb);
    
    // Check balance
    const spendable = await getSpendableCapacityShannons(organizerAddress);
    if (spendable < fundAmount) {
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
 * Get lockscript configuration
 */
function getLockscriptConfig() {
  return VOTESECURE_CONFIG.lockscript;
}

/**
 * Get all cell type IDs
 */
function getCellTypes() {
  return VOTESECURE_CELL_TYPES;
}

// ============================================================================
// EXPORT TO WINDOW
// ============================================================================
window.CKBService = {
  // Initialization
  initializeClient,
  setSigner,
  getSigner,
  getClient,
  
  // Connection
  connectWallet,
  
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
  
  // Constants
  config: {
    USE_MAINNET,
    NETWORK,
    DEBUG_LOG,
    VOTESECURE_CONFIG,
    VOTESECURE_CELL_TYPES,
    MIN_CELL_CAPACITY: MIN_CELL_CAPACITY.toString(),
    EVENTFUND_CELL_CAPACITY: EVENTFUND_CELL_CAPACITY.toString(),
    METADATA_CELL_CAPACITY: METADATA_CELL_CAPACITY.toString()
  },
  
  // Status indicator
  isReady: true
};

// Initialize client on load
initializeClient();

// Dispatch custom event to notify that service is ready
window.dispatchEvent(new CustomEvent('ckbServiceReady', {
  detail: {
    network: NETWORK,
    votesecureConfig: VOTESECURE_CONFIG
  }
}));

console.log('✓ CKB Service Bridge (CCC) loaded successfully');
console.log(`  Network: ${NETWORK}`);
console.log(`  VoteSecure Lockscript Code Hash: ${VOTESECURE_CONFIG.lockscript.codeHash}`);
console.log(`  VoteSecure Lockscript Deployed At: ${VOTESECURE_CONFIG.lockscript.deployedAt}`);
