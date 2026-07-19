/**
 * VoteSecure Voter Interface
 * Handles voter authentication, ballot submission, and verification
 * Aligned with VoteSecure White Paper v0.9
 * Uses same wallet connection pattern as organizer.js
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let currentEvent = null;
let currentVoter = null;
let currentReceipt = null;
let blockchainReady = false;
let ckbServiceReady = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('VoteSecure Voter Interface initializing...');
    
    // Wait for CKB Service to be ready
    waitForBlockchainAPI();
    waitForCKBService();
    
    // Setup event listeners early so wallet button works
    setupEventListeners();
    
    // Check if wallet was previously connected
    checkPreviousConnection();
    
    // Parse URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    
    if (eventId) {
        // Event ID in URL, load election directly
        loadElection(eventId);
    } else {
        // No event ID, show input form
        showElectionIdInput();
    }
});

/**
 * Wait for CKB Service to be available
 */
function waitForCKBService() {
    const checkService = () => {
        if (window.CKBService && typeof window.CKBService.connectJoyID === 'function') {
            ckbServiceReady = true;
            console.log('✓ CKB Service ready');
            updateServiceStatus('ready');
            
            // Auto-reconnect if session exists
            const savedAddress = sessionStorage.getItem('joyid_address');
            if (savedAddress) {
                console.log('Found previous session, attempting reconnect...');
            }
        } else {
            console.log('Waiting for CKB Service...');
            updateServiceStatus('loading');
            setTimeout(checkService, 100);
        }
    };
    
    checkService();
}

/**
 * Wait for Blockchain API to be available
 */
function waitForBlockchainAPI() {
    const check = () => {
        if (window?.VoteSecureBlockchain?.connectJoyID) {
            ckbServiceReady = true;
            console.log('✓ Blockchain API ready');
            updateServiceStatus('ready');
        } else {
            console.log('Waiting for Blockchain API...');
            updateServiceStatus('loading');
            setTimeout(check, 100);
        }
    };
    check();
}

/**
 * Show election ID input form
 */
function showElectionIdInput() {
    const loadingState = document.getElementById('loadingState');
    const electionIdInput = document.getElementById('electionIdInput');
    
    if (loadingState) {
        loadingState.style.display = 'none';
    }
    
    if (electionIdInput) {
        electionIdInput.style.display = 'block';
    }
}

/**
 * Handle election ID submission
 */
async function submitElectionId() {
    const inputElement = document.getElementById('electionIdInputField');
    const eventId = inputElement ? inputElement.value.trim() : '';
    
    if (!eventId) {
        showError('Please enter an election ID.');
        return;
    }
    
    const electionIdInput = document.getElementById('electionIdInput');
    if (electionIdInput) {
        electionIdInput.style.display = 'none';
    }
    
    await loadElection(eventId);
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Wallet connection toggle
    const connectWalletBtn = document.getElementById('connectWalletBtn');
    if (connectWalletBtn) {
        connectWalletBtn.addEventListener('click', toggleWalletConnection);
    }
    
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) {
        connectBtn.addEventListener('click', connectWallet);
    }
    
    // Election ID input form
    const electionIdForm = document.getElementById('electionIdForm');
    if (electionIdForm) {
        electionIdForm.addEventListener('submit', (e) => {
            e.preventDefault();
            submitElectionId();
        });
    }
    
    // Voting form submission
    const votingForm = document.getElementById('votingForm');
    if (votingForm) {
        votingForm.addEventListener('submit', handleBallotSubmission);
    }
    
    // Verification form
    const verificationForm = document.getElementById('verificationForm');
    if (verificationForm) {
        verificationForm.addEventListener('submit', handleVerification);
    }
}

/**
 * Update service status indicator (matches organizer.js pattern)
 */
function updateServiceStatus(status) {
    const statusEl = document.querySelector('.service-status');
    if (statusEl) {
        statusEl.classList.remove('ready', 'loading', 'error');
        statusEl.classList.add(status);
    }
    
    const btn = document.getElementById('connectWalletBtn');
    if (status === 'ready' && btn) {
        btn.disabled = false;
        btn.title = 'Connect your JoyID wallet';
    } else if (status === 'loading' && btn) {
        btn.disabled = true;
        btn.title = 'Loading blockchain services...';
    } else if (status === 'error' && btn) {
        btn.disabled = true;
        btn.title = 'Service unavailable';
    }
}

