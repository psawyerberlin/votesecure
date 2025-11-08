/**
 * VoteSecure Organizer Interface
 * Handles election creation, configuration, and blockchain interactions
 */

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const DEBUG_LOG = true;
const USE_MAINNET = false;

const CELL_TYPES = {
  EVENTFUND: 'eventfund',
  METADATA: 'metadata',
  VOTER: 'voter',
  RESULT: 'result'
};

const ELECTION_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ACTIVE: 'active',
  ENDED: 'ended',
  RESULTS_RELEASED: 'results_released'
};

const CAPACITY_CKB = {
  MIN_CELL: 61,
  METADATA: 1100,  // Increased for large JSON data
  RESULT: 200,
  VOTER: 70,
  EVENTFUND_BASE: 100
};

const MIN_CELL_CAPACITY = CAPACITY_CKB.MIN_CELL * 100000000;

const STORAGE_KEYS = {
  MY_EVENT_IDS: 'votesecure_my_event_ids',
  LAST_SYNC: 'votesecure_last_sync'
};

// ============================================================================
// BLOCKCHAIN STORAGE (In-Memory)
// ============================================================================

const blockchainStorage = {
  events: [],
  cells: []
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let currentStep = 1;
let currentOrganizer = null;
let ckbServiceReady = false;
let electionConfig = {
  eventId: null,
  title: '',
  description: '',
  estimatedVoters: 10,
  questions: [],
  schedule: {},
  eligibility: {},
  anonymityLevel: 'full',
  reportingGranularity: 'totals_only',
  groupingFields: [],
  minGroupSize: 5,
  allowedUpdates: 3,
  liveStatsMode: 'hidden',
  resultReleasePolicy: {}
};
let publishedEvent = null;

// ============================================================================
// LOCAL PERSISTENCE FUNCTIONS - ADD THESE BEFORE setupEventListeners()
// ============================================================================

/**
 * Save event ID to localStorage after publishing
 * @param {string} eventId - The event identifier
 * @param {string} organizerAddress - The organizer's CKB address
 */
function saveEventIdLocally(eventId, organizerAddress) {
  try {
    const storageKey = `${STORAGE_KEYS.MY_EVENT_IDS}_${organizerAddress}`;
    const existingIds = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    if (!existingIds.includes(eventId)) {
      existingIds.push(eventId);
      localStorage.setItem(storageKey, JSON.stringify(existingIds));
      if (DEBUG_LOG) console.log('✓ Saved eventId locally:', eventId);
    }
  } catch (error) {
    console.error('Failed to save eventId locally:', error);
  }
}

function loadEventIdsLocally(organizerAddress) {
  try {
    const storageKey = `${STORAGE_KEYS.MY_EVENT_IDS}_${organizerAddress}`;
    const eventIds = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (DEBUG_LOG) console.log(`Loaded ${eventIds.length} event IDs from localStorage`);
    return eventIds;
  } catch (error) {
    console.error('Failed to load event IDs:', error);
    return [];
  }
}

async function loadMyEventsFromBlockchain(organizerAddress) {
  try {
    if (DEBUG_LOG) console.log('=== Loading Events from Blockchain ===');
    
    const eventIds = loadEventIdsLocally(organizerAddress);
    
    if (eventIds.length === 0) {
      console.log('No elections found in localStorage');
      displayMyElections([]);  // Show empty state
      return [];
    }
    
    const events = [];
    for (const eventId of eventIds) {
      try {
        const event = await window.CKBService.getEvent(eventId);
        if (event) {
          events.push(event);
          console.log(`✓ Loaded: ${event.title}`);
        }
      } catch (error) {
        console.error(`Failed to load event ${eventId}:`, error);
      }
    }
    
    console.log(`=== Loaded ${events.length} elections ===`);
    
    // Display in UI - ADD THIS LINE!
    displayMyElections(events);
    
    return events;
    
  } catch (error) {
    console.error('Failed to load events:', error);
    displayMyElections([]);  // Show empty state on error
    return [];
  }
}

/**
 * Simplified sync: Just refresh from localStorage
 * Blockchain scanning not possible with CCC limitations
 */
async function syncEventsFromBlockchain(organizerAddress) {
  try {
    showNotification('Refreshing elections...', 'info');
    
    if (DEBUG_LOG) console.log('=== Refreshing Elections ===');
    
    // Just reload from localStorage
    await loadMyEventsFromBlockchain(organizerAddress);
    
    showNotification('✓ Elections refreshed', 'success');
    
    if (DEBUG_LOG) console.log('=== Refresh Complete ===');
    
  } catch (error) {
    console.error('Refresh failed:', error);
    showNotification('Refresh failed: ' + error.message, 'error');
  }
}

async function recoverElectionById(eventId) {
  if (!eventId || !eventId.startsWith('evt_')) {
    showNotification('Invalid event ID format', 'error');
    return false;
  }
  
  if (!currentOrganizer || !currentOrganizer.address) {
    showNotification('Please connect wallet first', 'error');
    return false;
  }
  
  try {
    showNotification(`Recovering: ${eventId}...`, 'info');
    
    // Fetch from blockchain
    const event = await window.CKBService.getEvent(eventId);
    
    if (!event) {
      showNotification(`Election not found on blockchain`, 'error');
      return false;
    }
    
    // Save to localStorage
    saveEventIdLocally(eventId, currentOrganizer.address);
    
    showNotification(`✓ Recovered: ${event.title}`, 'success');
    
    // Reload list
    await loadMyEventsFromBlockchain(currentOrganizer.address);
    
    return true;
    
  } catch (error) {
    console.error('Recovery failed:', error);
    showNotification('Recovery failed', 'error');
    return false;
  }
}

/**
 * Show dialog to manually add election
 */
function showRecoverDialog() {
  const eventId = prompt(
    'Enter the Election ID to recover:\n\n' +
    'Format: evt_TIMESTAMP_RANDOM\n' +
    'Example: evt_1762383301693_of7gn0kln'
  );
  
  if (eventId) {
    recoverElectionById(eventId.trim());
  }
}

/**
 * Export election IDs as JSON backup
 */
function exportElectionIds() {
  if (!currentOrganizer) {
    showNotification('Connect wallet first', 'error');
    return;
  }
  
  const storageKey = `votesecure_my_event_ids_${currentOrganizer.address}`;
  const eventIds = JSON.parse(localStorage.getItem(storageKey) || '[]');
  
  const backup = {
    address: currentOrganizer.address,
    exportDate: new Date().toISOString(),
    eventIds: eventIds
  };
  
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `votesecure-elections-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  showNotification('✓ Backup downloaded', 'success');
}

/**
 * Import election IDs from JSON backup
 */
function importElectionIds() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  
  input.onchange = async (e) => {
    try {
      const file = e.target.files[0];
      const text = await file.text();
      const backup = JSON.parse(text);
      
      if (!backup.eventIds || !Array.isArray(backup.eventIds)) {
        showNotification('Invalid backup file', 'error');
        return;
      }
      
      if (!currentOrganizer) {
        showNotification('Connect wallet first', 'error');
        return;
      }
      
      // Import all IDs
      for (const eventId of backup.eventIds) {
        saveEventIdLocally(eventId, currentOrganizer.address);
      }
      
      showNotification(`✓ Imported ${backup.eventIds.length} elections`, 'success');
      
      // Reload
      await loadMyEventsFromBlockchain(currentOrganizer.address);
      
    } catch (error) {
      console.error('Import failed:', error);
      showNotification('Import failed', 'error');
    }
  };
  
  input.click();
}

/**
 * Clear all cached data including JoyID session and localStorage
 */
function clearAllCacheData() {
  if (!confirm('⚠️ Clear ALL cached data?\n\nThis will:\n- Disconnect your wallet\n- Clear all stored election IDs\n- Clear JoyID session cache\n- Reset the application\n\nYou will need to reconnect and re-import elections.\n\nContinue?')) {
    return;
  }

  try {
    // Clear localStorage
    localStorage.clear();
    console.log('✓ localStorage cleared');

    // Clear sessionStorage
    sessionStorage.clear();
    console.log('✓ sessionStorage cleared');

    // Clear IndexedDB (used by JoyID)
    if (window.indexedDB) {
      indexedDB.databases().then(databases => {
        databases.forEach(db => {
          if (db.name) {
            indexedDB.deleteDatabase(db.name);
            console.log(`✓ Cleared IndexedDB: ${db.name}`);
          }
        });
      });
    }

    // Reset current state
    currentOrganizer = null;

    showNotification('✓ All cache cleared! Page will reload in 2 seconds...', 'success');

    // Reload page after 2 seconds
    setTimeout(() => {
      window.location.reload();
    }, 2000);

  } catch (error) {
    console.error('Failed to clear cache:', error);
    showNotification('Failed to clear some cache data. Try clearing browser cache manually.', 'error');
  }
}

/**
 * Display events in the "My Elections" section
 * @param {Array} events - Array of event objects
 */
function displayMyElections(events) {
  const container = document.getElementById('electionsList');
  if (!container) {
    console.error('electionsList container not found');
    return;
  }
  
  if (events.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No elections yet. Create your first election to get started!</p>
        <button onclick="showCreateView()" class="btn btn-primary">Create Election</button>
      </div>
    `;
    return;
  }
  
  // Generate election cards
  container.innerHTML = events.map(event => {
    const statusClass = event.status === 'active' ? 'status-active' : 
                       event.status === 'ended' ? 'status-ended' : 'status-pending';
    
    const createdDate = event.metadata?.createdAt ? 
      new Date(event.metadata.createdAt * 1000).toLocaleDateString() : 'Unknown';
    
    const startDate = event.schedule?.startTime ?
      new Date(event.schedule.startTime * 1000).toLocaleDateString() : 'Not set';
      
    const endDate = event.schedule?.endTime ?
      new Date(event.schedule.endTime * 1000).toLocaleDateString() : 'Not set';
    
    const txHash = event.cells?.metadata?.outPoint?.txHash;
    
    return `
      <div class="election-card">
        <div class="election-header">
          <h3>${event.title || 'Untitled Election'}</h3>
          <span class="status-badge ${statusClass}">${event.status}</span>
        </div>
        <div class="election-details">
          <p class="description">${event.description || 'No description'}</p>
          <div class="election-meta">
            <span><strong>Created:</strong> ${createdDate}</span>
            <span><strong>Start:</strong> ${startDate}</span>
            <span><strong>End:</strong> ${endDate}</span>
          </div>
          <div class="election-meta">
            <span><strong>Event ID:</strong> <code>${event.eventId}</code></span>
            ${txHash ? `<span><strong>TX:</strong> <code>${txHash.slice(0, 10)}...</code></span>` : ''}
          </div>
        </div>
        <div class="election-actions">
          <a href="viewElectionDetails.html?event=${event.eventId}" class="btn btn-secondary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            View Details
          </a>
          <button onclick="copyVoterLink('${event.eventId}')" class="btn btn-secondary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"></path>
            </svg>
            Copy Voter Link
          </button>
          ${txHash ? 
            `<button onclick="viewOnExplorer('${txHash}')" class="btn btn-secondary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="M21 21l-4.35-4.35"></path>
              </svg>
              View on Explorer
            </button>` : ''}
        </div>
      </div>
    `;
  }).join('');
  
  console.log(`✓ Displayed ${events.length} election(s) in UI`);
}
 
 /*
function viewElectionDetails(eventId) {
  const event = getEvent(eventId);
  if (!event) return;
  
  const details = `
Event Details
=============

Title: ${event.metadata.title}
Event ID: ${eventId}
Status: ${event.status}

Description:
${event.metadata.description || 'No description'}

Questions: ${event.metadata.questions.length}
${event.metadata.questions.map((q, i) => `${i + 1}. ${q.text}`).join('\n')}

Schedule:
- Start: ${formatDateTime(event.metadata.schedule.startTime * 1000)}
- End: ${formatDateTime(event.metadata.schedule.endTime * 1000)}
- Results Release: ${formatDateTime(event.metadata.schedule.resultsReleaseTime * 1000)}

Eligibility: ${formatEligibilityType(event.metadata.eligibility.type)}
  `.trim();
  
  console.log(details);
  showNotification('Event details logged to console (F12)', 'info');
}
*/

