/**
 * CKB Service using CCC (CKB Common Connector)
 * Handles all blockchain interactions through CCC SDK with JoyID
 * Complete implementation with all VoteSecure functions
 */

import { ccc } from "@ckb-ccc/connector-react";

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEBUG_LOG = true;
const USE_MAINNET = false;
const USE_PRIVATE_NODE = false;

const RPC_URL = USE_PRIVATE_NODE
  ? (USE_MAINNET ? 'http://192.168.178.94:8114' : 'http://192.168.178.94:8112')
  : (USE_MAINNET ? 'https://mainnet.ckb.dev/rpc' : 'https://testnet.ckb.dev/rpc');

const INDEXER_URL = USE_PRIVATE_NODE
  ? (USE_MAINNET ? 'http://192.168.178.94:8114' : 'http://192.168.178.94:8112')
  : (USE_MAINNET ? 'https://mainnet.ckb.dev/indexer' : 'https://testnet.ckb.dev/indexer');

// VoteSecure LockScript Configuration (from votesecure_config.json)
const VOTESECURE_CONFIG = {
  lockscript: {
    codeHash: "0x3b3f2d37f03fac4145aeb092d1e925b5624c86b2d7c9717d526be708c9efb6e1",
    hashType: "data",
    outPoint: {
      txHash: "0x0ebf65d3adbabb40bae687283b0a51b3dd0fa619e78c890fe0ba516f4eae061f",
      index: "0x0"
    }
  }
};

if (DEBUG_LOG) {
  console.log('VoteSecure LockScript Config loaded:', VOTESECURE_CONFIG);
}

const VOTESECURE_CELL_TYPES = {
  METADATA: 0x01,
  VOTER: 0x02,
  RESULT: 0x03,
  EVENTFUND: 0x04
};

const CKB_DECIMAL = BigInt(10 ** 8);
const MIN_CELL_CAPACITY = BigInt(61) * BigInt(100000000);

// ============================================================================
// CCC CLIENT & SIGNER
// ============================================================================

let cccClient = null;
let cccSigner = null;

function initCCC() {
  if (!cccClient) {
    cccClient = USE_MAINNET
      ? new ccc.ClientPublicMainnet()
      : new ccc.ClientPublicTestnet();
    
    if (DEBUG_LOG) {
      console.log('CCC client initialized:', USE_MAINNET ? 'mainnet' : 'testnet');
    }
  }
  return cccClient;
}

function initJoyIDSigner() {
  if (!cccSigner) {
    const client = initCCC();
    const appName = 'VoteSecure';
    const iconUrl = typeof window !== 'undefined' 
      ? `${window.location.origin}/logo.png`
      : '';
    
    cccSigner = new ccc.JoyId.CkbSigner(client, appName, iconUrl);
    
    if (DEBUG_LOG) {
      console.log('JoyID signer initialized');
    }
  }
  return cccSigner;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function shannons2CKB(shannons) {
  const s = typeof shannons === "bigint" ? shannons : BigInt(shannons);
  const neg = s < 0n;
  const abs = neg ? -s : s;
  const integer = abs / CKB_DECIMAL;
  const fraction = abs % CKB_DECIMAL;
  const fracStr = fraction.toString().padStart(8, "0");
  return `${neg ? "-" : ""}${integer.toString()}.${fracStr}`;
}

function padCkb(s) {
  const [i, f = "0"] = s.split(".");
  return `${i}.${(f + "00000000").slice(0, 8)}`;
}

function encodeJsonData(data) {
  const jsonStr = JSON.stringify(data);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(jsonStr);
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

const encodeEventFundData = encodeJsonData;
const encodeVoterData = encodeJsonData;
const encodeMetadataData = encodeJsonData;
const encodeResultData = encodeJsonData;

function toSnakeCaseTx(tx) {
  // Convert camelCase transaction to snake_case for compatibility
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

  function convert(v) {
    if (Array.isArray(v)) return v.map(convert);
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        const mappedKey = keyMap[k] ?? k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
        out[mappedKey] = convert(val);
      }
      return out;
    }
    return v;
  }

  return convert(tx);
}

// ============================================================================
// WALLET CONNECTION
// ============================================================================

