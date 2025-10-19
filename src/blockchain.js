/**
 * VoteSecure Blockchain Module
 * Handles all CKB blockchain interactions for voting system
 */

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

// Network configuration
const DEBUG_LOG = true;
const USE_MAINNET = false; // Set to true for mainnet
const USE_PRIVATE_NODE = false; // Set to true if using private node

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

// Cell type identifiers
const CELL_TYPES = {
    LOCKSCRIPT: 'lockscript',
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

// ============================================================================
// JOYID INTEGRATION
// ============================================================================

/**
 * Connect to JoyID wallet
 * @returns {Object} Connected wallet info with address
 */
async function connectJoyID() {
    try {
        // Dynamically import JoyID SDK
        const { connect } = await import('https://unpkg.com/@joyid/ckb@latest/dist/index.js');
        
        const logoUrl = `${window.location.origin}/logo.png`;
        
        const authData = await connect({
            rpcURL: RPC_URL,
            network: JOYID_NET,
            name: 'VoteSecure',
            logo: logoUrl,
        });
        
        const address = authData.address;
        
        if (DEBUG_LOG) {
            console.log('JoyID connected:', address);
        }
        
        // Get balance
        const balance = await getAddressBalance(address);
        
        return {
            address: address,
            balance: balance,
            network: JOYID_NET
        };
    } catch (error) {
        console.error('JoyID connection failed:', error);
        throw new Error(`Failed to connect JoyID: ${error.message}`);
    }
}

/**
 * Get address balance in CKB
 * @param {string} address - CKB address
 * @returns {string} Balance in CKB
 */
async function getAddressBalance(address) {
    try {
        // This is a simplified balance check
        // In production, use proper indexer queries
        return "0.00000000"; // Placeholder
    } catch (error) {
        console.error('Balance query failed:', error);
        return "0.00000000";
    }
}

/**
 * Sign transaction with JoyID
 * @param {Object} txParams - Transaction parameters
 * @returns {Object} Signed transaction
 */
async function signTransactionWithJoyID(txParams) {
    try {
        const { signTransaction } = await import('https://unpkg.com/@joyid/ckb@latest/dist/index.js');
        
        const logoUrl = `${window.location.origin}/logo.png`;
        
        const signedTx = await signTransaction({
            from: txParams.from,
            to: txParams.to,
            amount: txParams.amount,
            rpcURL: RPC_URL,
            network: JOYID_NET,
            name: 'VoteSecure',
            logo: logoUrl,
        });
        
        if (DEBUG_LOG) {
            console.log('Transaction signed:', signedTx);
        }
        
        return signedTx;
    } catch (error) {
        console.error('Transaction signing failed:', error);
        throw new Error(`Failed to sign transaction: ${error.message}`);
    }
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
 * Generate unique cell ID
 * @returns {string} Unique identifier
 */
function generateCellId() {
    return `cell_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
 * Generate per-voter key
 * @param {string} voterId - Voter identifier
 * @param {string} eventSecret - Event secret
 * @returns {string} Voter-specific key
 */
async function generateVoterKey(voterId, eventSecret) {
    return await generateHash(`${eventSecret}_${voterId}_${Date.now()}`);
}

// ============================================================================
// CELL MANAGEMENT
// ============================================================================

/**
 * Create Lockscript Cell (holds organizer funds)
 * @param {string} organizerId - JoyID of organizer
 * @param {number} fundAmount - Amount in CKB
 * @returns {Object} Cell data
 */
function createLockscriptCell(organizerId, fundAmount) {
    return {
        id: generateCellId(),
        type: CELL_TYPES.LOCKSCRIPT,
        data: {
            organizerId: organizerId,
            fundAmount: fundAmount,
            remainingFunds: fundAmount,
            createdAt: Date.now()
        },
        status: 'active'
    };
}

/**
 * Create Metadata Cell (event configuration)
 * @param {Object} eventConfig - Event configuration object
 * @returns {Object} Cell data
 */
async function createMetadataCell(eventConfig) {
    // Generate event keys
    const keyPair = await generateKeyPair();
    
    // Calculate frontend code hash (in production, this would be actual hash)
    const frontendCodeHash = await generateHash(JSON.stringify({
        version: '0.9.0',
        timestamp: Date.now()
    }));
    
    return {
        id: generateCellId(),
        type: CELL_TYPES.METADATA,
        data: {
            eventId: eventConfig.eventId,
            title: eventConfig.title,
            description: eventConfig.description,
            questions: eventConfig.questions,
            schedule: eventConfig.schedule,
            eligibility: eventConfig.eligibility,
            anonymityLevel: eventConfig.anonymityLevel,
            reportingGranularity: eventConfig.reportingGranularity,
            groupingFields: eventConfig.groupingFields,
            minGroupSize: eventConfig.minGroupSize,
            allowedUpdates: eventConfig.allowedUpdates,
            publicKey: keyPair.publicKey,
            privateKey: keyPair.privateKey,
            frontendCodeHash: frontendCodeHash,
            liveStatsMode: eventConfig.liveStatsMode,
            resultReleasePolicy: eventConfig.resultReleasePolicy,
            createdAt: Date.now()
        },
        status: 'active'
    };
}

/**
 * Create Voter Cell (ballot submission)
 * @param {Object} ballot - Ballot data
 * @param {string} eventPublicKey - Event public key for encryption
 * @returns {Object} Cell data
 */
async function createVoterCell(ballot, eventPublicKey) {
    const encryptedBallot = await encryptBallot(ballot, eventPublicKey);
    const commitment = await generateBallotCommitment(ballot);
    
    return {
        id: generateCellId(),
        type: CELL_TYPES.VOTER,
        data: {
            eventId: ballot.eventId,
            voterId: ballot.voterId,
            voterPublicKey: ballot.voterPublicKey,
            encryptedBallot: encryptedBallot,
            commitment: commitment,
            sequence: ballot.sequence || 1,
            groupingData: ballot.groupingData,
            timestamp: Date.now()
        },
        status: 'active'
    };
}

/**
 * Create Result Cell (aggregated tallies)
 * @param {string} eventId - Event identifier
 * @returns {Object} Cell data
 */
function createResultCell(eventId) {
    return {
        id: generateCellId(),
        type: CELL_TYPES.RESULT,
        data: {
            eventId: eventId,
            results: null,
            groupResults: null,
            includedBallots: [],
            releasedAt: null,
            confirmations: [],
            status: 'locked'
        },
        status: 'locked'
    };
}

// ============================================================================
// BLOCKCHAIN OPERATIONS (Simulated for MVP)
// ============================================================================

const blockchainStorage = {
    cells: [],
    events: []
};

/**
 * Publish event to blockchain
 * @param {Object} eventConfig - Event configuration
 * @param {string} organizerId - Organizer JoyID
 * @returns {Object} Published event data
 */
async function publishEvent(eventConfig, organizerId) {
    try {
        const estimatedCost = estimateEventCost(eventConfig);
        
        const lockscriptCell = createLockscriptCell(organizerId, estimatedCost.totalCost);
        const metadataCell = await createMetadataCell(eventConfig);
        const resultCell = createResultCell(eventConfig.eventId);
        
        blockchainStorage.cells.push(lockscriptCell, metadataCell, resultCell);
        
        const inviteMaterials = generateInviteMaterials(eventConfig, metadataCell);
        
        const event = {
            eventId: eventConfig.eventId,
            status: ELECTION_STATUS.PUBLISHED,
            lockscriptCellId: lockscriptCell.id,
            metadataCellId: metadataCell.id,
            resultCellId: resultCell.id,
            organizerId: organizerId,
            inviteMaterials: inviteMaterials,
            publishedAt: Date.now()
        };
        
        blockchainStorage.events.push(event);
        
        return {
            success: true,
            event: event,
            eventUrl: `${window.location.origin}/web/voter.html?event=${eventConfig.eventId}`,
            qrCode: generateQRCodeData(eventConfig.eventId),
            inviteMaterials: inviteMaterials
        };
    } catch (error) {
        console.error('Event publication failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Submit ballot to blockchain
 * @param {Object} ballot - Ballot data
 * @param {string} voterId - Voter JoyID
 * @returns {Object} Submission result with receipt
 */
async function submitBallot(ballot, voterId) {
    try {
        const event = blockchainStorage.events.find(e => e.eventId === ballot.eventId);
        if (!event) throw new Error('Event not found');
        
        const metadataCell = blockchainStorage.cells.find(c => c.id === event.metadataCellId);
        if (!metadataCell) throw new Error('Event metadata not found');
        
        const now = Date.now();
        if (now < metadataCell.data.schedule.startTime) {
            throw new Error('Voting has not started yet');
        }
        if (now > metadataCell.data.schedule.endTime) {
            throw new Error('Voting has ended');
        }
        
        const existingBallots = blockchainStorage.cells.filter(
            c => c.type === CELL_TYPES.VOTER && 
                 c.data.eventId === ballot.eventId && 
                 c.data.voterId === voterId
        );
        
        const sequence = existingBallots.length + 1;
        
        if (sequence > metadataCell.data.allowedUpdates) {
            throw new Error(`Update limit reached (max ${metadataCell.data.allowedUpdates})`);
        }
        
        ballot.sequence = sequence;
        ballot.voterId = voterId;
        const voterCell = await createVoterCell(ballot, metadataCell.data.publicKey);
        
        blockchainStorage.cells.push(voterCell);
        
        const receipt = {
            eventId: ballot.eventId,
            voterId: voterId,
            commitment: voterCell.data.commitment,
            cellId: voterCell.id,
            sequence: sequence,
            timestamp: voterCell.data.timestamp,
            proofUrl: `${window.location.origin}/web/voter.html?event=${ballot.eventId}&proof=${voterCell.id}`
        };
        
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
 * Release results (unlock result cell)
 * @param {string} eventId - Event identifier
 * @param {string} confirmerId - ID of party confirming release
 * @returns {Object} Release result
 */
async function releaseResults(eventId, confirmerId) {
    try {
        const event = blockchainStorage.events.find(e => e.eventId === eventId);
        if (!event) throw new Error('Event not found');
        
        const metadataCell = blockchainStorage.cells.find(c => c.id === event.metadataCellId);
        const resultCell = blockchainStorage.cells.find(c => c.id === event.resultCellId);
        
        if (!resultCell) throw new Error('Result cell not found');
        
        const now = Date.now();
        if (now < metadataCell.data.schedule.resultsReleaseTime) {
            throw new Error('Results release time has not been reached');
        }
        
        if (!resultCell.data.confirmations.includes(confirmerId)) {
            resultCell.data.confirmations.push(confirmerId);
        }
        
        const requiredConfirmations = 3;
        if (resultCell.data.confirmations.length >= requiredConfirmations) {
            const computedResults = await computeResults(eventId);
            resultCell.data.results = computedResults.totals;
            resultCell.data.groupResults = computedResults.groupResults;
            resultCell.data.includedBallots = computedResults.includedBallots;
            resultCell.data.releasedAt = Date.now();
            resultCell.data.status = 'released';
            resultCell.status = 'released';
            
            event.status = ELECTION_STATUS.RESULTS_RELEASED;
            
            return {
                success: true,
                results: computedResults,
                releasedAt: resultCell.data.releasedAt
            };
        } else {
            return {
                success: false,
                message: `Confirmation added. ${requiredConfirmations - resultCell.data.confirmations.length} more needed.`,
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
 * @returns {Object} Computed results
 */
async function computeResults(eventId) {
    try {
        const event = blockchainStorage.events.find(e => e.eventId === eventId);
        const metadataCell = blockchainStorage.cells.find(c => c.id === event.metadataCellId);
        
        const voterCells = blockchainStorage.cells.filter(
            c => c.type === CELL_TYPES.VOTER && c.data.eventId === eventId
        );
        
        const latestBallots = {};
        voterCells.forEach(cell => {
            const voterId = cell.data.voterId;
            if (!latestBallots[voterId] || cell.data.sequence > latestBallots[voterId].data.sequence) {
                latestBallots[voterId] = cell;
            }
        });
        
        const totals = {};
        const groupResults = {};
        const includedBallots = [];
        
        metadataCell.data.questions.forEach(q => {
            totals[q.id] = {};
            q.options.forEach(opt => {
                totals[q.id][opt.id] = 0;
            });
        });
        
        Object.values(latestBallots).forEach(cell => {
            includedBallots.push({
                cellId: cell.id,
                voterId: cell.data.voterId,
                commitment: cell.data.commitment,
                timestamp: cell.data.timestamp
            });
            
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
    
    const metadataCell = blockchainStorage.cells.find(c => c.id === event.metadataCellId);
    const resultCell = blockchainStorage.cells.find(c => c.id === event.resultCellId);
    
    return {
        ...event,
        metadata: metadataCell?.data,
        results: resultCell?.data
    };
}

function getEventsByOrganizer(organizerId) {
    return blockchainStorage.events
        .filter(e => e.organizerId === organizerId)
        .map(event => {
            const metadataCell = blockchainStorage.cells.find(c => c.id === event.metadataCellId);
            return {
                ...event,
                metadata: metadataCell?.data
            };
        });
}

function verifyBallotInclusion(eventId, commitment) {
    const event = blockchainStorage.events.find(e => e.eventId === eventId);
    if (!event) return { verified: false, error: 'Event not found' };
    
    const voterCell = blockchainStorage.cells.find(
        c => c.type === CELL_TYPES.VOTER && 
             c.data.eventId === eventId && 
             c.data.commitment === commitment
    );
    
    if (!voterCell) {
        return { verified: false, error: 'Ballot not found' };
    }
    
    return {
        verified: true,
        cellId: voterCell.id,
        timestamp: voterCell.data.timestamp,
        sequence: voterCell.data.sequence
    };
}

function getLiveStatistics(eventId) {
    const event = blockchainStorage.events.find(e => e.eventId === eventId);
    if (!event) return null;
    
    const metadataCell = blockchainStorage.cells.find(c => c.id === event.metadataCellId);
    const voterCells = blockchainStorage.cells.filter(
        c => c.type === CELL_TYPES.VOTER && c.data.eventId === eventId
    );
    
    const uniqueVoters = new Set(voterCells.map(c => c.data.voterId));
    
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
        stats.liveTotals = { message: 'Live totals available in real-time mode' };
    }
    
    return stats;
}

// ============================================================================
// COST ESTIMATION
// ============================================================================

function estimateEventCost(eventConfig) {
    const baseMetadataCost = 10;
    const baseResultCost = 5;
    const perVoterCost = 0.5;
    const lockscriptOverhead = 2;
    
    const estimatedVoters = eventConfig.estimatedVoters || 100;
    const votersCost = estimatedVoters * perVoterCost * (eventConfig.allowedUpdates || 1);
    
    const totalCost = baseMetadataCost + baseResultCost + votersCost + lockscriptOverhead;
    
    return {
        baseMetadataCost,
        baseResultCost,
        votersCost,
        lockscriptOverhead,
        totalCost: Math.ceil(totalCost),
        estimatedVoters
    };
}

// ============================================================================
// INVITE MATERIAL GENERATION
// ============================================================================

function generateInviteMaterials(eventConfig, metadataCell) {
    const baseUrl = `${window.location.origin}/web/voter.html?event=${eventConfig.eventId}`;
    
    switch (eventConfig.eligibility.type) {
        case 'public':
            return {
                type: 'public',
                url: baseUrl,
                qrCode: generateQRCodeData(eventConfig.eventId)
            };
            
        case 'invite_key':
            const inviteKey = generateInviteKey();
            return {
                type: 'invite_key',
                url: `${baseUrl}&key=${inviteKey}`,
                inviteKey: inviteKey,
                qrCode: generateQRCodeData(`${eventConfig.eventId}:${inviteKey}`)
            };
            
        case 'per_voter':
            const voterKeys = {};
            (eventConfig.eligibility.voters || []).forEach(voter => {
                const key = generateInviteKey();
                voterKeys[voter.id] = {
                    email: voter.email,
                    key: key,
                    url: `${baseUrl}&key=${key}`
                };
            });
            return {
                type: 'per_voter',
                voterKeys: voterKeys
            };
            
        case 'curated_list':
            return {
                type: 'curated_list',
                url: baseUrl,
                voterList: eventConfig.eligibility.voters
            };
            
        default:
            return {
                type: 'public',
                url: baseUrl
            };
    }
}

function generateQRCodeData(data) {
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="white"/><text x="50" y="50" text-anchor="middle">QR:${data.slice(0, 10)}</text></svg>`;
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
        
        // JoyID integration
        connectJoyID,
        signTransactionWithJoyID,
        
        // Constants
        ELECTION_STATUS,
        CELL_TYPES,
        
        // Configuration
        DEBUG_LOG,
        USE_MAINNET,
        RPC_URL,
        INDEXER_URL
    };
}