// ============================================================================
// WALLET CONNECTION (JoyID via CKB Service Bridge)
// ============================================================================

/**
 * Toggle wallet connection (connect/disconnect)
 */
async function toggleWalletConnection() {
    if (!ckbServiceReady) {
        showError('Blockchain service is not ready yet. Please wait...');
        return;
    }
    
    if (currentVoter) {
        // Show disconnect confirmation
        const confirmed = confirm('Are you sure you want to disconnect your wallet?');
        if (confirmed) {
            disconnectWallet();
        }
    } else {
        // Connect
        await connectWallet();
    }
}

/**
 * Connect JoyID wallet via CKB Service Bridge
 */
async function connectWallet() {
    const btn = document.getElementById('connectWalletBtn');
    const btnText = btn ? btn.querySelector('.btn-text') : null;
    const originalHTML = btnText ? btnText.innerHTML : '';
    
    if (!ckbServiceReady) {
        showError('CKB Service not ready. Please refresh the page.');
        return;
    }
    
    try {
        // Show loading state
        if (btn) {
            btn.disabled = true;
            btn.classList.add('loading');
        }
        if (btnText) {
            btnText.innerHTML = 'Connecting...';
        }
        
        console.log('Initiating JoyID connection...');
        
        // Connect via VoteSecureBlockchain (delegates to CKB Service Bridge)
        const walletInfo = await window.VoteSecureBlockchain.connectJoyID();
        
        console.log('JoyID connection successful:', {
            address: truncateAddress(walletInfo.address),
            balance: walletInfo.balance,
            network: walletInfo.network
        });
        
        currentVoter = walletInfo.address;
        
        // Save to session storage
        sessionStorage.setItem('joyid_address', walletInfo.address);
        sessionStorage.setItem('joyid_balance', walletInfo.balance);
        sessionStorage.setItem('joyid_network', walletInfo.network);
        
        // Update UI - this adds 'connected' class and changes button color
        updateWalletUI(true);
        
        console.log('✓ Wallet connected successfully');
        
        // Hide wallet connection prompt, show voting interface
        const walletRequired = document.getElementById('walletRequired');
        const votingInterface = document.getElementById('votingInterface');
        
        if (walletRequired) walletRequired.style.display = 'none';
        if (votingInterface) votingInterface.style.display = 'block';
        
    } catch (error) {
        console.error('Wallet connection failed:', error);
        updateServiceStatus('error');
        
        // Reset button state
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('loading');
        }
        if (btnText) {
            btnText.innerHTML = originalHTML;
        }
        
        // Determine error message
        let errorMsg = 'Failed to connect wallet';
        if (error.message) {
            if (error.message.includes('User rejected')) {
                errorMsg = 'Connection cancelled by user';
            } else if (error.message.includes('network')) {
                errorMsg = 'Network connection error. Please check your internet.';
            } else {
                errorMsg = `Connection failed: ${error.message}`;
            }
        }
        
        showError(errorMsg);
    }
}

/**
 * Disconnect wallet
 */
function disconnectWallet() {
    console.log('Disconnecting wallet:', truncateAddress(currentVoter));
    
    currentVoter = null;
    
    // Clear session storage
    sessionStorage.removeItem('joyid_address');
    sessionStorage.removeItem('joyid_balance');
    sessionStorage.removeItem('joyid_network');
    
    // Update UI
    updateWalletUI(false);
    
    showError('Wallet disconnected');
}

/**
 * Update wallet UI based on connection state
 */