async function connectJoyID() {
  try {
    if (DEBUG_LOG) console.log('Connecting wallet via CCC JoyID...');

    const signer = initJoyIDSigner();
    
    // Always disconnect first to ensure fresh connection
    try {
      const wasConnected = await signer.isConnected();
      if (wasConnected) {
        if (DEBUG_LOG) console.log('Clearing previous session...');
        await signer.disconnect();
      }
    } catch (err) {
      if (DEBUG_LOG) console.log('No previous session to clear');
    }
    
    // Fresh connection - this WILL open the JoyID popup
    if (DEBUG_LOG) console.log('Opening JoyID popup for authentication...');
    await signer.connect();
    
    if (DEBUG_LOG) console.log('JoyID authentication successful, fetching wallet data...');
    
    // Get address
    const address = await signer.getRecommendedAddress();
    
    if (DEBUG_LOG) console.log('Address retrieved:', address.slice(0, 20) + '...');
    
    // Get balance
    const balanceBigInt = await signer.getBalance();
    const balanceCKB = shannons2CKB(balanceBigInt);
    
    if (DEBUG_LOG) console.log('Balance retrieved:', balanceCKB, 'CKB');
    
    const result = {
      address,
      balance: balanceCKB,
      network: USE_MAINNET ? 'mainnet' : 'testnet'
    };
    
    if (DEBUG_LOG) {
      console.log('✓ Wallet connected successfully:', {
        address: address.slice(0, 10) + '...',
        balance: balanceCKB,
        network: result.network
      });
    }
    
    return result;
  } catch (error) {
    console.error('Wallet connection failed:', error);
    
    if (error.message?.includes('User') || error.message?.includes('cancel')) {
      throw new Error('Connection cancelled by user');
    } else if (error.message?.includes('network')) {
      throw new Error('Network error. Please check your connection');
    }
    
    throw error;
  }
}

/**
 * Check if JoyID has an existing session (for auto-reconnect)
 * Returns wallet info if session exists, null otherwise
 */
async function checkJoyIDSession() {
  try {
    const signer = initJoyIDSigner();
    
    const isConnected = await signer.isConnected();
    
    if (isConnected) {
      if (DEBUG_LOG) console.log('Found existing JoyID session, restoring...');
      
      // Get address and balance from existing session
      const address = await signer.getRecommendedAddress();
      const balanceBigInt = await signer.getBalance();
      const balanceCKB = shannons2CKB(balanceBigInt);
      
      if (DEBUG_LOG) {
        console.log('✓ Session restored:', {
          address: address.slice(0, 10) + '...',
          balance: balanceCKB
        });
      }
      
      return {
        address,
        balance: balanceCKB,
        network: USE_MAINNET ? 'mainnet' : 'testnet'
      };
    }
    
    if (DEBUG_LOG) console.log('No existing JoyID session found');
    return null;
    
  } catch (error) {
    if (DEBUG_LOG) console.log('Session restore failed:', error.message);
    return null;
  }
}

async function disconnectJoyID() {
  try {
    if (!cccSigner) {
      if (DEBUG_LOG) console.log('No signer to disconnect');
      return;
    }
    
    await cccSigner.disconnect();
    
    if (DEBUG_LOG) console.log('✓ Wallet disconnected');
    
  } catch (error) {
    console.warn('Disconnect warning:', error);
  }
}

// ============================================================================
// BALANCE & CELLS
// ============================================================================

async function getSpendableCapacityShannons(address) {
  try {
    const client = initCCC();
    const script = await ccc.Address.fromString(address, client).getScript();
    
    let balance = BigInt(0);
    for await (const cell of client.findCellsByLock(script, "0x", true)) {
      if (!cell.cellOutput.type && (cell.outputData === "0x" || !cell.outputData)) {
        balance += BigInt(cell.cellOutput.capacity);
      }
    }
    
    if (DEBUG_LOG) {
      console.log(`Spendable capacity: ${shannons2CKB(balance)} CKB`);
    }
    
    return balance;
  } catch (error) {
    console.error('Failed to get balance:', error);
    return BigInt(0);
  }
}

async function getCellsByAddress(address) {
  try {
    const client = initCCC();
    const { script } = await ccc.Address.fromString(address, client);
    
    const cells = [];
    for await (const cell of client.findCellsByLock(script, "0x", true)) {
      cells.push({
        cellOutput: cell.cellOutput,
        output: cell.cellOutput,
        outPoint: cell.outPoint,
        out_point: cell.outPoint,
        data: cell.outputData || "0x",
        outputData: cell.outputData || "0x",
        blockHash: cell.blockHash,
        blockNumber: cell.blockNumber
      });
    }
    
    if (DEBUG_LOG) {
      console.log(`Found ${cells.length} cells for address`);
    }
    
    return cells;
  } catch (error) {
    console.error('Failed to get cells:', error);
    return [];
  }
}

// ============================================================================
// CELL CREATION WITH CCC
// ============================================================================

/**
 * Create cells on blockchain using CCC with proper JoyID signing
 * @param {string} fromAddress - Address sending the transaction
 * @param {Array} cellOutputs - Array of cell definitions to create
 * @returns {Promise<string>} Transaction hash
 */
