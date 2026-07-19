/**
 * VoteSecure Blockchain Module
 * Handles all CKB blockchain interactions for voting system
 * Updated to work with @ckb-ccc/connector-react
 */

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

// Network configuration
const DEBUG_LOG = true;
const USE_MAINNET = false;

// Network endpoints (retrieved from CKBService)
const NETWORK = USE_MAINNET ? 'mainnet' : 'testnet';

if (DEBUG_LOG) {
    console.log(`DEBUG_LOG: ${DEBUG_LOG}`);
    console.log(`USE_MAINNET: ${USE_MAINNET}`);
    console.log(`NETWORK: ${NETWORK}`);
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
    MIN_CELL: 61,
    METADATA: 150,
    RESULT: 200,
    VOTER: 70,
    EVENTFUND_BASE: 100
};

// Minimum cell capacity in shannons
const MIN_CELL_CAPACITY = CAPACITY_CKB.MIN_CELL * 100000000;

// ============================================================================
// VOTESECURE LOCKSCRIPT REFERENCE
// ============================================================================
let VOTESECURE_LOCKSCRIPT = null;

function getLockscriptConfig() {
    if (!VOTESECURE_LOCKSCRIPT && window?.CKBService?.getLockscriptConfig) {
        VOTESECURE_LOCKSCRIPT = window.CKBService.getLockscriptConfig();
    }
    return VOTESECURE_LOCKSCRIPT;
}

// ============================================================================
// WALLET CONNECTION (delegates to CKB Service Bridge)
// ============================================================================

/**
 * Connect to wallet via the CKB Service Bridge
 * Note: The actual wallet connection UI is handled by ccc.Provider in React
 * This function checks if a connection exists
 * @returns {{address: string, balance: string, network: string}}
 */
async function connectWallet() {
    if (window?.CKBService?.connectWallet) {
        return await window.CKBService.connectWallet();
    }
    throw new Error('CKBService bridge is not ready. Please ensure ckbServiceBridge.js is loaded.');
}

// Keep old function name for backwards compatibility
const connectJoyID = connectWallet;

// ============================================================================
// CRYPTOGRAPHIC UTILITIES
// ============================================================================

/**
 * Generate a key pair for encryption
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
 */
async function generateHash(data) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataBuffer);
    return arrayBufferToHex(hashBuffer);
}

/**
 * Generate ballot receipt commitment
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
 */
function generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate invite key
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
// IN-MEMORY BLOCKCHAIN STORAGE (for demo/testing)
// ============================================================================

const blockchainStorage = {
    events: [],
    cells: [],
    transactions: []
};