/**
 * Helper function to copy voter link to clipboard
 */
function copyVoterLink(eventId) {
  const voterUrl = `${window.location.origin}/web/voter.html?event=${eventId}`;
  navigator.clipboard.writeText(voterUrl).then(() => {
    showNotification('Voter link copied to clipboard!', 'success');
  }).catch(err => {
    console.error('Failed to copy:', err);
    showNotification('Failed to copy link', 'error');
  });
}

/**
function formatCapacity(shannons) {
  if (!shannons) return '0';
  const ckb = Number(shannons) / 100000000;
  return ckb.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function getVoterUrl(eventId) {
  return `${window.location.origin}/voter.html?event=${eventId}`;
}

function getExplorerUrl(txHash) {
  return USE_MAINNET
    ? `https://explorer.nervos.org/transaction/${txHash}`
    : `https://testnet.explorer.nervos.org/transaction/${txHash}`;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showNotification('Copied to clipboard!', 'success');
  }).catch(err => {
    console.error('Failed to copy:', err);
    showNotification('Failed to copy', 'error');
  });
}

function copyVoterLinkFromModal(eventId) {
  const url = getVoterUrl(eventId);
  copyToClipboard(url);
}

// Close modal when pressing Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeElectionDetailsModal();
  }
});

function viewOnExplorer(txHash) {
  if (!txHash) return;
  
  const explorerUrl = USE_MAINNET
    ? `https://explorer.nervos.org/transaction/${txHash}`
    : `https://testnet.explorer.nervos.org/transaction/${txHash}`;
  
  window.open(explorerUrl, '_blank');
}
*/
// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  if (DEBUG_LOG) console.log('VoteSecure Organizer initializing...');
  
  waitForCKBService();
  addQuestion();
  setupEventListeners();
  setDefaultDates();
  // checkPreviousConnection is now called from waitForCKBService after service is ready
});

function waitForCKBService() {
  const checkService = () => {
    if (window.CKBService && typeof window.CKBService.connectJoyID === 'function') {
      ckbServiceReady = true;
      if (DEBUG_LOG) console.log('✓ CKB Service ready');
      updateServiceStatus('ready');
      
      // Now check for previous session
      checkPreviousConnection();
    } else {
      if (DEBUG_LOG) console.log('Waiting for CKB Service...');
      updateServiceStatus('loading');
      setTimeout(checkService, 100);
    }
  };
  checkService();
}

function updateServiceStatus(status) {
  const statusEl = document.querySelector('.service-status');
  if (statusEl) {
    statusEl.classList.remove('ready', 'loading', 'error');
    statusEl.classList.add(status);
  }
  
  const btn = document.getElementById('connectWalletBtn');
  if (status === 'ready' && btn) {
    btn.disabled = false;
    btn.title = 'Connect your wallet';
  } else if (status === 'loading' && btn) {
    btn.disabled = true;
    btn.title = 'Loading blockchain services...';
  } else if (status === 'error' && btn) {
    btn.disabled = true;
    btn.title = 'Service unavailable';
  }
}



function setupEventListeners() {
  const connectBtn = document.getElementById('connectWalletBtn');
  if (connectBtn) {
    connectBtn.addEventListener('click', toggleWalletConnection);
  }
  
  const form = document.getElementById('electionForm');
  if (form) {
    form.addEventListener('submit', handlePublish);
  }
  
  document.querySelectorAll('input[name="eligibilityType"]').forEach(radio => {
    radio.addEventListener('change', handleEligibilityChange);
  });
  
  document.querySelectorAll('input[name="reportingGranularity"]').forEach(radio => {
    radio.addEventListener('change', handleReportingChange);
  });
}

function setDefaultDates() {
  const now = new Date();
  const startTime = new Date(now.getTime() + 60 * 60 * 1000);
  const endTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const releaseTime = new Date(endTime.getTime() + 60 * 60 * 1000);
  
  document.getElementById('startTime').value = formatDateTimeLocal(startTime);
  document.getElementById('endTime').value = formatDateTimeLocal(endTime);
  document.getElementById('resultsReleaseTime').value = formatDateTimeLocal(releaseTime);
}