async function createCellsWithSignRaw(fromAddress, cellOutputs) {
  try {
    if (DEBUG_LOG) console.log('=== Creating Cells with CCC ===');
    if (DEBUG_LOG) console.log('From:', fromAddress);
    if (DEBUG_LOG) console.log('Cells to create:', cellOutputs.length);
    
    const signer = initJoyIDSigner();
    const client = initCCC();
    
    // Calculate total capacity needed
    let totalNeeded = BigInt(0);
    for (const cellDef of cellOutputs) {
      const capacity = BigInt(cellDef.capacity);
      totalNeeded = totalNeeded + capacity;
    }
    
    if (DEBUG_LOG) console.log(`Total capacity needed: ${shannons2CKB(totalNeeded)} CKB`);
    
    // Build outputs array for transaction
    const outputs = cellOutputs.map((cellDef, index) => {
      if (DEBUG_LOG) {
        console.log(`\n=== BUILDING OUTPUT ${index} ===`);
        console.log('Cell definition:', {
          capacity: cellDef.capacity,
          lock: cellDef.cellOutput.lock,
          type: cellDef.cellOutput.type,
          encodedData: cellDef.encodedData
        });
        console.log('Lock script details:');
        console.log('  codeHash:', cellDef.cellOutput.lock.codeHash);
        console.log('  hashType:', cellDef.cellOutput.lock.hashType);
        console.log('  args:', cellDef.cellOutput.lock.args);
        console.log('  args type:', typeof cellDef.cellOutput.lock.args);
        console.log('  args length:', cellDef.cellOutput.lock.args?.length);
        console.log('  args valid hex?', /^0x[0-9a-f]+$/i.test(cellDef.cellOutput.lock.args || ''));
      }
      
      const output = {
        capacity: ccc.fixedPointFrom(shannons2CKB(BigInt(cellDef.capacity))),
        lock: ccc.Script.from(cellDef.cellOutput.lock)
      };
      
      // Add type script if present
      if (cellDef.cellOutput.type) {
        output.type = ccc.Script.from(cellDef.cellOutput.type);
      }
      
      if (DEBUG_LOG) {
        console.log('Output created successfully for index', index);
      }
      
      return output;
    });
    
    // Build outputs data array
    const outputsData = cellOutputs.map(cellDef => cellDef.encodedData || '0x');
    
    if (DEBUG_LOG) {
      console.log('=== TRANSACTION OUTPUTS ===');
      outputs.forEach((output, i) => {
        console.log(`Output ${i}:`, {
          capacity: output.capacity.toString(),
          lock: {
            codeHash: output.lock.codeHash,
            hashType: output.lock.hashType,
            args: output.lock.args
          },
          type: output.type ? {
            codeHash: output.type.codeHash,
            hashType: output.type.hashType,
            args: output.type.args
          } : null,
          data: outputsData[i]
        });
      });
    }
    
    // Create transaction using CCC pattern with cell dependencies included
    if (DEBUG_LOG) console.log('Building transaction with CCC...');
    
    const tx = ccc.Transaction.from({
      outputs,
      outputsData,
      cellDeps: [
        // VoteSecure lockscript dependency
        {
          outPoint: {
            txHash: VOTESECURE_CONFIG.lockscript.outPoint.txHash,
            index: VOTESECURE_CONFIG.lockscript.outPoint.index
          },
          depType: "code"
        },
        // SECP256K1/BLAKE160 dependency (for signing)
        {
          outPoint: {
            txHash: "0xf8de3bb47d055cdf460d93a2a6e1b05f7432f9777c8c474abf4eec1d4aee5d37",
            index: "0x0"
          },
          depType: "depGroup"
        }
      ]
    });
    
    if (DEBUG_LOG) console.log('Building transaction with CCC...');
    
    // Complete inputs by capacity - CCC will automatically find and add input cells
    if (DEBUG_LOG) console.log('Adding inputs to cover capacity...');
    await tx.completeInputsByCapacity(signer);
    
    // Complete fee - CCC will automatically calculate and add fee
    if (DEBUG_LOG) console.log('Calculating and adding transaction fee...');
    // TEMPORARY: Fee rate increased to 3000 to avoid rejection
    // WARNING: This makes VOTERS pay fees, which violates white paper!
    // Proper implementation: EventFund cell should pay all fees
    // See ARCHITECTURE_FEE_ISSUE.md for details
    await tx.completeFeeBy(signer, 3000);
    
    // Log complete transaction details
    if (DEBUG_LOG) {
      console.log('=== COMPLETE TRANSACTION DETAILS ===');
      console.log('Transaction object:', {
        version: tx.version,
        cellDeps: tx.cellDeps.map(dep => ({
          outPoint: {
            txHash: dep.outPoint.txHash,
            index: dep.outPoint.index
          },
          depType: dep.depType
        })),
        headerDeps: tx.headerDeps,
        inputs: tx.inputs.map(input => ({
          previousOutput: {
            txHash: input.previousOutput.txHash,
            index: input.previousOutput.index
          },
          since: input.since
        })),
        outputs: tx.outputs.map((output, i) => ({
          capacity: output.capacity.toString(),
          lock: {
            codeHash: output.lock.codeHash,
            hashType: output.lock.hashType,
            args: output.lock.args
          },
          type: output.type ? {
            codeHash: output.type.codeHash,
            hashType: output.type.hashType,
            args: output.type.args
          } : null,
          data: tx.outputsData[i]
        })),
        witnesses: tx.witnesses
      });
      
      // Calculate actual fee
      const inputCapacity = tx.inputs.reduce((sum, input, i) => {
        // Note: We can't easily get input capacities here without querying
        return sum;
      }, BigInt(0));
      
      const outputCapacity = tx.outputs.reduce((sum, output) => {
        return sum + output.capacity;
      }, BigInt(0));
      
      console.log('Output total capacity:', shannons2CKB(outputCapacity), 'CKB');
    }
    
    // Sign and send transaction using JoyID signer
    if (DEBUG_LOG) console.log('Signing and sending transaction with JoyID...');
    const txHash = await signer.sendTransaction(tx);
    
    if (DEBUG_LOG) {
      console.log('=== TRANSACTION SENT SUCCESSFULLY ===');
      console.log('TX Hash:', txHash);
      console.log('Explorer:', `https://pudge.explorer.nervos.org/transaction/${txHash}`);
    }
    
    return txHash;
    
  } catch (error) {
    console.error('=== CELL CREATION FAILED ===');
    console.error('Error:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    if (error.message?.includes('Insufficient')) {
      console.error('→ Not enough CKB balance');
    } else if (error.message?.includes('User') || error.message?.includes('cancel')) {
      console.error('→ Transaction cancelled by user');
    }
    
    throw error;
  }
}