function updateWalletUI(connected) {
    const btn = document.getElementById('connectWalletBtn');
    const btnText = btn ? btn.querySelector('.btn-text') : null;
    const walletInfo = document.getElementById('walletInfo');
    
    if (connected && currentVoter) {
        // Show disconnect button with address
        if (btnText) {
            btnText.innerHTML = truncateAddress(currentVoter);
        }
        if (btn) {
            btn.classList.add('connected');
            btn.classList.remove('loading');
            btn.disabled = false;
            btn.title = 'Click to disconnect';
        }
        
        // Show wallet network info
        if (walletInfo) {
            const network = sessionStorage.getItem('joyid_network') || 'unknown';
            walletInfo.innerHTML = `
                <div class="wallet-details">
                    <span class="wallet-network">${network.toUpperCase()}</span>
                </div>
            `;
            walletInfo.classList.add('show');
        }
        
        console.log('Wallet UI updated: connected');
    } else {
        // Show connect button
        if (btnText) {
            btnText.innerHTML = 'Connect JoyID';
        }
        if (btn) {
            btn.classList.remove('connected', 'loading');
            btn.disabled = !ckbServiceReady;
            btn.title = ckbServiceReady ? 'Connect your JoyID wallet' : 'Service loading...';
        }
        
        // Hide wallet info
        if (walletInfo) {
            walletInfo.classList.remove('show');
            walletInfo.innerHTML = '';
        }
        
        console.log('Wallet UI updated: disconnected');
    }
}

/**
 * Truncate address for display
 */
function truncateAddress(address) {
    if (!address) return '';
    return address.substring(0, 6) + '...' + address.substring(address.length - 4);
}

// ============================================================================
// ELECTION DATA LOADING
// ============================================================================

/**
 * Load election data from blockchain
 */
async function loadElection(eventId) {
    try {
        document.getElementById('loadingState').style.display = 'block';
        document.getElementById('votingInterface').style.display = 'none';
        document.getElementById('walletRequired').style.display = 'none';
        document.getElementById('electionIdInput').style.display = 'none';
        
        // Use service to fetch election
        const service = window.CKBService || window.VoteSecureBlockchain;
        
        if (!service || !service.getEvent) {
            throw new Error('Service does not have getEvent method');
        }
        
        const event = await service.getEvent(eventId);
        
        if (!event) {
            showError('Election not found. Please check your invitation link.');
            return;
        }
        
        currentEvent = event;
        console.log('✓ Election loaded:', event);
        
        // Render election UI
        renderElectionHeader();
        renderQuestions();
        renderGroupingFields();
        
        // Show appropriate UI based on wallet connection status
        const savedAddress = sessionStorage.getItem('joyid_address');
        if (savedAddress) {
            currentVoter = savedAddress;
            updateWalletStatus(savedAddress);
            document.getElementById('votingInterface').style.display = 'block';
            document.getElementById('walletRequired').style.display = 'none';
        } else {
            document.getElementById('walletRequired').style.display = 'block';
            document.getElementById('votingInterface').style.display = 'none';
        }
        
        // Handle election status
        if (currentEvent.status === 'concluded') {
            showResults();
        }
        
        document.getElementById('loadingState').style.display = 'none';
        
    } catch (error) {
        console.error('Failed to load election:', error);
        showError(`Failed to load election: ${error.message}`);
        document.getElementById('loadingState').style.display = 'none';
    }
}

/**
 * Render election header with metadata
 */
function renderElectionHeader() {
    if (!currentEvent) return;
    
    document.getElementById('electionTitle').textContent = currentEvent.title || 'Election';
    
    if (currentEvent.description) {
        document.getElementById('electionDescription').innerHTML = `<p>${currentEvent.description}</p>`;
    }
    
    document.getElementById('electionStatus').textContent = currentEvent.status === 'active' ? 'Active' : 'Concluded';
    
    if (currentEvent.endTime) {
        const date = new Date(currentEvent.endTime * 1000);
        document.getElementById('electionEndTime').textContent = date.toLocaleString();
    }
    
    if (currentEvent.participantCount !== undefined) {
        document.getElementById('participantCount').textContent = currentEvent.participantCount;
    }
}

/**
 * Render voting questions
 */