async function checkPreviousConnection() {
  try {
    if (!ckbServiceReady) {
      console.warn('CKB Service not ready yet');
      return false;
    }
    
    const session = await window.CKBService.checkJoyIDSession();
    
    if (session && session.address) {
      if (DEBUG_LOG) console.log('✓ Restored JoyID session');
      
      currentOrganizer = {
        address: session.address,
        balance: session.balance,
        network: session.network
      };
      
      // Update sessionStorage with fresh data
      sessionStorage.setItem('joyid_address', session.address);
      sessionStorage.setItem('joyid_balance', session.balance);
      sessionStorage.setItem('joyid_network', session.network);
      
      // Update UI
      updateWalletUI(true, session);
      
      // **NEW: Load user's events from blockchain**
      await loadMyEventsFromBlockchain(session.address);
      
      return true;
    } else {
      // No active session - clear any stale sessionStorage
      sessionStorage.removeItem('joyid_address');
      sessionStorage.removeItem('joyid_balance');
      sessionStorage.removeItem('joyid_network');
    }
    
    return false;
  } catch (error) {
    console.error('Failed to check previous session:', error);
    sessionStorage.removeItem('joyid_address');
    sessionStorage.removeItem('joyid_balance');
    sessionStorage.removeItem('joyid_network');
    return false;
  }
}

// ============================================================================
// WALLET CONNECTION
// ============================================================================

async function toggleWalletConnection() {
  if (!ckbServiceReady) {
    showNotification('Blockchain service is not ready yet. Please wait...', 'warning');
    return;
  }
  
  if (currentOrganizer) {
    const confirmed = confirm('Are you sure you want to disconnect your wallet?');
    if (confirmed) {
      disconnectWallet();
    }
  } else {
    await connectWallet();
  }
}

async function connectWallet() {
  const btn = document.getElementById('connectWalletBtn');
  if (!btn) {
    console.error('connectWalletBtn element not found!');
    showNotification('UI Error: Connect button not found', 'error');
    return;
  }
  
  const btnText = btn.querySelector('.btn-text');
  const originalHTML = btnText ? btnText.innerHTML : btn.innerHTML;
  
  if (!ckbServiceReady) {
    showNotification('CKB Service not ready. Please refresh the page.', 'error');
    return;
  }
  
  try {
    btn.disabled = true;
    btn.classList.add('loading');
    
    if (btnText) {
      btnText.innerHTML = 'Connecting...';
    } else {
      btn.innerHTML = 'Connecting...';
    }
    
    if (DEBUG_LOG) console.log('Initiating wallet connection...');
    
    const walletInfo = await window.CKBService.connectJoyID();
    
    if (DEBUG_LOG) {
      console.log('Wallet connection successful:', {
        address: formatAddress(walletInfo.address),
        balance: walletInfo.balance,
        network: walletInfo.network
      });
    }
    
    currentOrganizer = {
      address: walletInfo.address,
      balance: walletInfo.balance,
      network: walletInfo.network
    };
    
    sessionStorage.setItem('joyid_address', walletInfo.address);
    sessionStorage.setItem('joyid_balance', walletInfo.balance);
    sessionStorage.setItem('joyid_network', walletInfo.network);
    
    updateWalletUI(true);
    showNotification('Wallet connected successfully!', 'success');
    
    loadMyElections();
    
  } catch (error) {
    console.error('Wallet connection failed:', error);
    
    btn.disabled = false;
    btn.classList.remove('loading');
    
    if (btnText) {
      btnText.innerHTML = originalHTML;
    } else {
      btn.innerHTML = originalHTML;
    }
    
    if (error.message.includes('User rejected') || error.message.includes('cancel')) {
      showNotification('Connection cancelled', 'info');
    } else {
      showNotification(`Connection failed: ${error.message}`, 'error');
    }
  }
}

function disconnectWallet() {
  currentOrganizer = null;
  
  sessionStorage.removeItem('joyid_address');
  sessionStorage.removeItem('joyid_balance');
  sessionStorage.removeItem('joyid_network');
  
  updateWalletUI(false);
  showNotification('Wallet disconnected', 'info');
  
  showCreateView();
}

function updateWalletUI(connected) {
    const btn = document.getElementById('connectWalletBtn');
    const btnText = btn.querySelector('.btn-text');
    const walletInfo = document.getElementById('walletInfo');
    
    if (connected && currentOrganizer) {
        // Show disconnect button with address
        btnText.innerHTML = formatAddress(currentOrganizer.address);
        btn.classList.add('connected');
        btn.classList.remove('loading');
        btn.disabled = false;
        btn.title = 'Click to disconnect';
        
        // Show wallet info
        if (walletInfo) {
            walletInfo.innerHTML = `
                <div class="wallet-details">
                    <span class="wallet-label">Balance:</span>
                    <span class="wallet-balance">${currentOrganizer.balance} CKB</span>
                    <span class="wallet-network">(${currentOrganizer.network})</span>
                </div>
            `;
            walletInfo.classList.add('show');
        }
        
        if (DEBUG_LOG) console.log('Wallet UI updated: connected');
    } else {
        // Show connect button
        btnText.innerHTML = 'Connect JoyID';
        btn.classList.remove('connected', 'loading');
        btn.disabled = !ckbServiceReady;
        btn.title = ckbServiceReady ? 'Connect your JoyID wallet' : 'Service loading...';
        
        if (walletInfo) {
            walletInfo.classList.remove('show');
            walletInfo.innerHTML = '';
        }
        
        if (DEBUG_LOG) console.log('Wallet UI updated: disconnected');
    }
}

async function refreshBalance() {
  if (!currentOrganizer) return;
  
  try {
    const balance = await window.CKBService.getSpendableCapacityShannons(currentOrganizer.address);
    const balanceCKB = window.CKBService.shannons2CKB(balance);
    
    currentOrganizer.balance = balanceCKB;
    sessionStorage.setItem('joyid_balance', balanceCKB);
    
    // Update the wallet info display
    updateWalletUI(true);
    
    if (DEBUG_LOG) {
      console.log('Balance refreshed:', balanceCKB);
    }
  } catch (error) {
    console.error('Failed to refresh balance:', error);
  }
}

// ============================================================================
// CRYPTOGRAPHIC UTILITIES
// ============================================================================

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

async function generateHash(data) {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataBuffer);
  return arrayBufferToHex(hashBuffer);
}

async function generateBallotCommitment(ballot) {
  const commitmentData = JSON.stringify({
    timestamp: ballot.timestamp,
    eventId: ballot.eventId,
    voterId: ballot.voterId,
    answers: ballot.answers
  });
  return await generateHash(commitmentData);
}

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

