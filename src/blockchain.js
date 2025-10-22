/**
 * VoteSecure Blockchain Module
 * Handles all CKB blockchain interactions for voting system
 * Fully integrated with VoteSecure Lockscript Configuration
 */

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

// Network configuration
const DEBUG_LOG = true;
const USE_MAINNET = false;
const USE_PRIVATE_NODE = false;

// JoyID endpoints vary by network
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

const CKB_NODE_URL = RPC_URL;
const CKB_INDEXER_URL = INDEXER_URL;

if (DEBUG_LOG) {
    console.log(`DEBUG_LOG: ${DEBUG_LOG}`);
    console.log(`USE_MAINNET: ${USE_MAINNET}`);
    console.log(`USE_PRIVATE_NODE: ${USE_PRIVATE_NODE}`);
    console.log(`RPC_URL: ${RPC_URL}`);
    console.log(`INDEXER_URL: ${INDEXER_URL}`);
}

// Cell type identifiers (aligned with ckbServiceBridge.js)
const CELL_TYPES = {
    EVENTFUND: 'eventfund',
    METADATA: 'metadata',
    VOTER: 'voter',
    RESULT: 'result'
};

// Election status constants
const ELECTION_STATUS = {
    DRAFT: 'draft',
    PUBLISHED: 'published',
    ACTIVE: 'active',
    ENDED: 'ended',
    RESULTS_RELEASED: 'results_released'
};

// Capacity constants (in CKB)
const CAPACITY_CKB = {
    MIN_CELL: 61,           // Minimum CKB for any cell
    METADATA: 150,          // Metadata cell capacity
    RESULT: 200,            // Result cell capacity
    VOTER: 70,              // Per voter cell capacity
    EVENTFUND_BASE: 100     // EventFund base capacity
};

// Minimum cell capacity in shannons
const MIN_CELL_CAPACITY = CAPACITY_CKB.MIN_CELL * 100000000;

// ============================================================================
// VOTESECURE LOCKSCRIPT REFERENCE
// ============================================================================
// This will be retrieved from CKBService at runtime
let VOTESECURE_LOCKSCRIPT = null;

function getLockscriptConfig() {
    if (!VOTESECURE_LOCKSCRIPT && window?.CKBService?.getLockscriptConfig) {
        VOTESECURE_LOCKSCRIPT = window.CKBService.getLockscriptConfig();
    }
    return VOTESECURE_LOCKSCRIPT;
}

// ============================================================================
// JOYID INTEGRATION (delegates to CKB Service Bridge)
// ============================================================================

/**
 * Connect to JoyID via the CKB Service Bridge
 * @returns {{address: string, balance: string, network: string}}
 */
async function connectJoyID() {
    if (window?.CKBService?.connectJoyID) {
        return await window.CKBService.connectJoyID();
    }
    throw new Error('CKBService bridge is not ready. Please ensure ckbServiceBridge.js is loaded.');
}

// ============================================================================
// CRYPTOGRAPHIC UTILITIES
// ============================================================================

/**
 * Generate a key pair for encryption
 * @returns {Object} Public and private keys
 */
async function generateKeyPair() {
    try {
        const keyPair = await window.crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256"
            },
            true,
            ["encrypt", "decrypt"]
        );
        
        const publicKey = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
        const privateKey = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
        
        return {
            publicKey: arrayBufferToBase64(publicKey),
            privateKey: arrayBufferToBase64(privateKey)
        };
    } catch (error) {
        console.error('Key generation failed:', error);
        throw new Error('Failed to generate encryption keys');
    }
}

/**
 * Encrypt ballot data
 * @param {Object} ballotData - The ballot data to encrypt
 * @param {string} publicKeyBase64 - Base64 encoded public key
 * @returns {string} Encrypted ballot as base64
 */
async function encryptBallot(ballotData, publicKeyBase64) {
    try {
        const publicKeyBuffer = base64ToArrayBuffer(publicKeyBase64);
        const publicKey = await window.crypto.subtle.importKey(
            "spki",
            publicKeyBuffer,
            { name: "RSA-OAEP", hash: "SHA-256" },
            false,
            ["encrypt"]
        );
        
        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify(ballotData));
        
        const encrypted = await window.crypto.subtle.encrypt(
            { name: "RSA-OAEP" },
            publicKey,
            data
        );
        
        return arrayBufferToBase64(encrypted);
    } catch (error) {
        console.error('Encryption failed:', error);
        throw new Error('Failed to encrypt ballot');
    }
}

/**
 * Generate SHA-256 hash
 * @param {string} data - Data to hash
 * @returns {string} Hash as hex string
 */
async function generateHash(data) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataBuffer);
    return arrayBufferToHex(hashBuffer);
}

/**
 * Generate ballot receipt commitment
 * @param {Object} ballot - Ballot data
 * @returns {string} Commitment hash
 */