// Alias for compatibility
const signAndSendCellCreation = createCellsWithSignRaw;

// ============================================================================
// TRANSACTION STATUS
// ============================================================================

async function getTransactionStatus(txHash) {
  try {
    const client = initCCC();
    const tx = await client.getTransaction(txHash);
    
    if (!tx) {
      return { status: 'pending', txHash };
    }
    
    return {
      status: tx.txStatus?.status === 'committed' ? 'committed' : 'pending',
      txHash,
      blockHash: tx.txStatus?.blockHash
    };
  } catch (error) {
    console.error('Failed to get transaction status:', error);
    return { status: 'unknown', txHash };
  }
}

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
// QUERY FUNCTIONS
// ============================================================================

async function queryEventFundCells(eventId) {
  try {
    const client = initCCC();
    const script = ccc.Script.from({
      codeHash: VOTESECURE_CONFIG.lockscript.codeHash,
      hashType: VOTESECURE_CONFIG.lockscript.hashType,
      args: '0x04' + eventId.padStart(64, '0')  // 33 bytes: type(1) + eventId(32)
    });
    
    const cells = [];
    for await (const cell of client.findCellsByLock(script, "0x", true)) {
      cells.push(cell);
    }
    
    if (DEBUG_LOG) {
      console.log(`Found ${cells.length} EventFund cells for event ${eventId}`);
    }
    
    return cells;
  } catch (error) {
    console.error('Failed to query EventFund cells:', error);
    return [];
  }
}

async function queryMetadataCells(eventId) {
  try {
    const client = initCCC();
    const script = ccc.Script.from({
      codeHash: VOTESECURE_CONFIG.lockscript.codeHash,
      hashType: VOTESECURE_CONFIG.lockscript.hashType,
      args: '0x01' + eventId.padStart(64, '0')  // 33 bytes: type(1) + eventId(32)
    });
    
    const cells = [];
    for await (const cell of client.findCellsByLock(script, "0x", true)) {
      cells.push(cell);
    }
    
    if (DEBUG_LOG) {
      console.log(`Found ${cells.length} Metadata cells for event ${eventId}`);
    }
    
    return cells;
  } catch (error) {
    console.error('Failed to query Metadata cells:', error);
    return [];
  }
}

async function queryVoterCells(eventId) {
  try {
    const client = initCCC();
    const script = ccc.Script.from({
      codeHash: VOTESECURE_CONFIG.lockscript.codeHash,
      hashType: VOTESECURE_CONFIG.lockscript.hashType,
      args: '0x02' + eventId.padStart(64, '0')  // 33 bytes: type(1) + eventId(32)
    });
    
    const cells = [];
    for await (const cell of client.findCellsByLock(script, "0x", true)) {
      cells.push(cell);
    }
    
    if (DEBUG_LOG) {
      console.log(`Found ${cells.length} Voter cells for event ${eventId}`);
    }
    
    return cells;
  } catch (error) {
    console.error('Failed to query Voter cells:', error);
    return [];
  }
}