function generateEventId() {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateInviteKey() {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  return arrayBufferToHex(array.buffer);
}

function toHex(str) {
  if (!str) return '0x';
  if (str.startsWith('0x')) return str;
  return '0x' + str;
}

// ============================================================================
// FORM HANDLING
// ============================================================================

function nextStep() {
  if (!validateCurrentStep()) {
    return;
  }
  
  const totalSteps = 6;
  if (currentStep < totalSteps) {
    // Hide current step
    const currentStepEl = document.querySelector(`.form-step[data-step="${currentStep}"]`);
    if (currentStepEl) {
      currentStepEl.classList.remove('active');
    }
    
    // Show next step
    currentStep++;
    const nextStepEl = document.querySelector(`.form-step[data-step="${currentStep}"]`);
    if (nextStepEl) {
      nextStepEl.classList.add('active');
    }
    
    updateStepDisplay();
    saveStepData();
  }
}

function previousStep() {
  if (currentStep > 1) {
    // Hide current step
    const currentStepEl = document.querySelector(`.form-step[data-step="${currentStep}"]`);
    if (currentStepEl) {
      currentStepEl.classList.remove('active');
    }
    
    // Show previous step
    currentStep--;
    const prevStepEl = document.querySelector(`.form-step[data-step="${currentStep}"]`);
    if (prevStepEl) {
      prevStepEl.classList.add('active');
    }
    
    updateStepDisplay();
  }
}

function updateStepDisplay() {
  // Update progress steps indicators
  const steps = document.querySelectorAll('.progress-steps .step');
  steps.forEach((step, index) => {
    const stepNum = index + 1;
    if (stepNum < currentStep) {
      step.classList.add('completed');
      step.classList.remove('active');
    } else if (stepNum === currentStep) {
      step.classList.add('active');
      step.classList.remove('completed');
    } else {
      step.classList.remove('active', 'completed');
    }
  });
  
  // Update button visibility
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const publishBtn = document.getElementById('publishBtn');
  
  if (prevBtn) {
    prevBtn.style.display = currentStep === 1 ? 'none' : 'inline-block';
  }
  
  if (currentStep === 6) {
    // On step 6: hide Next, show Publish
    if (nextBtn) nextBtn.style.display = 'none';
    if (publishBtn) publishBtn.style.display = 'inline-block';
  } else {
    // On steps 1-5: show Next, hide Publish
    if (nextBtn) nextBtn.style.display = 'inline-block';
    if (publishBtn) publishBtn.style.display = 'none';
  }
  
  // Scroll to top of form
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function validateCurrentStep() {
  const currentStepEl = document.querySelector(`.form-step[data-step="${currentStep}"]`);
  if (!currentStepEl) return true;
  
  // Get all required inputs in current step
  const requiredInputs = currentStepEl.querySelectorAll('[required]');
  
  for (const input of requiredInputs) {
    if (!input.value || input.value.trim() === '') {
      input.focus();
      showNotification('Please fill in all required fields', 'warning');
      return false;
    }
  }
  
  // Step-specific validation
  if (currentStep === 2) {
    // Validate questions
    const questions = document.querySelectorAll('.question-card');
    if (questions.length === 0) {
      showNotification('Please add at least one question', 'warning');
      return false;
    }
    
    for (const question of questions) {
      const questionText = question.querySelector('.question-text');
      if (!questionText || !questionText.value.trim()) {
        questionText.focus();
        showNotification('Please fill in all question texts', 'warning');
        return false;
      }
      
      const options = question.querySelectorAll('.option-text');
      if (options.length < 2) {
        showNotification('Each question must have at least 2 options', 'warning');
        return false;
      }
      
      for (const option of options) {
        if (!option.value.trim()) {
          option.focus();
          showNotification('Please fill in all option texts', 'warning');
          return false;
        }
      }
    }
  }
  
  if (currentStep === 3) {
    // Validate schedule
    return validateSchedule();
  }
  
  return true;
}

function validateSchedule() {
  const startTime = new Date(document.getElementById('startTime').value);
  const endTime = new Date(document.getElementById('endTime').value);
  const releaseTime = new Date(document.getElementById('resultsReleaseTime').value);
  const now = new Date();
  
  if (startTime <= now) {
    showNotification('Start time must be in the future', 'warning');
    return false;
  }
  
  if (endTime <= startTime) {
    showNotification('End time must be after start time', 'warning');
    return false;
  }
  
  if (releaseTime <= endTime) {
    showNotification('Results release time must be after end time', 'warning');
    return false;
  }
  
  return true;
}

function saveStepData() {
  switch (currentStep) {
    case 1:
      // Save basic info
      electionConfig.title = document.getElementById('electionTitle').value;
      electionConfig.description = document.getElementById('electionDescription').value;
      electionConfig.estimatedVoters = parseInt(document.getElementById('estimatedVoters').value) || 10;
      break;
      
    case 2:
      // Save questions
      electionConfig.questions = updateQuestionsConfig();
      break;
      
    case 3:
      // Save schedule
      electionConfig.schedule = {
        startTime: Math.floor(new Date(document.getElementById('startTime').value).getTime() / 1000),
        endTime: Math.floor(new Date(document.getElementById('endTime').value).getTime() / 1000),
        resultsReleaseTime: Math.floor(new Date(document.getElementById('resultsReleaseTime').value).getTime() / 1000)
      };
      electionConfig.allowedUpdates = parseInt(document.getElementById('allowedUpdates').value) || 3;
      break;
      
    case 4:
      // Save eligibility
      saveEligibilityConfig();
      break;
      
    case 5:
      // Save privacy settings
      savePrivacyConfig();
      break;
      
    case 6:
      // Generate review
      generateReview();
      break;
  }
  
  if (DEBUG_LOG) {
    console.log('Step data saved:', electionConfig);
  }
}

/**
 * Add new question  (### Remove value="test question"; 
 */
function addQuestion() {
  const container = document.getElementById('questionsContainer');
  const questionCount = container.children.length + 1;
  
  const questionDiv = document.createElement('div');
  questionDiv.className = 'question-card';
  questionDiv.innerHTML = `
    <div class="question-header">
      <h3>Question ${questionCount}</h3>
      ${questionCount > 1 ? '<button type="button" class="remove-btn" onclick="removeQuestion(this)">Remove</button>' : ''}
    </div>
    <div class="form-group">
      <label>Question Text</label>
      <input type="text" class="form-control question-text" required placeholder="Enter your question" value="test question">
    </div>
    <div class="form-group">
      <label>Question Type</label>
      <select class="form-control question-type" onchange="updateQuestionType(this)">
        <option value="single">Single Choice</option>
        <option value="multiple">Multiple Choice</option>
        <option value="ranked">Ranked Choice</option>
      </select>
    </div>
    <div class="form-group">
      <label>Options</label>
      <div class="options-container">
        <div class="option-item">
          <input type="text" class="form-control option-text" required placeholder="Option 1" value="Option Test 1">
          <button type="button" class="remove-btn" onclick="removeOption(this)" disabled>×</button>
        </div>
        <div class="option-item">
          <input type="text" class="form-control option-text" required placeholder="Option 2" value="Option Test 2">
          <button type="button" class="remove-btn" onclick="removeOption(this)">×</button>
        </div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="addOption(this)">+ Add Option</button>
    </div>
  `;
  
  container.appendChild(questionDiv);
}

function removeQuestion(btn) {
  const questionCard = btn.closest('.question-card');
  questionCard.remove();
  
  const questions = document.querySelectorAll('.question-card');
  questions.forEach((q, i) => {
    q.querySelector('h3').textContent = `Question ${i + 1}`;
  });
}

/**
 * Add option to question
 * @param {string} questionId - Question ID
 #### Remove: value="option${optionId}
 */
function addOption(btn) {
  const optionsContainer = btn.previousElementSibling;
  const optionCount = optionsContainer.children.length + 1;
  
  const optionDiv = document.createElement('div');
  optionDiv.className = 'option-item';
  optionDiv.innerHTML = `
    <input type="text" class="form-control option-text" placeholder="Option ${optionCount}" required value="Option Test ${optionCount}" >
    <button type="button" class="remove-btn" onclick="removeOption(this)">×</button>
  `;
  
  optionsContainer.appendChild(optionDiv);
}

function removeOption(btn) {
  const optionsContainer = btn.closest('.options-container');
  if (optionsContainer.children.length > 2) {
    btn.closest('.option-item').remove();
  }
}

function updateQuestionType(select) {
  // Future: Add type-specific options
}

function updateQuestionsConfig() {
  const questions = [];
  
  document.querySelectorAll('.question-card').forEach((card, index) => {
    const questionText = card.querySelector('.question-text');
    const questionType = card.querySelector('.question-type');
    
    if (!questionText || !questionType) return;
    
    const text = questionText.value;
    const type = questionType.value;
    
    const options = [];
    card.querySelectorAll('.option-item').forEach((optionDiv, optIndex) => {
      const optionText = optionDiv.querySelector('.option-text');
      if (optionText && optionText.value.trim()) {
        options.push({
          id: `opt_${index}_${optIndex}`,
          text: optionText.value
        });
      }
    });
    
    if (text.trim() && options.length >= 2) {
      questions.push({
        id: `q_${index}`,
        text: text,
        type: type,
        options: options
      });
    }
  });
  
  return questions;
}

function handleEligibilityChange(e) {
  const type = e.target.value;
  const voterListContainer = document.getElementById('voterListContainer');
  
  if (voterListContainer) {
    voterListContainer.style.display = 
      (type === 'per_voter' || type === 'curated_list') ? 'block' : 'none';
  }
}

function saveEligibilityConfig() {
  const typeInput = document.querySelector('input[name="eligibilityType"]:checked');
  if (!typeInput) return;
  
  const type = typeInput.value;
  
  electionConfig.eligibility = {
    type: type,
    enableCaptcha: document.getElementById('enableCaptcha')?.checked || false,
    enableRateLimit: document.getElementById('enableRateLimit')?.checked || false
  };
  
  if (type === 'per_voter' || type === 'curated_list') {
    const voterListEl = document.getElementById('voterList');
    if (voterListEl) {
      const voterListText = voterListEl.value;
      const voters = voterListText
        .split('\n')
        .map((email, idx) => email.trim())
        .filter(email => email.length > 0)
        .map((email, idx) => ({
          id: `voter_${idx}`,
          email: email
        }));
      
      electionConfig.eligibility.voters = voters;
    }
  }
}

function handleReportingChange(e) {
  const value = e.target.value;
  const groupingContainer = document.getElementById('groupingContainer');
  
  if (groupingContainer) {
    groupingContainer.style.display = value === 'by_group' ? 'block' : 'none';
  }
}

function savePrivacyConfig() {
  const anonymityInput = document.querySelector('input[name="anonymityLevel"]:checked');
  const reportingInput = document.querySelector('input[name="reportingGranularity"]:checked');
  const liveStatsInput = document.querySelector('input[name="liveStatsMode"]:checked');
  const resultPolicyInput = document.querySelector('input[name="resultPolicy"]:checked');
  
  if (anonymityInput) {
    electionConfig.anonymityLevel = anonymityInput.value;
  }
  
  if (reportingInput) {
    electionConfig.reportingGranularity = reportingInput.value;
  }
  
  if (liveStatsInput) {
    electionConfig.liveStatsMode = liveStatsInput.value;
  }
  
  if (resultPolicyInput) {
    electionConfig.resultReleasePolicy = {
      type: resultPolicyInput.value
    };
  }
  
  if (electionConfig.reportingGranularity === 'by_group') {
    const fieldsEl = document.getElementById('groupingFields');
    const minSizeEl = document.getElementById('minGroupSize');
    
    if (fieldsEl) {
      const fieldsText = fieldsEl.value;
      electionConfig.groupingFields = fieldsText
        .split(',')
        .map(f => f.trim())
        .filter(f => f.length > 0);
    }
    
    if (minSizeEl) {
      electionConfig.minGroupSize = parseInt(minSizeEl.value) || 5;
    }
  }
}

function generateReview() {
  // Update questions config one more time
  electionConfig.questions = updateQuestionsConfig();
  //saveStepData(); #### Removed to prevent the infinite loop.
  
  const summary = document.getElementById('reviewSummary');
  if (!summary) return;
  
  summary.innerHTML = `
    <div class="review-item">
      <strong>Title:</strong>
      <p>${escapeHtml(electionConfig.title)}</p>
    </div>
    
    <div class="review-item">
      <strong>Description:</strong>
      <p>${escapeHtml(electionConfig.description || 'No description')}</p>
    </div>
    
    <div class="review-item">
      <strong>Questions:</strong>
      <p>${electionConfig.questions.length} question(s)</p>
      <ol class="review-questions">
        ${electionConfig.questions.map((q) => `
          <li>
            <div class="q-header">
              ${escapeHtml(q.text)} <em>(${q.type === 'single' ? 'Single' : q.type === 'multiple' ? 'Multiple' : 'Ranked'} choice)</em>
            </div>
            <ul class="option-list">
              ${q.options.map((opt, j) => `<li>${String.fromCharCode(65 + j)}. ${escapeHtml(opt.text)}</li>`).join('')}
            </ul>
          </li>
        `).join('')}
      </ol>
    </div>
    
    <div class="review-item">
      <strong>Schedule:</strong>
      <ul>
        <li>Start: ${formatDateTime(electionConfig.schedule.startTime * 1000)}</li>
        <li>End: ${formatDateTime(electionConfig.schedule.endTime * 1000)}</li>
        <li>Results Release: ${formatDateTime(electionConfig.schedule.resultsReleaseTime * 1000)}</li>
        <li>Allowed Ballot Updates: ${electionConfig.allowedUpdates}</li>
      </ul>
    </div>
    
    <div class="review-item">
      <strong>Eligibility:</strong>
      <p>${formatEligibilityType(electionConfig.eligibility.type)}</p>
      ${electionConfig.eligibility.voters ? `<p>${electionConfig.eligibility.voters.length} voters in list</p>` : ''}
    </div>
    
    <div class="review-item">
      <strong>Privacy:</strong>
      <ul>
        <li>Anonymity: ${electionConfig.anonymityLevel}</li>
        <li>Reporting: ${electionConfig.reportingGranularity}</li>
        <li>Live Stats: ${electionConfig.liveStatsMode}</li>
      </ul>
    </div>
  `;
  
  // Generate cost estimate
  const costEstimate = estimateEventCost(electionConfig);
  const costBreakdown = document.getElementById('costBreakdown');
  
  if (costBreakdown) {
    costBreakdown.innerHTML = `
      <div class="cost-table">
        <div class="cost-row">
          <span>Metadata Cell:</span>
          <span>${costEstimate.baseMetadataCost} CKB</span>
        </div>
        <div class="cost-row">
          <span>Result Cell:</span>
          <span>${costEstimate.baseResultCost} CKB</span>
        </div>
        <div class="cost-row">
          <span>Voter Cells (${costEstimate.estimatedVoters} voters × ${costEstimate.allowedUpdates} updates):</span>
          <span>${costEstimate.votersCost} CKB</span>
        </div>
        <div class="cost-row">
          <span>EventFund Base:</span>
          <span>${costEstimate.eventFundBase} CKB</span>
        </div>
        <div class="cost-row total">
          <span><strong>Total Estimated Cost:</strong></span>
          <span><strong>${costEstimate.totalCost} CKB</strong></span>
        </div>
      </div>
      <p class="cost-note">Unused funds will be returned to your wallet after the election ends.</p>
    `;
  }
}


function handleEligibilityChange(e) {
  const type = e.target.value;
  
  document.querySelectorAll('.eligibility-option').forEach(opt => {
    opt.classList.add('hidden');
  });
  
  if (type === 'invite_key') {
    document.getElementById('inviteKeyOptions').classList.remove('hidden');
  } else if (type === 'per_voter') {
    document.getElementById('perVoterOptions').classList.remove('hidden');
  } else if (type === 'curated_list') {
    document.getElementById('curatedListOptions').classList.remove('hidden');
  }
}

function handleReportingChange(e) {
  const granularity = e.target.value;
  
  if (granularity === 'grouped') {
    document.getElementById('groupingOptions').classList.remove('hidden');
  } else {
    document.getElementById('groupingOptions').classList.add('hidden');
  }
}

// ============================================================================
// PUBLISH ELECTION
// ============================================================================

async function handlePublish(e) {
  e.preventDefault();
  
  if (!currentOrganizer) {
    showNotification('Please connect your wallet first', 'error');
    return;
  }
  
  try {
    const config = collectFormData();
    
    const costEstimate = estimateEventCost(config);
    
    const confirmed = confirm(
      `Publishing this election will cost approximately ${costEstimate.totalCost} CKB.\n\n` +
      `Breakdown:\n` +
      `- Metadata: ${costEstimate.baseMetadataCost} CKB\n` +
      `- Result: ${costEstimate.baseResultCost} CKB\n` +
      `- Voters (${config.estimatedVoters}): ${costEstimate.votersCost} CKB\n` +
      `- EventFund: ${costEstimate.eventFundBase} CKB\n\n` +
      `Continue?`
    );
    
    if (!confirmed) return;
    
    showNotification('Publishing election to blockchain...', 'info');
    
    const result = await publishEvent(config, currentOrganizer.address);
    
    if (result.success) {
      publishedEvent = result;
      
      showNotification('Election published successfully!', 'success');
      
      showSuccessModal(result);
      
      await refreshBalance();
      
      loadMyElections();
    } else {
      showNotification(result.message || 'Failed to publish election', 'error');
    }
    
  } catch (error) {
    console.error('Publish failed:', error);
    showNotification(`Failed to publish: ${error.message}`, 'error');
  }
}

function collectFormData() {
  const config = {
    eventId: generateEventId(),
    title: document.getElementById('electionTitle').value,
    description: document.getElementById('electionDescription').value,
    estimatedVoters: parseInt(document.getElementById('estimatedVoters').value) || 10,
    allowedUpdates: parseInt(document.getElementById('allowedUpdates').value),
    questions: [],
    schedule: {
      startTime: Math.floor(new Date(document.getElementById('startTime').value).getTime() / 1000),
      endTime: Math.floor(new Date(document.getElementById('endTime').value).getTime() / 1000),
      resultsReleaseTime: Math.floor(new Date(document.getElementById('resultsReleaseTime').value).getTime() / 1000)
    },
    eligibility: {
      type: document.querySelector('input[name="eligibilityType"]:checked').value
    },
    anonymityLevel: document.querySelector('input[name="anonymityLevel"]:checked').value,
    reportingGranularity: document.querySelector('input[name="reportingGranularity"]:checked').value,
    liveStatsMode: document.querySelector('input[name="liveStatsMode"]:checked').value,
    minGroupSize: parseInt(document.getElementById('minGroupSize').value) || 5,
    groupingFields: [],
    resultReleasePolicy: {
      automatic: document.getElementById('autoRelease')?.checked || false,
      requiresThreshold: document.getElementById('thresholdRelease')?.checked || false,
      threshold: parseInt(document.getElementById('releaseThreshold')?.value) || 0
    }
  };
  
  const questionCards = document.querySelectorAll('.question-card');
  questionCards.forEach((card, i) => {
    const questionText = card.querySelector('.question-text').value;
    const questionType = card.querySelector('.question-type').value;
    const options = [];
    
    card.querySelectorAll('.option-text').forEach(opt => {
      if (opt.value.trim()) {
        options.push({ text: opt.value.trim() });
      }
    });
    
    config.questions.push({
      id: `q${i + 1}`,
      text: questionText,
      type: questionType,
      options: options
    });
  });
  
  return config;
}

// ============================================================================
// BLOCKCHAIN OPERATIONS
// ============================================================================

async function publishEvent(eventConfig, organizerAddress) {
  try {
    if (DEBUG_LOG) {
      console.log('Publishing event:', eventConfig.eventId);
      console.log('EventId as hex:', stringToHex(eventConfig.eventId));
    }
    
    const keyPair = await generateKeyPair();
    
    const metadataData = {
      title: eventConfig.title,
      description: eventConfig.description,
      questions: eventConfig.questions,
      schedule: eventConfig.schedule,
      eligibility: eventConfig.eligibility,
      anonymityLevel: eventConfig.anonymityLevel,
      reportingGranularity: eventConfig.reportingGranularity,
      groupingFields: eventConfig.groupingFields,
      minGroupSize: eventConfig.minGroupSize,
      liveStatsMode: eventConfig.liveStatsMode,
      resultReleasePolicy: eventConfig.resultReleasePolicy,
      publicKey: keyPair.publicKey,
      createdAt: Math.floor(Date.now() / 1000)
    };
    
    const resultData = {
      eventId: eventConfig.eventId,
      results: null,
      releasedAt: null,
      releaseSignatures: []
    };
    
    const totalVoterCapacity = eventConfig.estimatedVoters * CAPACITY_CKB.VOTER * 100000000;
    const eventFundData = {
      eventId: eventConfig.eventId,
      initialFunds: totalVoterCapacity,
      remainingFunds: totalVoterCapacity,
      allowedUpdates: eventConfig.allowedUpdates,
      createdAt: Math.floor(Date.now() / 1000)
    };
    
    const lockscriptConfig = window.CKBService.getLockscriptConfig();
    
    // Debug: Log args construction step by step
    if (DEBUG_LOG) {
      console.log('=== ARGS CONSTRUCTION DEBUG ===');
      console.log('EventId (original):', eventConfig.eventId);
      
      const eventIdHex = stringToHex(eventConfig.eventId);
      console.log('EventId (hex, no prefix):', eventIdHex);
      console.log('EventId hex length:', eventIdHex.length);
      console.log('EventId hex starts with 0x?', eventIdHex.startsWith('0x'));
      
      const paddedHex = eventIdHex.padStart(64, '0');
      console.log('EventId (padded to 64 for 32 bytes):', paddedHex);
      console.log('Padded length:', paddedHex.length);
      
      const metadataArgs = '0x01' + paddedHex;
      console.log('METADATA args (final):', metadataArgs);
      console.log('Args length:', metadataArgs.length);
      console.log('Valid hex format?', /^0x[0-9a-f]+$/i.test(metadataArgs));
      console.log('==============================');
    }
    
    // Calculate metadata capacity based on actual data size
    const metadataEncodedData = window.CKBService.encodeMetadataData(metadataData);
    const metadataDataSize = (metadataEncodedData.length - 2) / 2; // Convert hex string to bytes
    const metadataLockSize = 33 + 32 + 1; // codeHash (32) + hashType (1) + args (33)
    const metadataOccupiedCapacity = (61 + metadataLockSize + metadataDataSize) * 100000000; // in shannons
    const metadataCapacity = Math.max(metadataOccupiedCapacity, CAPACITY_CKB.METADATA * 100000000);

    if (DEBUG_LOG) {
      console.log('=== METADATA CAPACITY CALCULATION ===');
      console.log('Encoded data length (hex):', metadataEncodedData.length);
      console.log('Data size (bytes):', metadataDataSize);
      console.log('Lock size (bytes):', metadataLockSize);
      console.log('Occupied capacity:', metadataOccupiedCapacity / 100000000, 'CKB');
      console.log('Final capacity:', metadataCapacity / 100000000, 'CKB');
      console.log('=====================================');
    }

    const cellOutputs = [
      {
        capacity: metadataCapacity,
        cellOutput: {
          lock: {
            codeHash: lockscriptConfig.codeHash,
            hashType: lockscriptConfig.hashType,
            args: '0x01' + stringToHex(eventConfig.eventId).padStart(64, '0')  // 33 bytes total
          }
        },
        encodedData: metadataEncodedData
      },
      {
        capacity: CAPACITY_CKB.RESULT * 100000000,
        cellOutput: {
          lock: {
            codeHash: lockscriptConfig.codeHash,
            hashType: lockscriptConfig.hashType,
            args: '0x03' + stringToHex(eventConfig.eventId).padStart(64, '0')  // 33 bytes total
          }
        },
        encodedData: window.CKBService.encodeResultData(resultData)
      },
      {
        capacity: (CAPACITY_CKB.EVENTFUND_BASE + (totalVoterCapacity / 100000000)) * 100000000,
        cellOutput: {
          lock: {
            codeHash: lockscriptConfig.codeHash,
            hashType: lockscriptConfig.hashType,
            args: '0x04' + stringToHex(eventConfig.eventId).padStart(64, '0')  // 33 bytes total
          }
        },
        encodedData: window.CKBService.encodeEventFundData(eventFundData)
      }
    ];
    
    if (DEBUG_LOG) {
      console.log('=== CELL OUTPUTS CREATED ===');
      cellOutputs.forEach((cell, i) => {
        console.log(`\nCell ${i}:`);
        console.log('  Capacity:', cell.capacity);
        console.log('  Lock args:', cell.cellOutput.lock.args);
        console.log('  Lock args length:', cell.cellOutput.lock.args.length);
        console.log('  Lock args valid hex?', /^0x[0-9a-f]+$/i.test(cell.cellOutput.lock.args));
        console.log('  Data length:', cell.encodedData?.length || 0);
      });
      console.log('============================\n');
    }
    
    const txHash = await window.CKBService.createCellsWithSignRaw(organizerAddress, cellOutputs);
    
    const metadataCellId = `${txHash}_0`;
    const resultCellId = `${txHash}_1`;
    const eventFundCellId = `${txHash}_2`;
    
    blockchainStorage.events.push({
      eventId: eventConfig.eventId,
      organizerId: organizerAddress,
      metadataCellId: metadataCellId,
      resultCellId: resultCellId,
      eventFundCellId: eventFundCellId,
      status: ELECTION_STATUS.PUBLISHED,
      createdAt: Math.floor(Date.now() / 1000),
      txHash: txHash
    });
    
	saveEventIdLocally(eventConfig.eventId, organizerAddress);
	
    blockchainStorage.cells.push({
      cellId: metadataCellId,
      eventId: eventConfig.eventId,
      cellType: CELL_TYPES.METADATA,
      data: metadataData,
      txHash: txHash,
      outputIndex: 0
    });
    
    blockchainStorage.cells.push({
      cellId: resultCellId,
      eventId: eventConfig.eventId,
      cellType: CELL_TYPES.RESULT,
      data: resultData,
      txHash: txHash,
      outputIndex: 1
    });
    
    blockchainStorage.cells.push({
      cellId: eventFundCellId,
      eventId: eventConfig.eventId,
      cellType: CELL_TYPES.EVENTFUND,
      data: eventFundData,
      txHash: txHash,
      outputIndex: 2
    });
	

	if (DEBUG_LOG) console.log('✓ Event saved locally and published to blockchain');
    
    return {
      success: true,
      eventId: eventConfig.eventId,
      txHash: txHash,
      metadataCellId: metadataCellId,
      resultCellId: resultCellId,
      eventFundCellId: eventFundCellId,
      privateKey: keyPair.privateKey,
      inviteMaterials: generateInviteMaterials(eventConfig)
    };
    
  } catch (error) {
    console.error('Event publication failed:', error);
    return { success: false, error: error.message };
  }
}

function getEvent(eventId) {
  const event = blockchainStorage.events.find(e => e.eventId === eventId);
  if (!event) return null;
  
  const metadataCell = blockchainStorage.cells.find(c => c.cellId === event.metadataCellId);
  const resultCell = blockchainStorage.cells.find(c => c.cellId === event.resultCellId);
  const eventFundCell = blockchainStorage.cells.find(c => c.cellId === event.eventFundCellId);
  
  return {
    eventId: event.eventId,
    organizerId: event.organizerId,
    status: event.status,
    metadata: metadataCell?.data,
    result: resultCell?.data,
    eventFund: eventFundCell?.data,
    txHash: event.txHash,
    createdAt: event.createdAt
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
        description: metadataCell?.data.description,
        status: event.status,
        schedule: metadataCell?.data.schedule,
        createdAt: event.createdAt,
        txHash: event.txHash,
        stats: {
          estimatedVoters: eventFundCell?.data.initialFunds / (CAPACITY_CKB.VOTER * 100000000),
          totalFunds: eventFundCell?.data.initialFunds
        }
      };
    });
}

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