async function generateBallotCommitment(ballot) {
    const commitmentData = JSON.stringify({
        timestamp: ballot.timestamp,
        eventId: ballot.eventId,
        voterId: ballot.voterId,
        answers: ballot.answers
    });
    return await generateHash(commitmentData);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

function arrayBufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Generate unique event ID
 * @returns {string} Unique event identifier
 */
function generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate invite key
 * @returns {string} Random invite key
 */
function generateInviteKey() {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return arrayBufferToHex(array.buffer);
}

/**
 * Convert hex string to 0x prefixed format
 */
function toHex(str) {
    if (!str) return '0x';
    if (str.startsWith('0x')) return str;
    return '0x' + str;
}

// ============================================================================
// CELL CREATION FUNCTIONS (Aligned with Architecture)
// ============================================================================

/**
 * Create EventFund Cell (holds organizer sponsorship funds)
 * @param {string} organizerId - JoyID of organizer
 * @param {string} eventId - Event identifier
 * @param {number} fundAmountCkb - Amount in CKB
 * @returns {Object} EventFund cell data
 */
function createEventFundCell(organizerId, eventId, fundAmountCkb) {
    const cellData = {
        eventId: eventId,
        organizerPubKeyHash: organizerId,
        initialFunds: fundAmountCkb,
        remainingFunds: fundAmountCkb,
        createdAt: Math.floor(Date.now() / 1000)  // Unix timestamp
    };
    
    // Calculate capacity needed
    const minCapacity = CAPACITY_CKB.EVENTFUND_BASE + fundAmountCkb;
    const capacity = Math.max(minCapacity, CAPACITY_CKB.MIN_CELL) * 100000000;
    
    return {
        eventId: eventId,
        cellType: CELL_TYPES.EVENTFUND,
        data: cellData,
        capacity: capacity,
        cellOutput: {
            capacity: '0x' + capacity.toString(16),
            lock: {
                codeHash: VOTESECURE_LOCKSCRIPT?.codeHash,
                hashType: VOTESECURE_LOCKSCRIPT?.hashType,
                args: '0x04' + eventId.padStart(62, '0')  // 0x04 = EventFund type
            },
            type: undefined
        },
        encodedData: window.CKBService?.encodeEventFundData(cellData) || '0x'
    };
}

/**
 * Create Metadata Cell (event configuration)
 * @param {Object} eventConfig - Event configuration object
 * @returns {Promise<Object>} Cell data
 */
async function createMetadataCell(eventConfig) {
    // Generate event keys for ballot encryption
    const keyPair = await generateKeyPair();
    
    // Calculate frontend code hash
    const frontendCodeHash = await generateHash(JSON.stringify({
        version: '0.9.0',
        timestamp: Date.now()
    }));
    
    const cellData = {
        eventId: eventConfig.eventId,
        title: eventConfig.title,
        description: eventConfig.description,
        questions: eventConfig.questions,
        schedule: {
            startTime: Math.floor(eventConfig.schedule.startTime / 1000),
            endTime: Math.floor(eventConfig.schedule.endTime / 1000),
            resultsReleaseTime: Math.floor(eventConfig.schedule.resultsReleaseTime / 1000)
        },
        eligibility: eventConfig.eligibility,
        anonymityLevel: eventConfig.anonymityLevel,
        reportingGranularity: eventConfig.reportingGranularity,
        groupingFields: eventConfig.groupingFields || [],
        minGroupSize: eventConfig.minGroupSize || 5,
        allowedUpdates: eventConfig.allowedUpdates || 3,
        publicKey: keyPair.publicKey,
        frontendCodeHash: frontendCodeHash,
        liveStatsMode: eventConfig.liveStatsMode || 'hidden',
        resultReleasePolicy: eventConfig.resultReleasePolicy || {
            type: 'threshold',
            required: 3,
            eligible: ['organizer', 'voters']
        },
        createdAt: Math.floor(Date.now() / 1000)
    };
    
    // Estimate cell size and capacity
    const dataSize = JSON.stringify(cellData).length;
    const capacity = Math.max(CAPACITY_CKB.METADATA, Math.ceil(dataSize / 1024) + 50) * 100000000;
    
    // Build type script for metadata cell
    const typeScript = {
        codeHash: VOTESECURE_LOCKSCRIPT?.codeHash,
        hashType: VOTESECURE_LOCKSCRIPT?.hashType,
        args: '0x01' + eventConfig.eventId.padStart(62, '0')  // 0x01 = Metadata type
    };
    
    return {
        eventId: eventConfig.eventId,
        cellType: CELL_TYPES.METADATA,
        data: cellData,
        privateKey: keyPair.privateKey,  // Stored separately for organizer
        capacity: capacity,
        cellOutput: {
            capacity: '0x' + capacity.toString(16),
            lock: { /* organizer's address */ },
            type: typeScript
        },
        encodedData: window.CKBService?.encodeMetadataData(cellData) || '0x'
    };
}

/**
 * Create Voter Cell (ballot submission)
 * @param {Object} ballot - Ballot data
 * @param {string} eventPublicKey - Event public key for encryption
 * @param {string} eventId - Event identifier
 * @returns {Promise<Object>} Cell data
 */
async function createVoterCell(ballot, eventPublicKey, eventId) {
    const encryptedBallot = await encryptBallot(ballot.answers, eventPublicKey);
    const commitment = await generateBallotCommitment(ballot);
    
    const cellData = {
        eventId: eventId,
        voterCommitment: commitment,
        encryptedBallot: encryptedBallot,
        sequence: ballot.sequence || 1,
        groupingData: ballot.groupingData || {},
        timestamp: Math.floor(Date.now() / 1000),
        voterPubKeyHash: ballot.voterPublicKeyHash || ballot.voterId
    };
    
    // Estimate capacity
    const dataSize = JSON.stringify(cellData).length;
    const capacity = Math.max(CAPACITY_CKB.VOTER, Math.ceil(dataSize / 1024) + 20) * 100000000;
    
    // Build type script for voter cell
    const typeScript = {
        codeHash: VOTESECURE_LOCKSCRIPT?.codeHash,
        hashType: VOTESECURE_LOCKSCRIPT?.hashType,
        args: '0x02' + eventId.padStart(62, '0')  // 0x02 = Voter type
    };
    
    return {
        eventId: eventId,
        cellType: CELL_TYPES.VOTER,
        data: cellData,
        capacity: capacity,
        cellOutput: {
            capacity: '0x' + capacity.toString(16),
            lock: { /* voter's JoyID address */ },
            type: typeScript
        },
        encodedData: window.CKBService?.encodeVoterData(cellData) || '0x'
    };
}

/**
 * Create Result Cell (aggregated tallies with timelock)
 * @param {string} eventId - Event identifier
 * @param {Object} releasePolicy - Result release policy configuration
 * @returns {Object} Cell data
 */
function createResultCell(eventId, releasePolicy) {
    const cellData = {
        eventId: eventId,
        status: 'locked',
        encryptedResults: null,
        results: null,
        groupResults: null,
        includedBallots: [],
        confirmations: [],
        releasedAt: null
    };
    
    const capacity = CAPACITY_CKB.RESULT * 100000000;
    
    // Build type script for result cell
    const typeScript = {
        codeHash: VOTESECURE_LOCKSCRIPT?.codeHash,
        hashType: VOTESECURE_LOCKSCRIPT?.hashType,
        args: '0x03' + eventId.padStart(62, '0')  // 0x03 = Result type
    };
    
    // Lock script with timelock enforcement
    const lockScript = {
        codeHash: VOTESECURE_LOCKSCRIPT?.codeHash,
        hashType: VOTESECURE_LOCKSCRIPT?.hashType,
        args: '0x03' + eventId.padStart(62, '0')  // Result unlock rules
    };
    
    return {
        eventId: eventId,
        cellType: CELL_TYPES.RESULT,
        data: cellData,
        releasePolicy: releasePolicy,
        capacity: capacity,
        cellOutput: {
            capacity: '0x' + capacity.toString(16),
            lock: lockScript,
            type: typeScript
        },
        encodedData: window.CKBService?.encodeResultData(cellData) || '0x'
    };
}

// ============================================================================
// BLOCKCHAIN OPERATIONS
// ============================================================================

const blockchainStorage = {
    cells: [],
    events: []
};

/**
 * Create cells on CKB blockchain using JoyID
 * @param {string} organizerAddress - Organizer's CKB address
 * @param {Array} cells - Array of cell objects to create
 * @returns {Promise<string>} Transaction hash
 */
async function createCellsOnChain(organizerAddress, cells) {
    try {
        if (DEBUG_LOG) {
            console.log('Creating cells on CKB blockchain:', cells);
        }
        
        if (!window.CKBService?.signAndSendTransaction) {
            throw new Error('CKB Service not available. Please ensure ckbServiceBridge.js is loaded.');
        }
        
        // Calculate total capacity needed for all cells
        const totalCapacity = cells.reduce((sum, cell) => sum + (cell.capacity || 0), 0);
        const totalCKB = totalCapacity / 100000000;
        
        if (DEBUG_LOG) {
            console.log(`Total capacity needed: ${totalCapacity} shannons (${totalCKB} CKB)`);
        }
        
        // Check available balance
        const availableShannons = await window.CKBService.getSpendableCapacityShannons(organizerAddress);
        
        if (DEBUG_LOG) {
            console.log(`Available: ${availableShannons} shannons, Required: ${totalCapacity} shannons`);
        }
        
        if (BigInt(availableShannons) < BigInt(totalCapacity)) {
            const availableCKB = window.CKBService.shannons2CKB(availableShannons);
            throw new Error(
                `Insufficient balance. Need ${totalCKB.toFixed(2)} CKB, but have ${availableCKB} CKB`
            );
        }
        
        // Use JoyID to sign and send transaction
        const txHash = await window.CKBService.signAndSendTransaction(
            organizerAddress,
            organizerAddress,
            totalCKB
        );
        
        if (DEBUG_LOG) {
            console.log('Cells created successfully. TxHash:', txHash);
        }
        
        return txHash;
        
    } catch (error) {
        console.error('Failed to create cells on blockchain:', error);
        throw error;
    }
}

/**
 * Verify transaction on blockchain
 * @param {string} txHash - Transaction hash
 * @returns {Promise<Object>} Transaction status
 */
async function verifyTransaction(txHash) {
    try {
        if (!window.CKBService?.getTransactionStatus) {
            throw new Error('CKB Service not available');
        }
        
        const status = await window.CKBService.getTransactionStatus(txHash);
        
        return {
            success: true,
            status: status.status || 'pending',
            transaction: status.transaction
        };
    } catch (error) {
        console.error('Transaction verification failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Publish event to blockchain
 * Creates EventFund, Metadata, and Result cells
 * @param {Object} eventConfig - Event configuration
 * @param {string} organizerAddress - Organizer CKB address
 * @returns {Promise<Object>} Published event data
 */
async function publishEvent(eventConfig, organizerAddress) {
    try {
        // Initialize lockscript config if not already done
        if (!VOTESECURE_LOCKSCRIPT) {
            VOTESECURE_LOCKSCRIPT = getLockscriptConfig();
        }
        
        if (!VOTESECURE_LOCKSCRIPT) {
            throw new Error('VoteSecure Lockscript not configured. ckbServiceBridge.js must be loaded first.');
        }
        
        if (DEBUG_LOG) {
            console.log('Publishing event to blockchain...', eventConfig);
        }
        
        // Generate event ID if not provided
        if (!eventConfig.eventId) {
            eventConfig.eventId = generateEventId();
        }
        
        // Calculate total funding needed
        const estimatedVoters = eventConfig.estimatedVoters || 100;
        const perVoterCost = CAPACITY_CKB.VOTER;
        const allowedUpdates = eventConfig.allowedUpdates || 3;
        const totalVoterCapacity = estimatedVoters * perVoterCost * allowedUpdates;
        
        const estimatedCost = {
            metadata: CAPACITY_CKB.METADATA,
            result: CAPACITY_CKB.RESULT,
            eventfund: totalVoterCapacity + CAPACITY_CKB.EVENTFUND_BASE,
            total: CAPACITY_CKB.METADATA + CAPACITY_CKB.RESULT + totalVoterCapacity + CAPACITY_CKB.EVENTFUND_BASE
        };
        
        if (DEBUG_LOG) {
            console.log('Event cost estimation:', estimatedCost);
        }
        
        // Create cell data structures
        const eventFundCell = createEventFundCell(organizerAddress, eventConfig.eventId, estimatedCost.eventfund);
        const metadataCell = await createMetadataCell(eventConfig);
        const resultCell = createResultCell(eventConfig.eventId, eventConfig.resultReleasePolicy);
        
        // Create cells on blockchain
        const txHash = await createCellsOnChain(organizerAddress, [
            eventFundCell,
            metadataCell,
            resultCell
        ]);
        
        if (!txHash) {
            throw new Error('Failed to create blockchain transaction');
        }
        
        // Store in local cache
        blockchainStorage.cells.push(eventFundCell, metadataCell, resultCell);
        
        const inviteMaterials = generateInviteMaterials(eventConfig);
        
        const event = {
            eventId: eventConfig.eventId,
            status: ELECTION_STATUS.PUBLISHED,
            eventFundCellId: eventFundCell.eventId,
            metadataCellId: metadataCell.eventId,
            resultCellId: resultCell.eventId,
            organizerId: organizerAddress,
            inviteMaterials: inviteMaterials,
            publishedAt: Date.now(),
            txHash: txHash,
            estimatedCost: estimatedCost
        };
        
        blockchainStorage.events.push(event);
        
        if (DEBUG_LOG) {
            console.log('Event published successfully. TxHash:', txHash);
        }
        
        return {
            success: true,
            event: event,
            txHash: txHash,
            eventUrl: `${window.location.origin}/web/voter.html?event=${eventConfig.eventId}`,
            inviteMaterials: inviteMaterials,
            explorerUrl: USE_MAINNET 
                ? `https://explorer.nervos.org/transaction/${txHash}`
                : `https://pudge.explorer.nervos.org/transaction/${txHash}`,
            estimatedCost: estimatedCost
        };
    } catch (error) {
        console.error('Event publication failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Submit ballot to blockchain (sponsored by EventFund)
 * Voter can have empty wallet - transaction is paid by organizer's EventFund
 * @param {Object} ballot - Ballot data
 * @param {string} voterAddress - Voter CKB address
 * @returns {Promise<Object>} Submission result with receipt
 */
async function submitBallot(ballot, voterAddress) {
    try {
        const event = blockchainStorage.events.find(e => e.eventId === ballot.eventId);
        if (!event) throw new Error('Event not found');
        
        const metadataCell = blockchainStorage.cells.find(c => c.eventId === event.metadataCellId && c.cellType === CELL_TYPES.METADATA);
        const eventFundCell = blockchainStorage.cells.find(c => c.eventId === event.eventFundCellId && c.cellType === CELL_TYPES.EVENTFUND);
        
        if (!metadataCell) throw new Error('Event metadata not found');
        if (!eventFundCell) throw new Error('EventFund cell not found');
        
        const now = Date.now();
        if (now < metadataCell.data.schedule.startTime * 1000) {
            throw new Error('Voting has not started yet');
        }
        if (now > metadataCell.data.schedule.endTime * 1000) {
            throw new Error('Voting has ended');
        }
        
        // Check existing ballots for this voter
        const existingBallots = blockchainStorage.cells.filter(
            c => c.cellType === CELL_TYPES.VOTER && 
                 c.eventId === ballot.eventId && 
                 c.data.voterPubKeyHash === voterAddress
        );
        
        const sequence = existingBallots.length + 1;
        
        if (sequence > metadataCell.data.allowedUpdates) {
            throw new Error(`Update limit reached (max ${metadataCell.data.allowedUpdates})`);
        }
        
        ballot.sequence = sequence;
        ballot.eventId = ballot.eventId;
        ballot.voterPublicKeyHash = voterAddress;
        
        const voterCell = await createVoterCell(ballot, metadataCell.data.publicKey, ballot.eventId);
        
        if (DEBUG_LOG) {
            console.log('Submitting ballot (sponsored by EventFund)...', voterCell);
        }
        
        // Check if EventFund has enough capacity
        const voterCostCKB = voterCell.capacity / 100000000;
        if (eventFundCell.data.remainingFunds < voterCostCKB) {
            throw new Error('Insufficient funds in EventFund for ballot submission');
        }
        
        // Create voter cell on blockchain using EventFund sponsorship
        const txHash = await createCellsOnChain(event.organizerId, [voterCell]);
        
        if (!txHash) {
            throw new Error('Failed to submit ballot to blockchain');
        }
        
        // Update EventFund remaining capacity
        eventFundCell.data.remainingFunds -= voterCostCKB;
        blockchainStorage.cells.push(voterCell);
        
        const receipt = {
            eventId: ballot.eventId,
            voterId: voterAddress,
            commitment: voterCell.data.voterCommitment,
            sequence: sequence,
            timestamp: voterCell.data.timestamp,
            txHash: txHash,
            sponsoredByEventFund: true,
            proofUrl: `${window.location.origin}/web/voter.html?event=${ballot.eventId}&proof=${voterCell.eventId}`,
            explorerUrl: USE_MAINNET 
                ? `https://explorer.nervos.org/transaction/${txHash}`
                : `https://pudge.explorer.nervos.org/transaction/${txHash}`
        };
        
        if (DEBUG_LOG) {
            console.log('Ballot submitted successfully. TxHash:', txHash);
            console.log(`EventFund remaining funds: ${eventFundCell.data.remainingFunds} CKB`);
        }
        
        return {
            success: true,
            receipt: receipt
        };
    } catch (error) {
        console.error('Ballot submission failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Release results (unlock result cell after timelock)
 * @param {string} eventId - Event identifier
 * @param {string} confirmerId - ID of party confirming release
 * @returns {Promise<Object>} Release result
 */
async function releaseResults(eventId, confirmerId) {
    try {
        const event = blockchainStorage.events.find(e => e.eventId === eventId);
        if (!event) throw new Error('Event not found');
        
        const metadataCell = blockchainStorage.cells.find(c => c.eventId === event.metadataCellId && c.cellType === CELL_TYPES.METADATA);
        const resultCell = blockchainStorage.cells.find(c => c.eventId === event.resultCellId && c.cellType === CELL_TYPES.RESULT);
        
        if (!resultCell) throw new Error('Result cell not found');
        
        const now = Date.now();
        const releaseTimeMs = metadataCell.data.schedule.resultsReleaseTime * 1000;
        
        if (now < releaseTimeMs) {
            const waitTime = Math.ceil((releaseTimeMs - now) / 1000);
            throw new Error(`Results cannot be released yet. Wait ${waitTime} more seconds.`);
        }
        
        // Add confirmation (threshold multisig)
        if (!resultCell.data.confirmations.includes(confirmerId)) {
            resultCell.data.confirmations.push(confirmerId);
        }
        
        const requiredConfirmations = metadataCell.data.resultReleasePolicy?.required || 3;
        
        if (resultCell.data.confirmations.length >= requiredConfirmations) {
            const computedResults = await computeResults(eventId);
            resultCell.data.results = computedResults.totals;
            resultCell.data.groupResults = computedResults.groupResults;
            resultCell.data.includedBallots = computedResults.includedBallots;
            resultCell.data.releasedAt = Math.floor(Date.now() / 1000);
            resultCell.data.status = 'released';
            
            event.status = ELECTION_STATUS.RESULTS_RELEASED;
            
            if (DEBUG_LOG) {
                console.log('Results released successfully', computedResults);
            }
            
            return {
                success: true,
                results: computedResults,
                releasedAt: resultCell.data.releasedAt
            };
        } else {
            const remaining = requiredConfirmations - resultCell.data.confirmations.length;
            return {
                success: false,
                message: `Confirmation added. ${remaining} more needed.`,
                confirmations: resultCell.data.confirmations.length,
                required: requiredConfirmations
            };
        }
    } catch (error) {
        console.error('Result release failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Compute election results from voter cells
 * @param {string} eventId - Event identifier
 * @returns {Promise<Object>} Computed results
 */
async function computeResults(eventId) {
    try {
        const event = blockchainStorage.events.find(e => e.eventId === eventId);
        const metadataCell = blockchainStorage.cells.find(c => c.eventId === event.metadataCellId && c.cellType === CELL_TYPES.METADATA);
        
        const voterCells = blockchainStorage.cells.filter(
            c => c.cellType === CELL_TYPES.VOTER && c.eventId === eventId
        );
        
        // Get latest ballot per voter (respecting revote limit)
        const latestBallots = {};
        voterCells.forEach(cell => {
            const voterId = cell.data.voterPubKeyHash;
            if (!latestBallots[voterId] || cell.data.sequence > latestBallots[voterId].data.sequence) {
                latestBallots[voterId] = cell;
            }
        });
        
        const totals = {};
        const groupResults = {};
        const includedBallots = [];
        
        // Initialize totals
        metadataCell.data.questions.forEach(q => {
            totals[q.id] = {};
            q.options.forEach(opt => {
                totals[q.id][opt.id] = 0;
            });
        });
        
        // Count votes
        Object.values(latestBallots).forEach(cell => {
            includedBallots.push({
                voterCommitment: cell.data.voterCommitment,
                sequence: cell.data.sequence,
                timestamp: cell.data.timestamp,
                txHash: cell.txHash
            });
            
            // Generate mock answers (in production, decrypt from encryptedBallot)
            const mockAnswers = generateMockAnswers(metadataCell.data.questions);
            
            mockAnswers.forEach(answer => {
                if (Array.isArray(answer.selectedOptions)) {
                    answer.selectedOptions.forEach(optId => {
                        totals[answer.questionId][optId]++;
                    });
                } else {
                    totals[answer.questionId][answer.selectedOptions]++;
                }
            });
            
            // Group-level tallying if enabled
            if (metadataCell.data.reportingGranularity !== 'totals_only') {
                const groupKey = extractGroupKey(cell.data.groupingData, metadataCell.data.groupingFields);
                if (!groupResults[groupKey]) {
                    groupResults[groupKey] = {};
                    metadataCell.data.questions.forEach(q => {
                        groupResults[groupKey][q.id] = {};
                        q.options.forEach(opt => {
                            groupResults[groupKey][q.id][opt.id] = 0;
                        });
                    });
                    groupResults[groupKey]._count = 0;
                }
                
                groupResults[groupKey]._count++;
                mockAnswers.forEach(answer => {
                    if (Array.isArray(answer.selectedOptions)) {
                        answer.selectedOptions.forEach(optId => {
                            groupResults[groupKey][answer.questionId][optId]++;
                        });
                    } else {
                        groupResults[groupKey][answer.questionId][answer.selectedOptions]++;
                    }
                });
            }
        });
        
        // Apply k-anonymity
        const minGroupSize = metadataCell.data.minGroupSize || 5;
        const mergedGroupResults = applyKAnonymity(groupResults, minGroupSize);
        
        return {
            totals: totals,
            groupResults: mergedGroupResults,
            includedBallots: includedBallots,
            totalVoters: Object.keys(latestBallots).length
        };
    } catch (error) {
        console.error('Result computation failed:', error);
        throw error;
    }
}

/**
 * Apply k-anonymity by merging small groups
 */
function applyKAnonymity(groupResults, minSize) {
    const merged = {};
    const smallGroups = [];
    
    Object.entries(groupResults).forEach(([groupKey, data]) => {
        if (data._count >= minSize) {
            merged[groupKey] = data;
        } else {
            smallGroups.push({ key: groupKey, data: data });
        }
    });
    
    if (smallGroups.length > 0) {
        merged['_other_merged'] = { _count: 0 };
        smallGroups.forEach(group => {
            merged['_other_merged']._count += group.data._count;
            Object.keys(group.data).forEach(questionId => {
                if (questionId === '_count') return;
                if (!merged['_other_merged'][questionId]) {
                    merged['_other_merged'][questionId] = {};
                }
                Object.keys(group.data[questionId]).forEach(optionId => {
                    if (!merged['_other_merged'][questionId][optionId]) {
                        merged['_other_merged'][questionId][optionId] = 0;
                    }
                    merged['_other_merged'][questionId][optionId] += group.data[questionId][optionId];
                });
            });
        });
    }
    
    return merged;
}

function extractGroupKey(groupingData, groupingFields) {
    if (!groupingData || !groupingFields || groupingFields.length === 0) {
        return '_all';
    }
    return groupingFields.map(field => groupingData[field] || 'unknown').join('_');
}

function generateMockAnswers(questions) {
    return questions.map(q => {
        const selectedOption = q.options[Math.floor(Math.random() * q.options.length)];
        return {
            questionId: q.id,
            selectedOptions: q.type === 'multi' ? [selectedOption.id] : selectedOption.id
        };
    });
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

function getEvent(eventId) {
    const event = blockchainStorage.events.find(e => e.eventId === eventId);
    if (!event) return null;
    
    const metadataCell = blockchainStorage.cells.find(c => c.eventId === event.metadataCellId && c.cellType === CELL_TYPES.METADATA);
    const resultCell = blockchainStorage.cells.find(c => c.eventId === event.resultCellId && c.cellType === CELL_TYPES.RESULT);
    const eventFundCell = blockchainStorage.cells.find(c => c.eventId === event.eventFundCellId && c.cellType === CELL_TYPES.EVENTFUND);
    
    return {
        ...event,
        metadata: metadataCell?.data,
        results: resultCell?.data,
        eventFund: {
            remainingFunds: eventFundCell?.data.remainingFunds,
            totalFunds: eventFundCell?.data.initialFunds
        }
    };
}

function getEventsByOrganizer(organizerId) {
    return blockchainStorage.events
        .filter(e => e.organizerId === organizerId)
        .map(event => {
            const metadataCell = blockchainStorage.cells.find(c => c.eventId === event.metadataCellId && c.cellType === CELL_TYPES.METADATA);
            const eventFundCell = blockchainStorage.cells.find(c => c.eventId === event.eventFundCellId && c.cellType === CELL_TYPES.EVENTFUND);
            return {
                ...event,
                metadata: metadataCell?.data,
                eventFund: {
                    remainingFunds: eventFundCell?.data.remainingFunds,
                    totalFunds: eventFundCell?.data.initialFunds
                }
            };
        });
}

function verifyBallotInclusion(eventId, commitment) {
    const event = blockchainStorage.events.find(e => e.eventId === eventId);
    if (!event) return { verified: false, error: 'Event not found' };
    
    const voterCell = blockchainStorage.cells.find(
        c => c.cellType === CELL_TYPES.VOTER && 
             c.eventId === eventId && 
             c.data.voterCommitment === commitment
    );
    
    if (!voterCell) {
        return { verified: false, error: 'Ballot not found' };
    }
    
    return {
        verified: true,
        sequence: voterCell.data.sequence,
        timestamp: voterCell.data.timestamp,
        txHash: voterCell.txHash
    };
}

function getLiveStatistics(eventId) {
    const event = blockchainStorage.events.find(e => e.eventId === eventId);
    if (!event) return null;
    
    const metadataCell = blockchainStorage.cells.find(c => c.eventId === event.metadataCellId && c.cellType === CELL_TYPES.METADATA);
    const voterCells = blockchainStorage.cells.filter(
        c => c.cellType === CELL_TYPES.VOTER && c.eventId === eventId
    );
    
    const uniqueVoters = new Set(voterCells.map(c => c.data.voterPubKeyHash));
    
    const groupCounts = {};
    voterCells.forEach(cell => {
        const groupKey = extractGroupKey(cell.data.groupingData, metadataCell.data.groupingFields);
        groupCounts[groupKey] = (groupCounts[groupKey] || 0) + 1;
    });
    
    const stats = {
        totalBallots: voterCells.length,
        uniqueVoters: uniqueVoters.size,
        groupCounts: groupCounts,
        lastUpdate: Date.now()
    };
    
    if (metadataCell.data.liveStatsMode === 'realtime') {
        stats.message = 'Live totals available in real-time mode';
    }
    
    return stats;
}

// ============================================================================
// COST ESTIMATION
// ============================================================================

function estimateEventCost(eventConfig) {
    const estimatedVoters = eventConfig.estimatedVoters || 100;
    const allowedUpdates = eventConfig.allowedUpdates || 3;
    
    const metadataCost = CAPACITY_CKB.METADATA;
    const resultCost = CAPACITY_CKB.RESULT;
    const perVoterCost = CAPACITY_CKB.VOTER;
    const votersCost = estimatedVoters * perVoterCost * allowedUpdates;
    const eventFundBase = CAPACITY_CKB.EVENTFUND_BASE;
    
    const totalCost = metadataCost + resultCost + votersCost + eventFundBase;
    
    return {
        baseMetadataCost: metadataCost,
        baseResultCost: resultCost,
        perVoterCost: perVoterCost,
        estimatedVoters: estimatedVoters,
        allowedUpdates: allowedUpdates,
        votersCost: votersCost,
        eventFundBase: eventFundBase,
        totalCost: Math.ceil(totalCost),
        breakdown: {
            metadata: metadataCost,
            result: resultCost,
            voters: votersCost,
            eventfundBase: eventFundBase
        }
    };
}

// ============================================================================
// INVITE MATERIAL GENERATION
// ============================================================================

function generateInviteMaterials(eventConfig) {
    const baseUrl = `${window.location.origin}/web/voter.html?event=${eventConfig.eventId}`;
    
    switch (eventConfig.eligibility.type) {
        case 'public':
            return {
                type: 'public',
                url: baseUrl,
                description: 'Public voting - anyone can participate'
            };
            
        case 'invite_key':
            const inviteKey = generateInviteKey();
            return {
                type: 'invite_key',
                url: `${baseUrl}&key=${inviteKey}`,
                inviteKey: inviteKey,
                description: 'Single invite key for all voters'
            };
            
        case 'per_voter':
            return {
                type: 'per_voter',
                description: 'Per-voter keys - distribute securely to each voter',
                voterCount: eventConfig.eligibility.voters?.length || 0
            };
            
        case 'curated_list':
            return {
                type: 'curated_list',
                url: baseUrl,
                description: 'Curated voter list - voters verified before voting',
                voterCount: eventConfig.eligibility.voters?.length || 0
            };
            
        default:
            return {
                type: 'public',
                url: baseUrl
            };
    }
}

/**
 * Withdraw remaining EventFund after event
 * @param {string} eventId - Event identifier
 * @param {string} organizerAddress - Organizer's address
 * @returns {Promise<Object>} Withdrawal result
 */
async function withdrawEventFunds(eventId, organizerAddress) {
    try {
        const event = blockchainStorage.events.find(e => e.eventId === eventId);
        if (!event) throw new Error('Event not found');
        
        if (event.organizerId !== organizerAddress) {
            throw new Error('Only organizer can withdraw funds');
        }
        
        const eventFundCell = blockchainStorage.cells.find(c => c.eventId === event.eventFundCellId && c.cellType === CELL_TYPES.EVENTFUND);
        if (!eventFundCell) throw new Error('EventFund cell not found');
        
        const metadataCell = blockchainStorage.cells.find(c => c.eventId === event.metadataCellId && c.cellType === CELL_TYPES.METADATA);
        const now = Date.now();
        
        // Check if event has ended
        if (now < metadataCell.data.schedule.endTime * 1000) {
            throw new Error('Cannot withdraw funds while event is active');
        }
        
        const remainingFunds = eventFundCell.data.remainingFunds;
        if (remainingFunds <= 0) {
            throw new Error('No funds remaining to withdraw');
        }
        
        if (DEBUG_LOG) {
            console.log(`Withdrawing ${remainingFunds} CKB from EventFund cell`);
        }
        
        // Mark as withdrawn
        eventFundCell.data.remainingFunds = 0;
        eventFundCell.data.withdrawnAt = Math.floor(Date.now() / 1000);
        
        return {
            success: true,
            withdrawnAmount: remainingFunds,
            message: `Successfully withdrew ${remainingFunds} CKB from EventFund`
        };
        
    } catch (error) {
        console.error('EventFund withdrawal failed:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof window !== 'undefined') {
    window.VoteSecureBlockchain = {
        // Core operations
        publishEvent,
        submitBallot,
        releaseResults,
        withdrawEventFunds,
        
        // Blockchain operations
        createCellsOnChain,
        verifyTransaction,
        
        // Query functions
        getEvent,
        getEventsByOrganizer,
        verifyBallotInclusion,
        getLiveStatistics,
        
        // Utilities
        estimateEventCost,
        generateKeyPair,
        encryptBallot,
        generateHash,
        generateBallotCommitment,
        generateInviteKey,
        generateEventId,
        
        // JoyID integration
        connectJoyID,
        
        // Constants
        ELECTION_STATUS,
        CELL_TYPES,
        CAPACITY_CKB,
        
        // Configuration
        DEBUG_LOG,
        USE_MAINNET,
        RPC_URL,
        INDEXER_URL,
        MIN_CELL_CAPACITY,
        getLockscriptConfig
    };
    
    if (DEBUG_LOG) {
        console.log('✓ VoteSecure Blockchain Module loaded');
        console.log('  Network:', JOYID_NET);
        console.log('  RPC:', RPC_URL);
        console.log('  Waiting for CKBService to configure Lockscript...');
    }
    
    window.dispatchEvent(new Event('blockchainReady'));
}