function renderQuestions() {
    if (!currentEvent || !currentEvent.questions) return;
    
    const container = document.getElementById('questionsContainer');
    container.innerHTML = '';
    
    currentEvent.questions.forEach((question, idx) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question-group';
        
        const questionLabel = document.createElement('label');
        questionLabel.className = 'question-label';
        questionLabel.textContent = question.text || `Question ${idx + 1}`;
        questionDiv.appendChild(questionLabel);
        
        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'options';
        
        question.options.forEach((option) => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'option-item';
            
            const inputId = `option_${idx}_${option.id}`;
            const input = document.createElement('input');
            input.type = question.multiSelect ? 'checkbox' : 'radio';
            input.id = inputId;
            input.name = `question_${idx}`;
            input.value = option.id;
            
            const label = document.createElement('label');
            label.htmlFor = inputId;
            label.textContent = option.text || `Option ${option.id}`;
            
            optionDiv.appendChild(input);
            optionDiv.appendChild(label);
            optionsDiv.appendChild(optionDiv);
        });
        
        questionDiv.appendChild(optionsDiv);
        container.appendChild(questionDiv);
    });
}

/**
 * Render grouping fields if present
 */
function renderGroupingFields() {
    if (!currentEvent || !currentEvent.groupingFields || currentEvent.groupingFields.length === 0) return;
    
    const container = document.getElementById('groupingFieldsContainer');
    const fieldsDiv = document.getElementById('groupingFields');
    
    container.style.display = 'block';
    fieldsDiv.innerHTML = '';
    
    currentEvent.groupingFields.forEach((field) => {
        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'form-group';
        
        const label = document.createElement('label');
        label.htmlFor = `grouping_${field}`;
        label.textContent = field;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.id = `grouping_${field}`;
        input.placeholder = `Enter ${field}`;
        
        fieldDiv.appendChild(label);
        fieldDiv.appendChild(input);
        fieldsDiv.appendChild(fieldDiv);
    });
}

// ============================================================================
// BALLOT SUBMISSION
// ============================================================================

/**
 * Handle ballot form submission
 */
async function handleBallotSubmission(event) {
    event.preventDefault();
    
    if (!currentVoter) {
        showError('Please connect your wallet first.');
        return;
    }
    
    if (!currentEvent) {
        showError('Election data not loaded.');
        return;
    }
    
    try {
        // Collect ballot answers
        const ballot = {
            eventId: currentEvent.eventId,
            answers: {},
            groupingData: {},
            timestamp: Math.floor(Date.now() / 1000)
        };
        
        // Collect question answers
        currentEvent.questions.forEach((question, idx) => {
            const groupName = `question_${idx}`;
            const inputs = document.querySelectorAll(`input[name="${groupName}"]:checked`);
            
            if (inputs.length > 0) {
                ballot.answers[question.id] = Array.from(inputs).map(i => i.value);
            }
        });
        
        // Collect grouping data if present
        if (currentEvent.groupingFields) {
            currentEvent.groupingFields.forEach(field => {
                const input = document.getElementById(`grouping_${field}`);
                if (input && input.value) {
                    ballot.groupingData[field] = input.value;
                }
            });
        }
        
        console.log('Submitting ballot:', ballot);
        
        // Submit ballot via service
        const service = window.CKBService || window.VoteSecureBlockchain;
        if (!service || !service.submitBallot) {
            throw new Error('Service does not have submitBallot method');
        }
        
        const receipt = await service.submitBallot(ballot, currentVoter);
        console.log('✓ Ballot submitted:', receipt);
        
        currentReceipt = receipt;
        showReceiptModal(receipt);
        
    } catch (error) {
        console.error('Ballot submission failed:', error);
        showError(`Failed to submit ballot: ${error.message}`);
    }
}

/**
 * Show receipt modal after ballot submission
 */
function showReceiptModal(receipt) {
    const modal = document.getElementById('receiptModal');
    
    if (receipt.commitmentHash) {
        document.getElementById('receiptCommitment').textContent = receipt.commitmentHash;
    }
    
    if (receipt.txHash) {
        document.getElementById('receiptTxHash').textContent = receipt.txHash;
    }
    
    if (receipt.timestamp) {
        const date = new Date(receipt.timestamp * 1000);
        document.getElementById('receiptTimestamp').textContent = date.toLocaleString();
    }
    
    if (receipt.sequence) {
        document.getElementById('receiptSequence').textContent = receipt.sequence;
    }
    
    modal.style.display = 'block';
}

/**
 * Close receipt modal
 */