async function queryResultCells(eventId) {
  try {
    const client = initCCC();
    const script = ccc.Script.from({
      codeHash: VOTESECURE_CONFIG.lockscript.codeHash,
      hashType: VOTESECURE_CONFIG.lockscript.hashType,
      args: '0x03' + eventId.padStart(64, '0')  // 33 bytes: type(1) + eventId(32)
    });
    
    const cells = [];
    for await (const cell of client.findCellsByLock(script, "0x", true)) {
      cells.push(cell);
    }
    
    if (DEBUG_LOG) {
      console.log(`Found ${cells.length} Result cells for event ${eventId}`);
    }
    
    return cells;
  } catch (error) {
    console.error('Failed to query Result cells:', error);
    return [];
  }
}

// ============================================================================
// ADDITIONS to enable querying all metadata cells and events by organizer
// ============================================================================

/**
 * Convert hex string to regular string
 */
function hexToString(hex) {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  
  // Remove padding zeros
  let str = '';
  for (let i = 0; i < cleanHex.length; i += 2) {
    const byte = parseInt(cleanHex.substr(i, 2), 16);
    if (byte !== 0) { // Skip null bytes
      str += String.fromCharCode(byte);
    }
  }
  return str;
}

/**
 * Query all VoteSecure metadata cells from the blockchain
 * Returns cells with lockscript args starting with 0x01 (metadata type)
 
async function queryAllMetadataCells() {
  try {
    const client = initCCC();
    
    // Create base script matching only the type byte
    const baseScript = ccc.Script.from({
      codeHash: VOTESECURE_CONFIG.lockscript.codeHash,
      hashType: VOTESECURE_CONFIG.lockscript.hashType,
      args: "0x01" // This will match cells starting with 0x01
    });
    
    const cells = [];
    
    try {
      for await (const cell of client.findCellsByLock(baseScript, "0x", true)) {
        // Additional filter: ensure args are exactly 33 bytes (66 hex chars with 0x prefix)
        const args = cell.cellOutput.lock.args;
        if (args.startsWith('0x01') && args.length === 66) {
          cells.push(cell);
        }
      }
    } catch (iterError) {
      // If the partial match doesn't work, we need to scan differently
      console.warn('Partial args matching not supported, trying alternative method');
      
      // Alternative: Get all cells with VoteSecure lockscript and filter
      const votesecureScript = ccc.Script.from({
        codeHash: VOTESECURE_CONFIG.lockscript.codeHash,
        hashType: VOTESECURE_CONFIG.lockscript.hashType,
        args: "0x" // Match all
      });
      
      for await (const cell of client.findCellsByLock(votesecureScript, "0x", true)) {
        const args = cell.cellOutput.lock.args;
        // Filter for metadata cells (type 0x01) with correct length
        if (args.startsWith('0x01') && args.length === 66) {
          cells.push(cell);
        }
      }
    }
    
    if (DEBUG_LOG) {
      console.log(`Found ${cells.length} total metadata cells on blockchain`);
    }
    
    return cells;
  } catch (error) {
    console.error('Failed to query all metadata cells:', error);
    return [];
  }
}
*/

/**
 * Extract eventId from metadata cell's lock args
 * @param {string} args - Lock script args (0x01 + 64 hex chars)
 * @returns {string|null} - Decoded eventId or null
 */
function extractEventIdFromArgs(args) {
  // Args format: 0x01 + 64 hex chars (32 bytes eventId)
  if (!args || args.length !== 66 || !args.startsWith('0x01')) {
    return null;
  }
  
  const eventIdHex = args.slice(4); // Remove '0x01'
  return hexToString(eventIdHex);
}

/**
 * Determine event status based on schedule
 */
function determineEventStatus(metadata) {
  if (!metadata?.schedule) return 'active';
  
  const now = Math.floor(Date.now() / 1000);
  const { startTime, endTime } = metadata.schedule;
  
  if (now < startTime) return 'pending';
  if (now > endTime) return 'ended';
  return 'active';
}

/**
 * Get the address that created a transaction (from first input)
 */
async function getAddressFromInput(input) {
  try {
    const client = initCCC();
    
    // Get the cell that was used as input
    const previousOutput = await client.getCellLive(input.previousOutput, true);
    if (!previousOutput) return null;
    
    // Convert lock script to address
    const lock = previousOutput.cellOutput.lock;
    const address = await ccc.Address.fromScript(ccc.Script.from(lock), client);
    
    return address.toString();
  } catch (error) {
    console.error('Failed to get address from input:', error);
    return null;
  }
}