// ============================================================================
// UI - SUCCESS MODAL
// ============================================================================

function showSuccessModal(result) {
  const modal = document.getElementById('successModal');
  const eventIdEl = document.getElementById('publishedEventId');
  const voterUrlEl = document.getElementById('publishedUrl');
  const inviteKeySection = document.getElementById('inviteKeySection');
  const inviteKeyEl = document.getElementById('publishedInviteKey');
  
  if (!modal) {
    console.warn('successModal not found');
    return;
  }
  
  if (eventIdEl) {
    eventIdEl.textContent = result.eventId;
  }
  
  if (voterUrlEl && result.inviteMaterials?.url) {
    voterUrlEl.textContent = result.inviteMaterials.url;
  }
  
  if (result.inviteMaterials?.inviteKey) {
    if (inviteKeyEl) {
      inviteKeyEl.textContent = result.inviteMaterials.inviteKey;
    }
    if (inviteKeySection) {
      inviteKeySection.style.display = 'block';
    }
  } else {
    if (inviteKeySection) {
      inviteKeySection.style.display = 'none';
    }
  }
  
  modal.style.display = 'block';
}

function closeSuccessModal() {
  const modal = document.getElementById('successModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function downloadInviteMaterials() {
  if (!publishedEvent) return;
  
  const materials = {
    eventId: publishedEvent.eventId,
    txHash: publishedEvent.txHash,
    voterUrl: publishedEvent.inviteMaterials?.url,
    inviteKey: publishedEvent.inviteMaterials?.inviteKey,
    privateKey: publishedEvent.privateKey,
    instructions: 'Share the voter URL with participants. Keep the private key secure - it\'s needed to decrypt results.'
  };
  
  const blob = new Blob([JSON.stringify(materials, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `votesecure-${publishedEvent.eventId}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  showNotification('Invite materials downloaded', 'success');
}

// ============================================================================
// UI - MY ELECTIONS
// ============================================================================

async function showMyElections() {
  if (!currentOrganizer) {
    showNotification('Please connect your wallet first', 'error');
    return;
  }

  const createView = document.getElementById('createView');
  const electionsView = document.getElementById('electionsListView');

  if (createView) {
    createView.style.display = 'none';
  }

  if (electionsView) {
    electionsView.style.display = 'block';
  }

  // Show loading indicator
  const container = document.getElementById('electionsList');
  if (container) {
    container.innerHTML = '<div class="loading-message">Loading elections from blockchain...</div>';
  }

  // Automatically refresh from blockchain (this will also display the elections)
  if (DEBUG_LOG) console.log('Auto-refreshing elections from blockchain...');
  await loadMyEventsFromBlockchain(currentOrganizer.address);
}

function showCreateView() {
  const createView = document.getElementById('createView');
  const electionsView = document.getElementById('electionsListView');
  
  if (createView) {
    createView.style.display = 'block';
  }
  
  if (electionsView) {
    electionsView.style.display = 'none';
  }
}

function loadMyElections() {
  if (!currentOrganizer) return;
  
  const elections = getEventsByOrganizer(currentOrganizer.address);
  const container = document.getElementById('electionsList');
  
  if (!container) {
    console.warn('electionsList element not found');
    return;
  }
  
  if (elections.length === 0) {
    container.innerHTML = '<p class="no-elections">No elections found. Create your first election!</p>';
    return;
  }
  
  container.innerHTML = elections.map(election => {
    const status = getElectionStatus(election);
    const statusClass = status.toLowerCase().replace('_', '-');
    
    return `
      <div class="election-card ${statusClass}">
        <div class="election-header">
          <h3>${escapeHtml(election.title)}</h3>
          <span class="status-badge ${statusClass}">${status.replace('_', ' ')}</span>
        </div>
        <div class="election-info">
          <p class="election-description">${escapeHtml(election.description || '')}</p>
          <div class="election-meta">
            <span><strong>Event ID:</strong> ${election.eventId}</span>
            <span><strong>Created:</strong> ${formatDateTime(election.createdAt * 1000)}</span>
            <span><strong>Start:</strong> ${formatDateTime(election.schedule.startTime * 1000)}</span>
            <span><strong>End:</strong> ${formatDateTime(election.schedule.endTime * 1000)}</span>
          </div>
        </div>
        <div class="election-actions">
          <button onclick="viewElectionDetails('${election.eventId}')" class="btn btn-secondary btn-sm">Details</button>
          <button onclick="copyVoterUrl('${election.eventId}')" class="btn btn-secondary btn-sm">Copy URL</button>
          ${status === 'active' ? `<button onclick="viewLiveStats('${election.eventId}')" class="btn btn-secondary btn-sm">Live Stats</button>` : ''}
          ${status === 'ended' ? `<button onclick="releaseResults('${election.eventId}')" class="btn btn-primary btn-sm">Release Results</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function getElectionStatus(election) {
  const now = Math.floor(Date.now() / 1000);
  const schedule = election.schedule;
  
  if (!schedule) return 'draft';
  
  if (now < schedule.startTime) return 'upcoming';
  if (now >= schedule.startTime && now < schedule.endTime) return 'active';
  if (now >= schedule.endTime && now < schedule.resultsReleaseTime) return 'ended';
  return 'results_available';
}

function copyVoterUrl(eventId) {
  const url = `${window.location.origin}/web/voter.html?event=${eventId}`;
  
  navigator.clipboard.writeText(url).then(() => {
    showNotification('Voter URL copied to clipboard!', 'success');
  }).catch(err => {
    console.error('Failed to copy:', err);
    prompt('Copy this URL:', url);
  });
}

function viewLiveStats(eventId) {
  showNotification('Live statistics feature coming soon!', 'info');
}

async function releaseResults(eventId) {
  if (!currentOrganizer) {
    showNotification('Please connect your wallet first', 'error');
    return;
  }
  
  const confirmed = confirm('Are you ready to release the results?');
  if (!confirmed) return;
  
  try {
    console.log('Releasing results for:', eventId);
    showNotification('Results release feature coming soon!', 'info');
    
  } catch (error) {
    console.error('Result release failed:', error);
    showNotification(`Failed to release results: ${error.message}`, 'error');
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatAddress(address) {
  if (!address) return '';
  return address.slice(0, 10) + '...' + address.slice(-8);
}

/**
 * Convert UTF-8 string to hex (without 0x prefix)
 * @param {string} str - String to convert
 * @returns {string} Hex string
 */
function stringToHex(str) {
  if (DEBUG_LOG) {
    console.log('[stringToHex] Input:', str, 'Type:', typeof str);
  }
  
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(str);
  const hexString = Array.from(uint8Array)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  
  if (DEBUG_LOG) {
    console.log('[stringToHex] Output:', hexString);
    console.log('[stringToHex] Output length:', hexString.length);
    console.log('[stringToHex] Starts with 0x?', hexString.startsWith('0x'));
  }
  
  // Safety check: ensure no 0x prefix
  if (hexString.startsWith('0x')) {
    console.error('[stringToHex] ERROR: Output has 0x prefix! Removing it.');
    return hexString.slice(2);
  }
  
  return hexString;
}

function formatDateTimeLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatEligibilityType(type) {
  const types = {
    'public': 'Public (anyone with link)',
    'invite_key': 'Invite Key Required',
    'per_voter': 'Per-Voter Keys',
    'curated_list': 'Curated Voter List'
  };
  return types[type] || type;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function copyToClipboard(elementId) {
  const element = document.getElementById(elementId);
  const text = element.textContent;
  
  navigator.clipboard.writeText(text).then(() => {
    showNotification('Copied to clipboard!', 'success');
  }).catch(err => {
    console.error('Failed to copy:', err);
    showNotification('Failed to copy to clipboard', 'error');
  });
}

function showNotification(message, type = 'info') {
    // Create notification element if it doesn't exist
    let notification = document.getElementById('notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        notification.className = 'notification';
        document.body.appendChild(notification);
    }
    
    notification.textContent = message;
    notification.className = `notification notification-${type} show`;
    
    console.log(`[${type.toUpperCase()}]`, message);
    
    // Auto-hide after 4 seconds
    setTimeout(() => {
        notification.classList.remove('show');
    }, 4000);
}

// ============================================================================
// GLOBAL ERROR HANDLER
// ============================================================================

window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  
  if (!ckbServiceReady && event.error?.message?.includes('CKBService')) {
    showNotification('Blockchain service failed to load. Please refresh the page.', 'error');
    updateServiceStatus('error');
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  
  if (event.reason?.message?.includes('User rejected')) {
    showNotification('Transaction cancelled by user', 'info');
  }
});

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof window !== 'undefined') {
  window.VoteSecureOrganizer = {
    currentOrganizer,
    electionConfig,
    ckbServiceReady,
    refreshBalance,
    connectWallet,
    disconnectWallet,
    showNotification
  };
  
  window.VoteSecureBlockchain = {
    publishEvent,
    getEvent,
    getEventsByOrganizer,
    estimateEventCost,
    generateKeyPair,
    encryptBallot,
    generateHash,
    generateBallotCommitment,
    generateInviteKey,
    generateEventId,
    connectJoyID: () => window.CKBService.connectJoyID(),
    ELECTION_STATUS,
    CELL_TYPES,
    CAPACITY_CKB,
    DEBUG_LOG,
    USE_MAINNET,
    MIN_CELL_CAPACITY,
    getLockscriptConfig: () => window.CKBService.getLockscriptConfig()
  };
  
  Object.assign(window, {
    nextStep,
    previousStep,
    addQuestion,
    removeQuestion,
    addOption,
    removeOption,
    updateQuestionType,
    showMyElections,
    showCreateView,
    copyVoterUrl,
    viewLiveStats,
    releaseResults,
    closeSuccessModal,
    downloadInviteMaterials,
    copyToClipboard
  });
  
  if (DEBUG_LOG) {
    console.log('VoteSecure Organizer loaded successfully');
    console.log('Debug interface available at: window.VoteSecureOrganizer');
  }
}
// ============================================================================
// ADDITIONAL BLOCKCHAIN FUNCTIONS (from blockchain_OLD.js)
// ============================================================================

/**
 * Verify ballot inclusion in blockchain
 */
async function verifyBallotInclusion(eventId, receiptCommitment) {
  const voterCells = await window.CKBService.queryVoterCells(eventId);
  
  for (const cell of voterCells) {
    try {
      const cellDataStr = hexToString(cell.outputData || cell.data);
      const cellData = JSON.parse(cellDataStr);
      if (cellData.commitment === receiptCommitment) {
        return {
          included: true,
          txHash: cell.outPoint.txHash || cell.outPoint.tx_hash,
          timestamp: cellData.timestamp
        };
      }
    } catch (e) {
      continue;
    }
  }
  
  return { included: false };
}

/**
 * Get live voting statistics
 */
async function getLiveStatistics(eventId) {
  const event = getEvent(eventId);
  if (!event) return null;
  
  const voterCells = await window.CKBService.queryVoterCells(eventId);
  
  return {
    eventId: eventId,
    totalVotes: voterCells.length,
    estimatedVoters: event.eventFund ? event.eventFund.initialFunds / (CAPACITY_CKB.VOTER * 100000000) : 0,
    participationRate: event.eventFund ? voterCells.length / (event.eventFund.initialFunds / (CAPACITY_CKB.VOTER * 100000000)) : 0,
    lastVoteTime: voterCells.length > 0 ? Math.max(...voterCells.map(c => c.timestamp || 0)) : null
  };
}

/**
 * Compute election results
 */
async function computeResults(eventId) {
  const event = getEvent(eventId);
  if (!event) throw new Error('Event not found');
  
  const voterCells = await window.CKBService.queryVoterCells(eventId);
  const results = {
    eventId: eventId,
    totalVotes: voterCells.length,
    questions: []
  };
  
  // Process each question
  for (let qIndex = 0; qIndex < event.metadata.questions.length; qIndex++) {
    const question = event.metadata.questions[qIndex];
    const answers = {};
    
    // Count votes
    for (const cell of voterCells) {
      try {
        const cellDataStr = hexToString(cell.outputData || cell.data);
        const ballot = JSON.parse(cellDataStr);
        const answer = ballot.answers[qIndex];
        
        if (Array.isArray(answer)) {
          answer.forEach(a => {
            answers[a] = (answers[a] || 0) + 1;
          });
        } else {
          answers[answer] = (answers[answer] || 0) + 1;
        }
      } catch (e) {
        continue;
      }
    }
    
    results.questions.push({
      questionIndex: qIndex,
      question: question.text,
      answers: answers
    });
  }
  
  return results;
}

/**
 * Apply k-anonymity to results
 */
function applyKAnonymity(results, k) {
  const anonymized = JSON.parse(JSON.stringify(results));
  
  anonymized.questions.forEach(q => {
    Object.keys(q.answers).forEach(answer => {
      if (q.answers[answer] < k) {
        delete q.answers[answer];
      }
    });
  });
  
  return anonymized;
}

/**
 * Extract grouping key for anonymization
 */
function extractGroupKey(voter, fields) {
  return fields.map(f => voter[f] || '').join('|');
}

/**
 * Generate mock answers for testing
 */
function generateMockAnswers(questions) {
  return questions.map(q => {
    if (q.type === 'single') {
      return Math.floor(Math.random() * q.options.length);
    } else {
      const count = Math.floor(Math.random() * q.options.length) + 1;
      const answers = [];
      while (answers.length < count) {
        const idx = Math.floor(Math.random() * q.options.length);
        if (!answers.includes(idx)) answers.push(idx);
      }
      return answers;
    }
  });
}

/**
 * Withdraw unused event funds
 */
async function withdrawEventFunds(organizerAddress, eventId) {
  if (!currentOrganizer || currentOrganizer.address !== organizerAddress) {
    throw new Error('Only organizer can withdraw funds');
  }
  
  const event = getEvent(eventId);
  if (!event) throw new Error('Event not found');
  
  const now = Math.floor(Date.now() / 1000);
  if (now < event.metadata.schedule.endTime) {
    throw new Error('Cannot withdraw funds before event ends');
  }
  
  const remainingFunds = event.eventFund.remainingFunds;
  
  showNotification(`Withdrawal of ${remainingFunds / 100000000} CKB initiated`, 'info');
  
  return { success: true, amount: remainingFunds };
}

/**
 * Submit ballot (for testing/simulation)
 */
async function submitBallot(voterAddress, eventId, ballot) {
  const event = getEvent(eventId);
  if (!event) throw new Error('Event not found');
  
  const encryptedBallot = await encryptBallot(ballot, event.metadata.publicKey);
  const commitment = await generateBallotCommitment(ballot);
  
  const voterData = {
    eventId: eventId,
    voterId: voterAddress,
    encryptedBallot: encryptedBallot,
    commitment: commitment,
    timestamp: Math.floor(Date.now() / 1000)
  };
  
  console.log('Ballot submitted:', commitment);
  
  return {
    success: true,
    receiptCommitment: commitment,
    timestamp: voterData.timestamp
  };
}

/**
 * Verify transaction (check status)
 */
async function verifyTransaction(txHash) {
  const status = await window.CKBService.getTransactionStatus(txHash);
  return status;
}

/**
 * Create cells on chain (wrapper)
 */
async function createCellsOnChain(organizerAddress, cells) {
  return await window.CKBService.createCellsWithSignRaw(organizerAddress, cells);
}

/**
 * Helper: hex to string
 */
function hexToString(hex) {
  if (!hex || hex === '0x') return '';
  const bytes = [];
  for (let i = 2; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// stringToHex is defined earlier in the file (around line 1667)
// DO NOT add another stringToHex here - it would overwrite the correct one!