function closeReceiptModal() {
    const modal = document.getElementById('receiptModal');
    modal.style.display = 'none';
}

/**
 * Download receipt as text file
 */
function downloadReceipt() {
    if (!currentReceipt) return;
    
    const content = `VoteSecure Ballot Receipt
========================
Commitment Hash: ${currentReceipt.commitmentHash}
Transaction Hash: ${currentReceipt.txHash}
Timestamp: ${new Date(currentReceipt.timestamp * 1000).toISOString()}
Sequence: ${currentReceipt.sequence}

Save this receipt to verify your ballot was included in the final tally.`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ballot_receipt_${currentReceipt.commitmentHash.substring(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================================================
// BALLOT VERIFICATION
// ============================================================================

/**
 * Handle verification form submission
 */
async function handleVerification(event) {
    event.preventDefault();
    
    try {
        const commitmentHash = document.getElementById('verifyCommitment').value;
        
        if (!commitmentHash) {
            showError('Please enter your commitment hash.');
            return;
        }
        
        const service = window.CKBService || window.VoteSecureBlockchain;
        if (!service || !service.verifyBallot) {
            throw new Error('Service does not have verifyBallot method');
        }
        
        const result = await service.verifyBallot(currentEvent.eventId, commitmentHash);
        
        const resultDiv = document.getElementById('verificationResult');
        if (result.included) {
            resultDiv.innerHTML = `
                <div class="success-message">
                    <h3>✓ Ballot Verified</h3>
                    <p>Your ballot was included in the final tally.</p>
                    <p><strong>Block Height:</strong> ${result.blockHeight}</p>
                    <p><strong>Timestamp:</strong> ${new Date(result.timestamp * 1000).toLocaleString()}</p>
                </div>
            `;
        } else {
            resultDiv.innerHTML = `
                <div class="error-message">
                    <h3>✗ Ballot Not Found</h3>
                    <p>Your commitment hash was not found in the results.</p>
                </div>
            `;
        }
        resultDiv.style.display = 'block';
        
    } catch (error) {
        console.error('Verification failed:', error);
        showError(`Verification failed: ${error.message}`);
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Show error message
 */
function showError(message) {
    const errorState = document.getElementById('errorState');
    const errorMsg = document.getElementById('errorMessage');
    
    if (errorMsg) {
        errorMsg.textContent = message;
    }
    
    if (errorState) {
        errorState.style.display = 'block';
    }
    
    console.error('Error:', message);
}

/**
 * Copy text to clipboard
 */
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const text = element.textContent;
    navigator.clipboard.writeText(text).then(() => {
        console.log('Copied to clipboard');
        // Show temporary feedback
        const btn = event.target;
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
            btn.textContent = original;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

/**
 * Show results section
 */
function showResults() {
    const resultsSection = document.getElementById('resultsSection');
    if (resultsSection) {
        resultsSection.style.display = 'block';
    }
    
    const votingForm = document.getElementById('votingForm');
    if (votingForm) {
        votingForm.style.display = 'none';
    }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Check if there's a previous wallet connection in session
 */
function checkPreviousConnection() {
    const savedAddress = sessionStorage.getItem('joyid_address');
    if (savedAddress) {
        console.log('Found previous session:', truncateAddress(savedAddress));
        currentVoter = savedAddress;
        updateWalletUI(true);
    }
}

// Export for use in other contexts if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        connectWallet,
        loadElection,
        handleBallotSubmission,
        submitElectionId
    };
}

// ============================================================================
// GLOBAL ERROR HANDLER
// ============================================================================

window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    
    if (!ckbServiceReady && event.error?.message?.includes('CKBService')) {
        showError('Blockchain service failed to load. Please refresh the page.');
        updateServiceStatus('error');
    }
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    if (event.reason?.message?.includes('User rejected')) {
        showError('Transaction cancelled by user');
    }
});

// Make functions available in console for debugging
if (typeof window !== 'undefined') {
    Object.assign(window, {
        connectWallet,
        disconnectWallet,
        loadElection,
        handleBallotSubmission,
        submitElectionId,
        closeReceiptModal,
        downloadReceipt,
        copyToClipboard
    });
    
    console.log('VoteSecure Voter loaded successfully');
}