function createCell(cellType, eventId, data, capacity) {
    const cell = {
        cellId: `cell_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        cellType,
        eventId,
        data,
        capacity,
        createdAt: Date.now(),
        txHash: null
    };
    
    blockchainStorage.cells.push(cell);
    return cell;
}

// ============================================================================
// CELL CREATION FUNCTIONS
// ============================================================================

function createEventFundCell(eventConfig, organizerId) {
    const fundAmount = eventConfig.totalFunding || CAPACITY_CKB.EVENTFUND_BASE;
    
    const eventFundData = {
        eventId: eventConfig.eventId,
        organizerId: organizerId,
        initialFunds: fundAmount,
        remainingFunds: fundAmount,
        createdAt: Math.floor(Date.now() / 1000)
    };
    
    return createCell(CELL_TYPES.EVENTFUND, eventConfig.eventId, eventFundData, fundAmount);
}

function createMetadataCell(eventConfig, organizerId, encryptionPubKey) {
    const metadataData = {
        eventId: eventConfig.eventId,
        organizerId: organizerId,
        title: eventConfig.title,
        description: eventConfig.description,
        questions: eventConfig.questions,
        eligibility: eventConfig.eligibility,
        schedule: eventConfig.schedule,
        encryptionPubKey: encryptionPubKey,
        votingMode: eventConfig.votingMode || 'single',
        liveStatsMode: eventConfig.liveStatsMode || 'hidden',
        groupingFields: eventConfig.groupingFields || [],
        createdAt: Math.floor(Date.now() / 1000)
    };
    
    return createCell(CELL_TYPES.METADATA, eventConfig.eventId, metadataData, CAPACITY_CKB.METADATA);
}

function createResultCell(eventConfig, organizerId) {
    const resultData = {
        eventId: eventConfig.eventId,
        organizerId: organizerId,
        results: null,
        releasedAt: null,
        encryptedPrivateKey: null
    };
    
    return createCell(CELL_TYPES.RESULT, eventConfig.eventId, resultData, CAPACITY_CKB.RESULT);
}

function createVoterCell(eventId, ballotData, sequence) {
    const voterData = {
        eventId: eventId,
        voterPubKeyHash: ballotData.voterPubKeyHash,
        voterCommitment: ballotData.commitment,
        encryptedBallot: ballotData.encryptedBallot,
        groupingData: ballotData.groupingData || {},
        sequence: sequence,
        timestamp: Math.floor(Date.now() / 1000)
    };
    
    return createCell(CELL_TYPES.VOTER, eventId, voterData, CAPACITY_CKB.VOTER);
}

// ============================================================================
// BLOCKCHAIN OPERATIONS (using CKBService)
// ============================================================================

async function createCellsOnChain(cells, organizerAddress) {
    try {
        if (DEBUG_LOG) {
            console.log(`Creating ${cells.length} cells on blockchain...`);
        }

        // In a real implementation, this would build and send a transaction
        // using the CKB Service Bridge
        const txHash = `0x${Array(64).fill(0).map(() => 
            Math.floor(Math.random() * 16).toString(16)).join('')}`;

        cells.forEach(cell => {
            cell.txHash = txHash;
        });

        blockchainStorage.transactions.push({
            txHash,
            cells: cells.map(c => c.cellId),
            createdAt: Date.now(),
            status: 'committed'
        });

        if (DEBUG_LOG) {
            console.log(`Cells created on-chain with tx: ${txHash}`);
        }

        return { success: true, txHash, cells };
    } catch (error) {
        console.error('Failed to create cells on-chain:', error);
        return { success: false, error: error.message };
    }
}

async function verifyTransaction(txHash) {
    if (window?.CKBService?.getTransactionStatus) {
        return await window.CKBService.getTransactionStatus(txHash);
    }
    
    const tx = blockchainStorage.transactions.find(t => t.txHash === txHash);
    return tx ? { status: tx.status, txHash } : { status: 'not_found', txHash };
}

// ============================================================================
// CORE VOTING OPERATIONS
// ============================================================================

async function publishEvent(eventConfig, organizerAddress) {
    try {
        if (DEBUG_LOG) {
            console.log('Publishing event:', eventConfig.eventId);
        }

        const keyPair = await generateKeyPair();
        
        const eventFundCell = createEventFundCell(eventConfig, organizerAddress);
        const metadataCell = createMetadataCell(eventConfig, organizerAddress, keyPair.publicKey);
        const resultCell = createResultCell(eventConfig, organizerAddress);
        
        const cells = [eventFundCell, metadataCell, resultCell];
        const result = await createCellsOnChain(cells, organizerAddress);
        
        if (result.success) {
            const event = {
                eventId: eventConfig.eventId,
                organizerId: organizerAddress,
                eventFundCellId: eventFundCell.cellId,
                metadataCellId: metadataCell.cellId,
                resultCellId: resultCell.cellId,
                status: ELECTION_STATUS.PUBLISHED,
                encryptionPrivateKey: keyPair.privateKey,
                publishedAt: Date.now(),
                txHash: result.txHash
            };
            
            blockchainStorage.events.push(event);
            
            return {
                success: true,
                event,
                inviteMaterials: generateInviteMaterials(eventConfig)
            };
        }
        
        return result;
    } catch (error) {
        console.error('Event publication failed:', error);
        return { success: false, error: error.message };
    }
}

async function submitBallot(eventId, ballotData) {
    try {
        const event = blockchainStorage.events.find(e => e.eventId === eventId);
        if (!event) throw new Error('Event not found');
        
        const metadataCell = blockchainStorage.cells.find(
            c => c.cellId === event.metadataCellId && c.cellType === CELL_TYPES.METADATA
        );
        
        if (!metadataCell) throw new Error('Event metadata not found');
        
        const commitment = await generateBallotCommitment(ballotData);
        const encryptedBallot = await encryptBallot(ballotData, metadataCell.data.encryptionPubKey);
        
        const voterCells = blockchainStorage.cells.filter(
            c => c.cellType === CELL_TYPES.VOTER && c.eventId === eventId
        );
        
        const sequence = voterCells.length + 1;
        
        const voterCell = createVoterCell(eventId, {
            ...ballotData,
            commitment,
            encryptedBallot
        }, sequence);
        
        const result = await createCellsOnChain([voterCell], ballotData.voterAddress);
        
        if (result.success) {
            return {
                success: true,
                receipt: {
                    commitment,
                    sequence,
                    timestamp: voterCell.data.timestamp,
                    txHash: result.txHash
                }
            };
        }
        
        return result;
    } catch (error) {
        console.error('Ballot submission failed:', error);
        return { success: false, error: error.message };
    }
}

async function releaseResults(eventId, organizerAddress) {
    try {
        const event = blockchainStorage.events.find(e => e.eventId === eventId);
        if (!event) throw new Error('Event not found');
        
        if (event.organizerId !== organizerAddress) {
            throw new Error('Only organizer can release results');
        }
        
        const resultCell = blockchainStorage.cells.find(
            c => c.cellId === event.resultCellId && c.cellType === CELL_TYPES.RESULT
        );
        
        if (!resultCell) throw new Error('Result cell not found');
        
        const voterCells = blockchainStorage.cells.filter(
            c => c.cellType === CELL_TYPES.VOTER && c.eventId === eventId
        );
        
        resultCell.data.results = {
            totalBallots: voterCells.length,
            releasedAt: Math.floor(Date.now() / 1000)
        };
        resultCell.data.releasedAt = Math.floor(Date.now() / 1000);
        resultCell.data.encryptedPrivateKey = event.encryptionPrivateKey;
        
        event.status = ELECTION_STATUS.RESULTS_RELEASED;
        
        return {
            success: true,
            results: resultCell.data.results
        };
    } catch (error) {
        console.error('Result release failed:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

function getEvent(eventId) {
    const event = blockchainStorage.events.find(e => e.eventId === eventId);
    if (!event) return null;
    
    const metadataCell = blockchainStorage.cells.find(c => c.cellId === event.metadataCellId);
    const resultCell = blockchainStorage.cells.find(c => c.cellId === event.resultCellId);
    const eventFundCell = blockchainStorage.cells.find(c => c.cellId === event.eventFundCellId);
    
    return {
        ...event,
        metadata: metadataCell?.data,
        results: resultCell?.data,
        funding: {
            initial: eventFundCell?.data.initialFunds,
            remaining: eventFundCell?.data.remainingFunds,
            totalFunds: eventFundCell?.data.initialFunds
        }
    };
}

function getEventsByOrganizer(organizerAddress) {
    return blockchainStorage.events
        .filter(e => e.organizerId === organizerAddress)
        .map(event => {
            const metadataCell = blockchainStorage.cells.find(c => c.cellId === event.metadataCellId);
            const eventFundCell = blockchainStorage.cells.find(c => c.cellId === event.eventFundCellId);
            
            return {
                eventId: event.eventId,
                title: metadataCell?.data.title,
                status: event.status,
                publishedAt: event.publishedAt,
                funding: {
                    initial: eventFundCell?.data.initialFunds,
                    remaining: eventFundCell?.data.remainingFunds,
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
    
    const stats = {
        totalBallots: voterCells.length,
        uniqueVoters: uniqueVoters.size,
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
        
        // Wallet connection
        connectWallet,
        connectJoyID, // Backwards compatibility
        
        // Constants
        ELECTION_STATUS,
        CELL_TYPES,
        CAPACITY_CKB,
        
        // Configuration
        DEBUG_LOG,
        USE_MAINNET,
        NETWORK,
        MIN_CELL_CAPACITY,
        getLockscriptConfig
    };
    
    if (DEBUG_LOG) {
        console.log('✓ VoteSecure Blockchain Module (CCC) loaded');
        console.log('  Network:', NETWORK);
        console.log('  Waiting for CKBService to configure Lockscript...');
    }
    
    window.dispatchEvent(new Event('blockchainReady'));
}