/**
 * Get all events created by a specific organizer address
 * IMPORTANT: This is resource-intensive as it queries all metadata cells
 * Consider caching results or using localStorage

async function getEventsByOrganizer(organizerAddress) {
  try {
    if (DEBUG_LOG) console.log('Querying events for organizer:', organizerAddress);
    
    const client = initCCC();
    
    // Get all metadata cells
    const metadataCells = await queryAllMetadataCells();
    
    if (DEBUG_LOG) {
      console.log(`Checking ${metadataCells.length} metadata cells...`);
    }
    
    const events = [];
    
    for (const cell of metadataCells) {
      try {
        // Extract eventId from lock args
        const eventId = extractEventIdFromArgs(cell.cellOutput.lock.args);
        if (!eventId) {
          if (DEBUG_LOG) console.log('Invalid eventId in cell args');
          continue;
        }
        
        // Parse metadata
        const metadata = parseJsonData(cell.outputData);
        
        // Get transaction to find creator
        const txHash = cell.outPoint.txHash;
        const tx = await client.getTransaction(txHash);
        
        if (!tx) {
          console.warn('Transaction not found:', txHash);
          continue;
        }
        
        // Get address from first input
        const creatorAddress = await getAddressFromInput(tx.transaction.inputs[0]);
        
        if (DEBUG_LOG) {
          console.log(`Event ${eventId}: created by ${creatorAddress}`);
        }
        
        // Check if this organizer created this event
        if (creatorAddress === organizerAddress) {
          events.push({
            eventId: eventId,
            title: metadata?.title || 'Untitled Event',
            description: metadata?.description || '',
            schedule: metadata?.schedule || {},
            eligibility: metadata?.eligibility || {},
            anonymityLevel: metadata?.anonymityLevel || 'full',
            reportingGranularity: metadata?.reportingGranularity || 'totals_only',
            createdAt: metadata?.createdAt || 0,
            status: determineEventStatus(metadata),
            txHash: txHash,
            blockNumber: cell.blockNumber
          });
        }
      } catch (cellError) {
        console.error('Error processing cell:', cellError);
        continue;
      }
    }
    
    if (DEBUG_LOG) {
      console.log(`✓ Found ${events.length} events for organizer`);
    }
    
    return events;
  } catch (error) {
    console.error('Failed to get events by organizer:', error);
    return [];
  }
}

 */

// ============================================================================
// UPDATE EXPORTS
// ============================================================================

// Add these to the window.CKBService object (around line 1016):
// queryAllMetadataCells,
// extractEventIdFromArgs,
// getEventsByOrganizer,
// hexToString,

// Add these to the export statement at the bottom:
// export {
//   ...existing exports,
//   queryAllMetadataCells,
//   extractEventIdFromArgs,  
//   getEventsByOrganizer,
//   hexToString
// };

// ============================================================================
// OTHER FUNCTIONS
// ============================================================================

async function createEventFund(organizerAddress, eventId, fundAmountCkb) {
  try {
    if (DEBUG_LOG) {
      console.log(`Creating EventFund cell for event ${eventId} with ${fundAmountCkb} CKB`);
    }
    
    const fundAmount = BigInt(Math.floor(fundAmountCkb * 1e8));
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

function getLockscriptConfig() {
  return VOTESECURE_CONFIG.lockscript;
}

function getCellTypes() {
  return VOTESECURE_CELL_TYPES;
}

async function getBlockNumber() {
  try {
    const client = initCCC();
    const tip = await client.getTip();
    return tip ? Number(tip.blockNumber) : 0;
  } catch (error) {
    console.error('Failed to get block number:', error);
    return 0;
  }
}

async function signAndSendTransaction(tx, address) {
  // Legacy function for compatibility
  console.warn('signAndSendTransaction is deprecated, use createCellsWithSignRaw instead');
  throw new Error('Use createCellsWithSignRaw for cell creation');
}

/**
 * Convert string to hex
 */
function stringToHex(str) {
  let hex = '';
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    hex += charCode.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Parse JSON data from cell output
 */
function parseJsonData(data) {
  if (!data) return null;
  try {
    // Remove 0x prefix if present
    const hexData = data.startsWith('0x') ? data.slice(2) : data;
    // Convert hex to string
    const jsonString = hexData.match(/.{2}/g).map(byte => 
      String.fromCharCode(parseInt(byte, 16))
    ).join('');
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Failed to parse JSON data:', error);
    return null;
  }
}

/**
 * Search for cells by lock script args
 */
async function searchCellsByLockArgs(args) {
  try {
    // Ensure CCC client is initialized
    const client = initCCC();
    
    const lockscriptConfig = getLockscriptConfig();
    
    const lockScript = {
      codeHash: lockscriptConfig.codeHash,
      hashType: lockscriptConfig.hashType,
      args: args
    };
    
    if (DEBUG_LOG) {
      console.log('Searching cells with lock args:', args);
    }
    
    const cells = [];
    const collector = client.findCellsByLock(ccc.Script.from(lockScript), null, true);
    
    for await (const cell of collector) {
      cells.push(cell);
    }
    
    if (DEBUG_LOG) {
      console.log(`Found ${cells.length} cells`);
    }
    
    return cells;
    
  } catch (error) {
    console.error('Failed to search cells:', error);
    return [];
  }
}

/**
 * Get event/election data by eventId
 * Searches for metadata, result, and eventfund cells on blockchain
 */
async function getEvent(eventId) {
  try {
    if (DEBUG_LOG) console.log('Getting event:', eventId);
    
    // Convert eventId to hex for lock script args (32 bytes = 64 hex chars)
    const eventIdHex = stringToHex(eventId).padStart(64, '0');
    
    // Search for the three main cells for this event
    const lockscriptConfig = getLockscriptConfig();
    
    // Metadata cell (args: 0x01 + eventIdHex = 33 bytes total)
    const metadataArgs = '0x01' + eventIdHex;
    const metadataCells = await searchCellsByLockArgs(metadataArgs);
    
    // Result cell (args: 0x03 + eventIdHex = 33 bytes total)
    const resultArgs = '0x03' + eventIdHex;
    const resultCells = await searchCellsByLockArgs(resultArgs);
    
    // EventFund cell (args: 0x04 + eventIdHex)
    const eventFundArgs = '0x04' + eventIdHex;
    const eventFundCells = await searchCellsByLockArgs(eventFundArgs);
    
    if (metadataCells.length === 0) {
      console.warn('Event not found:', eventId);
      return null;
    }
    
    // Parse cell data
    const metadataCell = metadataCells[0];
    const resultCell = resultCells[0];
    const eventFundCell = eventFundCells[0];
    
    const metadata = metadataCell ? parseJsonData(metadataCell.outputData) : null;
    const result = resultCell ? parseJsonData(resultCell.outputData) : null;
    const eventFund = eventFundCell ? parseJsonData(eventFundCell.outputData) : null;
    
    // Determine event status
    let status = 'active';
    if (metadata?.schedule) {
      const now = Math.floor(Date.now() / 1000);
      if (now < metadata.schedule.startTime) {
        status = 'pending';
      } else if (now > metadata.schedule.endTime) {
        status = 'concluded';
      }
    }
    
    const event = {
      eventId: eventId,
      title: metadata?.title || 'Untitled Event',
      description: metadata?.description || '',
      questions: metadata?.questions || [],
      schedule: metadata?.schedule || {},
      eligibility: metadata?.eligibility || {},
      anonymityLevel: metadata?.anonymityLevel || 'full',
      reportingGranularity: metadata?.reportingGranularity || 'aggregate',
      groupingFields: metadata?.groupingFields || [],
      status: status,
      result: result,
      eventFund: eventFund,
      metadata: metadata,
      cells: {
        metadata: metadataCell,
        result: resultCell,
        eventFund: eventFundCell
      }
    };
    
    if (DEBUG_LOG) console.log('✓ Event loaded:', event);
    return event;
    
  } catch (error) {
    console.error('Failed to get event:', error);
    throw error;
  }
}

/**
 * Submit a ballot to the blockchain
 */
async function submitBallot(ballot, voterAddress) {
  try {
    // Initialize signer if not already done
    const signer = initJoyIDSigner();
    
    // Check if wallet is actually connected
    const isConnected = await signer.isConnected();
    if (!isConnected) {
      throw new Error('Wallet not connected. Please connect your wallet first.');
    }
    
    if (DEBUG_LOG) console.log('Submitting ballot for event:', ballot.eventId);
    
    // Per white paper: Voter Cells contain encrypted ballot payload, voter public key/commitment, and sequence
    // "Ballot confidentiality: Client-side encryption with the event public key"
    // TODO: Implement proper encryption with event public key from metadata
    const ballotData = {
      eventId: ballot.eventId,
      voterPublicKey: voterAddress, // Voter public key (currently using address as identifier)
      encryptedPayload: JSON.stringify(ballot.answers), // TODO: Encrypt with event public key
      groupingData: ballot.groupingData || {},
      timestamp: ballot.timestamp || Math.floor(Date.now() / 1000),
      sequence: 1 // TODO: Check for existing voter cells and increment sequence
    };
    
    // Generate commitment hash for receipt
    const commitment = JSON.stringify({
      eventId: ballot.eventId,
      answers: ballot.answers,
      timestamp: ballotData.timestamp
    });
    const commitmentHash = '0x' + Math.abs(Array.from(commitment)
      .reduce((hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0))
      .toString(16).padStart(16, '0');
    
    const lockscriptConfig = getLockscriptConfig();
    // Lockscript expects: 1 byte cell type + 32 bytes event ID = 33 bytes total
    const eventIdHex = stringToHex(ballot.eventId).padStart(64, '0');  // 32 bytes = 64 hex chars
    
    // Voter cell args: 0x02 + eventIdHex (voter cells use prefix 02)
    const voterArgs = '0x02' + eventIdHex;  // Total: 33 bytes = 66 hex chars
    
    // Encode ballot data
    const encodedData = encodeVoterData(ballotData);
    
    // Create voter cell
    const cellOutput = {
      capacity: 70 * 100000000, // 70 CKB for voter cell
      cellOutput: {
        lock: {
          codeHash: lockscriptConfig.codeHash,
          hashType: lockscriptConfig.hashType,
          args: voterArgs
        }
      },
      encodedData: encodedData
    };
    
    if (DEBUG_LOG) {
      console.log('=== CREATING VOTER CELL ===');
      console.warn('⚠️ WARNING: Voter is paying transaction fees!');
      console.warn('⚠️ This violates white paper - organizer should pay via EventFund');
      console.warn('⚠️ See ARCHITECTURE_FEE_ISSUE.md for proper implementation');
      console.log('Voter cell lock args:', voterArgs);
      console.log('Voter cell capacity:', 70, 'CKB');
      console.log('Ballot data:');
      console.log('  - Event ID:', ballotData.eventId);
      console.log('  - Voter Public Key:', ballotData.voterPublicKey);
      console.log('  - Timestamp:', ballotData.timestamp);
      console.log('  - Sequence:', ballotData.sequence);
      console.log('  - Payload size:', encodedData.length, 'bytes');
      console.log('Cell output structure:', {
        capacity: cellOutput.capacity,
        lockScript: cellOutput.cellOutput.lock,
        dataSize: encodedData.length
      });
    }
    
    // Submit transaction (pass address as first param)
    if (DEBUG_LOG) console.log('Signing and submitting transaction with JoyID...');
    const result = await createCellsWithSignRaw(voterAddress, [cellOutput]);
    
    if (!result.success) {
      throw new Error(result.message || 'Failed to submit ballot');
    }
    
    const receipt = {
      success: true,
      commitmentHash: commitmentHash,
      txHash: result.txHash,
      timestamp: ballotData.timestamp,
      sequence: ballotData.sequence,
      message: 'Ballot submitted successfully'
    };
    
    if (DEBUG_LOG) console.log('✓ Ballot submitted:', receipt);
    return receipt;
    
  } catch (error) {
    console.error('Failed to submit ballot:', error);
    return {
      success: false,
      message: error.message || 'Failed to submit ballot'
    };
  }
}

// ============================================================================
// EXPORT TO WINDOW
// ============================================================================

window.CKBService = {
  // Connection
  connectJoyID,
  disconnectJoyID,
  checkJoyIDSession,
  
  // Transactions
  signAndSendTransaction,
  createCellsWithSignRaw,
  signAndSendCellCreation,
  getTransactionStatus,
  waitForTransaction,
  
  // Balance & Cells
  getSpendableCapacityShannons,
  getCellsByAddress,
  
  // Election cell queries
  //queryAllMetadataCells,
  extractEventIdFromArgs,
  //getEventsByOrganizer,
  hexToString,
  
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
  getEvent,
  submitBallot,
  searchCellsByLockArgs,
  
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
    DEBUG_LOG,
    VOTESECURE_CONFIG,
    VOTESECURE_CELL_TYPES,
    MIN_CELL_CAPACITY: MIN_CELL_CAPACITY.toString()
  },
  
  // CCC access
  client: () => cccClient,
  signer: () => cccSigner,
  
  // Status indicator
  isReady: true
};

// Dispatch event
window.dispatchEvent(new CustomEvent('ckbServiceReady', {
  detail: {
    network: USE_MAINNET ? 'mainnet' : 'testnet',
    rpcUrl: RPC_URL,
    indexerUrl: INDEXER_URL,
    votesecureConfig: VOTESECURE_CONFIG
  }
}));

console.log('✓ CKB Service (CCC with JoyID) loaded successfully');
console.log(`  Network: ${USE_MAINNET ? 'mainnet' : 'testnet'}`);
console.log(`  RPC: ${RPC_URL}`);
console.log('  Ready to connect JoyID wallet');

export {
  connectJoyID,
  disconnectJoyID,
  checkJoyIDSession,
  createCellsWithSignRaw,
  signAndSendCellCreation,
  getSpendableCapacityShannons,
  getCellsByAddress,
  queryEventFundCells,
  queryMetadataCells,
  queryVoterCells,
  queryResultCells,
  getLockscriptConfig,
  getCellTypes,
  getEvent,
  submitBallot,
  searchCellsByLockArgs,
  // ADD THESE NEW EXPORTS:
  //queryAllMetadataCells,
  extractEventIdFromArgs,
  //getEventsByOrganizer,
  hexToString
};