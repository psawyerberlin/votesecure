/**
 * VoteSecure Organizer Interface
 * Handles election creation, configuration, and publishing with CCC wallet
 * Updated to work with @ckb-ccc/connector-react
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let currentStep = 1;
let currentOrganizer = null;
let ckbServiceReady = false;
let blockchainReady = false;
let electionConfig = {
    eventId: null,
    title: '',
    description: '',
    estimatedVoters: 100,
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
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('VoteSecure Organizer initializing...');
    
    // Wait for services to be ready
    waitForBlockchainAPI();
    waitForCKBService();
    
    // Initialize with one question
    addQuestion();
    
    // Setup event listeners
    setupEventListeners();
    
    // Set default dates
    setDefaultDates();
    
    // Check if wallet was previously connected
    checkPreviousConnection();
});

/**
 * Wait for CKBService bridge to be available
 */
function waitForCKBService() {
    const checkService = () => {
        if (window.CKBService && window.CKBService.isReady) {
            ckbServiceReady = true;
            console.log('✓ CKB Service ready');
            updateServiceStatus('ready');
        } else {
            console.log('Waiting for CKB Service...');
            updateServiceStatus('loading');
            setTimeout(checkService, 100);
        }
    };
    
    checkService();
}

/**
 * Wait for VoteSecureBlockchain API
 */
function waitForBlockchainAPI() {
    const check = () => {
        if (window.VoteSecureBlockchain && window.VoteSecureBlockchain.connectWallet) {
            blockchainReady = true;
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
 * Update service status indicator
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
        btn.title = 'Connect your wallet';
    } else if (status === 'loading' && btn) {
        btn.disabled = true;
        btn.title = 'Loading blockchain services...';
    } else if (status === 'error' && btn) {
        btn.disabled = true;
        btn.title = 'Service unavailable';
    }
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Wallet connection toggle
    const connectBtn = document.getElementById('connectWalletBtn');
    if (connectBtn) {
        connectBtn.addEventListener('click', toggleWalletConnection);
    }
    
    // Form submission
    const form = document.getElementById('electionForm');
    if (form) {
        form.addEventListener('submit', handlePublish);
    }
    
    // Eligibility type changes
    document.querySelectorAll('input[name="eligibilityType"]').forEach(radio => {
        radio.addEventListener('change', handleEligibilityChange);
    });
    
    // Reporting granularity changes
    document.querySelectorAll('input[name="reportingGranularity"]').forEach(radio => {
        radio.addEventListener('change', handleReportingChange);
    });
    
    // Listen for wallet connection events from the React connector
    window.addEventListener('walletConnected', handleWalletConnected);
    window.addEventListener('walletDisconnected', handleWalletDisconnected);
}

/**
 * Set default dates for schedule
 */
function setDefaultDates() {
    const now = new Date();
    const startTime = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
    const endTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const releaseTime = new Date(endTime.getTime() + 60 * 60 * 1000); // 1 hour after end
    
    document.getElementById('startTime').value = formatDateTimeLocal(startTime);
    document.getElementById('endTime').value = formatDateTimeLocal(endTime);
    document.getElementById('resultsReleaseTime').value = formatDateTimeLocal(releaseTime);
}

/**
 * Check if wallet was previously connected
 */
function checkPreviousConnection() {
    const savedAddress = sessionStorage.getItem('wallet_address');
    const savedBalance = sessionStorage.getItem('wallet_balance');
    const savedNetwork = sessionStorage.getItem('wallet_network');
    
    if (savedAddress) {
        currentOrganizer = {
            address: savedAddress,
            balance: savedBalance || '0.00000000',
            network: savedNetwork || 'testnet'
        };
        updateWalletUI(true);
        console.log('Restored wallet session:', formatAddress(savedAddress));
    }
}

// ============================================================================
// WALLET CONNECTION (CCC Integration)
// ============================================================================

/**
 * Toggle wallet connection
 */
async function toggleWalletConnection() {
    if (!ckbServiceReady || !blockchainReady) {
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

/**
 * Connect wallet using CCC
 * This triggers the React CCC connector modal
 */
async function connectWallet() {
    const btn = document.getElementById('connectWalletBtn');
    const btnText = btn.querySelector('.btn-text');
    const originalHTML = btnText.innerHTML;
    
    if (!ckbServiceReady || !blockchainReady) {
        showNotification('Wallet service not ready. Please refresh the page.', 'error');
        return;
    }
    
    try {
        // Show loading state
        btn.disabled = true;
        btn.classList.add('loading');
        btnText.innerHTML = 'Connecting...';
        
        console.log('Opening CCC wallet connector...');
        
        // Trigger the React CCC connector modal
        if (window.CCCConnector && window.CCCConnector.open) {
            window.CCCConnector.open();
        } else {
            throw new Error('CCC Connector not available. Please refresh the page.');
        }
        
    } catch (error) {
        console.error('Wallet connection failed:', error);
        showNotification(`Connection failed: ${error.message}`, 'error');
        
        // Reset button state
        btn.disabled = false;
        btn.classList.remove('loading');
        btnText.innerHTML = originalHTML;
    }
}

/**
 * Handle wallet connected event from React connector
 */
async function handleWalletConnected(event) {
    const { address, balance, network } = event.detail;
    
    console.log('Wallet connection successful:', {
        address: formatAddress(address),
        balance: balance,
        network: network
    });
    
    // Store organizer info
    currentOrganizer = {
        address,
        balance: balance || '0',
        network: network || 'testnet'
    };
    
    // Save to session storage
    sessionStorage.setItem('wallet_address', address);
    sessionStorage.setItem('wallet_balance', balance || '0');
    sessionStorage.setItem('wallet_network', network || 'testnet');
    
    // Update UI
    updateWalletUI(true);
    
    // Load elections for this organizer
    loadMyElections();
    
    // Reset button state
    const btn = document.getElementById('connectWalletBtn');
    btn.disabled = false;
    btn.classList.remove('loading');
    
    showNotification('Wallet connected successfully!', 'success');
}

/**
 * Handle wallet disconnected event
 */
function handleWalletDisconnected() {
    console.log('Wallet disconnected');
    disconnectWallet();
}

/**
 * Disconnect wallet
 */
function disconnectWallet() {
    // Clear state
    currentOrganizer = null;
    
    // Clear session storage
    sessionStorage.removeItem('wallet_address');
    sessionStorage.removeItem('wallet_balance');
    sessionStorage.removeItem('wallet_network');
    
    // Update UI
    updateWalletUI(false);
    
    // Trigger React disconnect if available
    if (window.CCCConnector && window.CCCConnector.disconnect) {
        window.CCCConnector.disconnect();
    }
    
    showNotification('Wallet disconnected', 'info');
}

/**
 * Update wallet UI
 */
function updateWalletUI(connected) {
    const btn = document.getElementById('connectWalletBtn');
    const btnText = btn.querySelector('.btn-text');
    const walletInfo = document.getElementById('walletInfo');
    
    if (connected && currentOrganizer) {
        // Update button
        btnText.innerHTML = 'Disconnect';
        btn.classList.add('connected');
        
        // Show wallet info
        walletInfo.innerHTML = `
            <div class="wallet-info">
                <div class="wallet-address" title="${currentOrganizer.address}">
                    ${formatAddress(currentOrganizer.address)}
                </div>
                <div class="wallet-balance">
                    ${formatBalance(currentOrganizer.balance)} CKB
                </div>
            </div>
        `;
        walletInfo.style.display = 'block';
    } else {
        // Reset button
        btnText.innerHTML = 'Connect Wallet';
        btn.classList.remove('connected');
        
        // Hide wallet info
        walletInfo.innerHTML = '';
        walletInfo.style.display = 'none';
    }
}

/**
 * Refresh balance
 */
async function refreshBalance() {
    if (!currentOrganizer) return;
    
    try {
        const balanceShannons = await window.CKBService.getSpendableCapacityShannons(currentOrganizer.address);
        const balanceCKB = window.CKBService.shannons2CKB(balanceShannons);
        
        currentOrganizer.balance = balanceCKB;
        sessionStorage.setItem('wallet_balance', balanceCKB);
        
        updateWalletUI(true);
    } catch (error) {
        console.error('Failed to refresh balance:', error);
    }
}

/**
 * Format address for display
 */
function formatAddress(address) {
    if (!address) return '--';
    return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

/**
 * Format balance for display
 */
function formatBalance(balance) {
    if (!balance) return '0.00000000';
    const num = parseFloat(balance);
    return num.toFixed(8);
}

// ============================================================================
// FORM NAVIGATION
// ============================================================================

function nextStep() {
    if (!validateCurrentStep()) {
        return;
    }
    
    if (currentStep < 6) {
        currentStep++;
        updateStepDisplay();
    }
}

function previousStep() {
    if (currentStep > 1) {
        currentStep--;
        updateStepDisplay();
    }
}

function updateStepDisplay() {
    // Update progress steps
    document.querySelectorAll('.step').forEach(step => {
        const stepNum = parseInt(step.dataset.step);
        step.classList.toggle('active', stepNum === currentStep);
        step.classList.toggle('completed', stepNum < currentStep);
    });
    
    // Update form steps
    document.querySelectorAll('.form-step').forEach(step => {
        const stepNum = parseInt(step.dataset.step);
        step.classList.toggle('active', stepNum === currentStep);
    });
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function validateCurrentStep() {
    const currentFormStep = document.querySelector(`.form-step[data-step="${currentStep}"]`);
    const requiredFields = currentFormStep.querySelectorAll('[required]');
    
    for (const field of requiredFields) {
        if (!field.value.trim()) {
            showNotification(`Please fill in: ${field.previousElementSibling.textContent}`, 'warning');
            field.focus();
            return false;
        }
    }
    
    // Step-specific validation
    if (currentStep === 2) {
        const questions = document.querySelectorAll('.question-block');
        if (questions.length === 0) {
            showNotification('Please add at least one question', 'warning');
            return false;
        }
        
        for (const q of questions) {
            const questionText = q.querySelector('.question-text');
            const options = q.querySelectorAll('.option-input');
            
            if (!questionText.value.trim()) {
                showNotification('All questions must have text', 'warning');
                questionText.focus();
                return false;
            }
            
            if (options.length < 2) {
                showNotification('Each question must have at least 2 options', 'warning');
                return false;
            }
            
            for (const opt of options) {
                if (!opt.value.trim()) {
                    showNotification('All options must have text', 'warning');
                    opt.focus();
                    return false;
                }
            }
        }
    }
    
    return true;
}

// ============================================================================
// QUESTION MANAGEMENT
// ============================================================================

let questionCounter = 0;

function addQuestion() {
    const container = document.getElementById('questionsContainer');
    const questionId = `q${++questionCounter}`;
    
    const questionBlock = document.createElement('div');
    questionBlock.className = 'question-block';
    questionBlock.dataset.questionId = questionId;
    
    questionBlock.innerHTML = `
        <div class="question-header">
            <h3>Question ${questionCounter}</h3>
            <button type="button" onclick="removeQuestion('${questionId}')" class="btn-remove">Remove</button>
        </div>
        
        <div class="form-group">
            <label>Question Text *</label>
            <input type="text" class="question-text" required placeholder="e.g., Who should be president?">
        </div>
        
        <div class="form-group">
            <label>Question Type</label>
            <select class="question-type" onchange="updateQuestionType('${questionId}', this.value)">
                <option value="single-choice">Single Choice</option>
                <option value="multiple-choice">Multiple Choice</option>
                <option value="ranked">Ranked Choice</option>
            </select>
        </div>
        
        <div class="form-group">
            <label>Options *</label>
            <div class="options-container" data-question-id="${questionId}">
                <div class="option-item">
                    <input type="text" class="option-input" required placeholder="Option 1">
                    <button type="button" onclick="removeOption(this)" class="btn-remove-small">×</button>
                </div>
                <div class="option-item">
                    <input type="text" class="option-input" required placeholder="Option 2">
                    <button type="button" onclick="removeOption(this)" class="btn-remove-small">×</button>
                </div>
            </div>
            <button type="button" onclick="addOption('${questionId}')" class="btn-add">+ Add Option</button>
        </div>
    `;
    
    container.appendChild(questionBlock);
}

function removeQuestion(questionId) {
    const block = document.querySelector(`.question-block[data-question-id="${questionId}"]`);
    if (block) {
        block.remove();
        renumberQuestions();
    }
}

function renumberQuestions() {
    const questions = document.querySelectorAll('.question-block');
    questions.forEach((q, idx) => {
        q.querySelector('h3').textContent = `Question ${idx + 1}`;
    });
}

function addOption(questionId) {
    const container = document.querySelector(`.options-container[data-question-id="${questionId}"]`);
    const optionCount = container.querySelectorAll('.option-item').length + 1;
    
    const optionItem = document.createElement('div');
    optionItem.className = 'option-item';
    optionItem.innerHTML = `
        <input type="text" class="option-input" required placeholder="Option ${optionCount}">
        <button type="button" onclick="removeOption(this)" class="btn-remove-small">×</button>
    `;
    
    container.appendChild(optionItem);
}

function removeOption(button) {
    const container = button.closest('.options-container');
    const optionCount = container.querySelectorAll('.option-item').length;
    
    if (optionCount <= 2) {
        showNotification('Each question must have at least 2 options', 'warning');
        return;
    }
    
    button.closest('.option-item').remove();
}

function updateQuestionType(questionId, type) {
    console.log(`Question ${questionId} type changed to: ${type}`);
}

// ============================================================================
// ELIGIBILITY & REPORTING HANDLERS
// ============================================================================

function handleEligibilityChange(event) {
    const type = event.target.value;
    
    document.querySelectorAll('.eligibility-detail').forEach(el => {
        el.style.display = 'none';
    });
    
    const detailSection = document.querySelector(`.eligibility-detail[data-type="${type}"]`);
    if (detailSection) {
        detailSection.style.display = 'block';
    }
}

function handleReportingChange(event) {
    const granularity = event.target.value;
    const groupingSection = document.getElementById('groupingFieldsSection');
    
    if (granularity === 'by_group') {
        groupingSection.style.display = 'block';
    } else {
        groupingSection.style.display = 'none';
    }
}

// ============================================================================
// ELECTION PUBLISHING
// ============================================================================

async function handlePublish(event) {
    event.preventDefault();
    
    if (!currentOrganizer) {
        showNotification('Please connect your wallet first', 'error');
        return;
    }
    
    if (!validateCurrentStep()) {
        return;
    }
    
    // Collect form data
    electionConfig = collectFormData();
    
    // Show review step
    displayReview();
}

function collectFormData() {
    // Basic info
    const title = document.getElementById('electionTitle').value.trim();
    const description = document.getElementById('electionDescription').value.trim();
    const estimatedVoters = parseInt(document.getElementById('estimatedVoters').value);
    
    // Questions
    const questions = [];
    document.querySelectorAll('.question-block').forEach((block, idx) => {
        const questionText = block.querySelector('.question-text').value.trim();
        const questionType = block.querySelector('.question-type').value;
        const options = [];
        
        block.querySelectorAll('.option-input').forEach((opt, optIdx) => {
            options.push({
                id: `opt${optIdx + 1}`,
                text: opt.value.trim()
            });
        });
        
        questions.push({
            id: `q${idx + 1}`,
            text: questionText,
            type: questionType,
            options: options
        });
    });
    
    // Schedule
    const startTime = new Date(document.getElementById('startTime').value).getTime() / 1000;
    const endTime = new Date(document.getElementById('endTime').value).getTime() / 1000;
    const resultsReleaseTime = new Date(document.getElementById('resultsReleaseTime').value).getTime() / 1000;
    
    // Eligibility
    const eligibilityType = document.querySelector('input[name="eligibilityType"]:checked').value;
    const eligibility = { type: eligibilityType };
    
    if (eligibilityType === 'curated_list' || eligibilityType === 'per_voter') {
        const voterList = document.getElementById('voterList')?.value.trim();
        if (voterList) {
            eligibility.voters = voterList.split('\n').filter(v => v.trim());
        }
    }
    
    // Privacy settings
    const anonymityLevel = document.querySelector('input[name="anonymityLevel"]:checked').value;
    const reportingGranularity = document.querySelector('input[name="reportingGranularity"]:checked').value;
    const liveStatsMode = document.querySelector('input[name="liveStatsMode"]:checked').value;
    
    const groupingFields = [];
    if (reportingGranularity === 'by_group') {
        document.querySelectorAll('#groupingFieldsList input:checked').forEach(cb => {
            groupingFields.push(cb.value);
        });
    }
    
    const minGroupSize = parseInt(document.getElementById('minGroupSize')?.value || 5);
    const allowedUpdates = parseInt(document.getElementById('allowedUpdates')?.value || 3);
    
    return {
        eventId: window.VoteSecureBlockchain.generateEventId(),
        title,
        description,
        estimatedVoters,
        questions,
        schedule: {
            startTime,
            endTime,
            resultsReleaseTime
        },
        eligibility,
        anonymityLevel,
        reportingGranularity,
        groupingFields,
        minGroupSize,
        allowedUpdates,
        liveStatsMode,
        votingMode: 'single',
        resultReleasePolicy: {
            autoRelease: true,
            releaseTime: resultsReleaseTime
        }
    };
}

function displayReview() {
    // Show step 6
    currentStep = 6;
    updateStepDisplay();
    
    // Populate review
    const reviewContent = document.getElementById('reviewContent');
    const costInfo = window.VoteSecureBlockchain.estimateEventCost(electionConfig);
    
    reviewContent.innerHTML = `
        <div class="review-section">
            <h3>Basic Information</h3>
            <dl>
                <dt>Title:</dt><dd>${escapeHtml(electionConfig.title)}</dd>
                <dt>Description:</dt><dd>${escapeHtml(electionConfig.description) || 'None'}</dd>
                <dt>Estimated Voters:</dt><dd>${electionConfig.estimatedVoters}</dd>
            </dl>
        </div>
        
        <div class="review-section">
            <h3>Questions (${electionConfig.questions.length})</h3>
            ${electionConfig.questions.map((q, i) => `
                <div class="review-question">
                    <strong>${i + 1}. ${escapeHtml(q.text)}</strong>
                    <small>(${q.type})</small>
                    <ul>
                        ${q.options.map(opt => `<li>${escapeHtml(opt.text)}</li>`).join('')}
                    </ul>
                </div>
            `).join('')}
        </div>
        
        <div class="review-section">
            <h3>Schedule</h3>
            <dl>
                <dt>Start:</dt><dd>${formatDateTime(electionConfig.schedule.startTime * 1000)}</dd>
                <dt>End:</dt><dd>${formatDateTime(electionConfig.schedule.endTime * 1000)}</dd>
                <dt>Results Release:</dt><dd>${formatDateTime(electionConfig.schedule.resultsReleaseTime * 1000)}</dd>
            </dl>
        </div>
        
        <div class="review-section">
            <h3>Privacy Settings</h3>
            <dl>
                <dt>Anonymity:</dt><dd>${electionConfig.anonymityLevel}</dd>
                <dt>Reporting:</dt><dd>${electionConfig.reportingGranularity}</dd>
                <dt>Live Stats:</dt><dd>${electionConfig.liveStatsMode}</dd>
            </dl>
        </div>
        
        <div class="review-section cost-section">
            <h3>Estimated Blockchain Costs</h3>
            <dl>
                <dt>Total Cost:</dt><dd><strong>${costInfo.totalCost} CKB</strong></dd>
                <dt>Breakdown:</dt>
                <dd>
                    - Metadata: ${costInfo.baseMetadataCost} CKB<br>
                    - Results: ${costInfo.baseResultCost} CKB<br>
                    - Voters (${electionConfig.estimatedVoters} × ${costInfo.allowedUpdates}): ${costInfo.votersCost} CKB<br>
                    - Base Fund: ${costInfo.eventFundBase} CKB
                </dd>
                <dt>Your Balance:</dt><dd>${formatBalance(currentOrganizer.balance)} CKB</dd>
            </dl>
            ${parseFloat(currentOrganizer.balance) < costInfo.totalCost ? 
                '<p class="warning-text">⚠️ Insufficient balance. Please add more CKB to your wallet.</p>' : 
                '<p class="success-text">✓ Sufficient balance</p>'
            }
        </div>
    `;
}

async function confirmPublish() {
    if (!currentOrganizer) {
        showNotification('Please connect your wallet first', 'error');
        return;
    }
    
    const costInfo = window.VoteSecureBlockchain.estimateEventCost(electionConfig);
    
    if (parseFloat(currentOrganizer.balance) < costInfo.totalCost) {
        showNotification('Insufficient balance to publish this election', 'error');
        return;
    }
    
    const confirmBtn = document.getElementById('confirmPublishBtn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Publishing...';
    
    try {
        console.log('Publishing election to blockchain...');
        
        const result = await window.VoteSecureBlockchain.publishEvent(
            electionConfig,
            currentOrganizer.address
        );
        
        if (result.success) {
            publishedEvent = result.event;
            
            // Show success modal
            showSuccessModal(result);
            
            // Refresh balance
            await refreshBalance();
        } else {
            showNotification(result.error || 'Failed to publish election', 'error');
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Publish Election';
        }
    } catch (error) {
        console.error('Publishing failed:', error);
        showNotification(`Publishing failed: ${error.message}`, 'error');
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Publish Election';
    }
}

function showSuccessModal(result) {
    const modal = document.getElementById('successModal');
    const inviteMaterials = result.inviteMaterials || window.VoteSecureBlockchain.generateInviteMaterials(electionConfig);
    
    document.getElementById('publishedEventId').textContent = result.event.eventId;
    document.getElementById('publishedTxHash').textContent = formatAddress(result.event.txHash);
    document.getElementById('publishedVoterUrl').textContent = inviteMaterials.url || `${window.location.origin}/web/voter.html?event=${result.event.eventId}`;
    
    const inviteKeySection = document.getElementById('inviteKeySection');
    if (inviteMaterials.type === 'invite_key') {
        document.getElementById('publishedInviteKey').textContent = inviteMaterials.inviteKey;
        inviteKeySection.style.display = 'block';
    } else {
        inviteKeySection.style.display = 'none';
    }
    
    modal.classList.add('active');
}

function closeSuccessModal() {
    document.getElementById('successModal').classList.remove('active');
}

function downloadInviteMaterials() {
    const inviteMaterials = window.VoteSecureBlockchain.generateInviteMaterials(electionConfig);
    
    const content = `
VoteSecure Election - Invite Materials
=======================================

Event ID: ${publishedEvent.eventId}
Title: ${electionConfig.title}

Voter URL: ${inviteMaterials.url || 'N/A'}
${inviteMaterials.inviteKey ? `Invite Key: ${inviteMaterials.inviteKey}` : ''}

Schedule:
- Start: ${formatDateTime(electionConfig.schedule.startTime * 1000)}
- End: ${formatDateTime(electionConfig.schedule.endTime * 1000)}

Questions:
${electionConfig.questions.map((q, i) => `${i + 1}. ${q.text}`).join('\n')}

Instructions:
1. Share the Voter URL with eligible voters
${inviteMaterials.inviteKey ? '2. Provide the Invite Key when requested' : ''}
    `.trim();
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `election_${publishedEvent.eventId}_invite.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Invite materials downloaded!', 'success');
}

// ============================================================================
// VIEW MANAGEMENT
// ============================================================================

function showCreateView() {
    document.getElementById('createView').style.display = 'block';
    document.getElementById('myElectionsView').style.display = 'none';
    
    // Reset form
    currentStep = 1;
    updateStepDisplay();
}

function showMyElections() {
    if (!currentOrganizer) {
        showNotification('Please connect your wallet first', 'error');
        return;
    }
    
    document.getElementById('createView').style.display = 'none';
    document.getElementById('myElectionsView').style.display = 'block';
    
    loadMyElections();
}

function loadMyElections() {
    if (!currentOrganizer) return;
    
    const elections = window.VoteSecureBlockchain.getEventsByOrganizer(currentOrganizer.address);
    const container = document.getElementById('electionsList');
    
    if (elections.length === 0) {
        container.innerHTML = '<p class="empty-state">No elections yet. Create your first election!</p>';
        return;
    }
    
    container.innerHTML = elections.map(event => {
        const now = Date.now();
        const status = getEventStatus(event, now);
        
        return `
            <div class="election-card ${status}">
                <div class="election-card-header">
                    <h3>${escapeHtml(event.title)}</h3>
                    <span class="status-badge ${status}">${status}</span>
                </div>
                
                <div class="election-card-body">
                    <div class="info-row">
                        <span class="label">Event ID:</span>
                        <span class="value">${event.eventId}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Published:</span>
                        <span class="value">${formatDateTime(event.publishedAt)}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Funding:</span>
                        <span class="value">${event.funding?.remaining || 0} CKB remaining</span>
                    </div>
                </div>
                
                <div class="election-card-actions">
                    <button onclick="viewElectionDetails('${event.eventId}')" class="btn btn-sm btn-secondary">
                        View Details
                    </button>
                    <button onclick="copyVoterUrl('${event.eventId}')" class="btn btn-sm btn-secondary">
                        Copy Voter URL
                    </button>
                    ${status === 'active' ? `
                        <button onclick="viewLiveStats('${event.eventId}')" class="btn btn-sm btn-primary">
                            Live Stats
                        </button>
                    ` : ''}
                    ${status === 'ended' ? `
                        <button onclick="releaseResults('${event.eventId}')" class="btn btn-sm btn-primary">
                            Release Results
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function getEventStatus(event, now) {
    // This is a simplified version - adjust based on your event structure
    if (event.status === 'published') return 'upcoming';
    if (event.status === 'active') return 'active';
    if (event.status === 'ended') return 'ended';
    return 'results_available';
}

function viewElectionDetails(eventId) {
    const event = window.VoteSecureBlockchain.getEvent(eventId);
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
    const stats = window.VoteSecureBlockchain.getLiveStatistics(eventId);
    
    const statsText = `
Live Statistics
===============

Total Ballots: ${stats.totalBallots}
Unique Voters: ${stats.uniqueVoters}

Last Updated: ${formatDateTime(stats.lastUpdate)}
    `.trim();
    
    console.log(statsText);
    showNotification(`Live Stats: ${stats.uniqueVoters} voters, ${stats.totalBallots} ballots`, 'info');
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
        
        const result = await window.VoteSecureBlockchain.releaseResults(eventId, currentOrganizer.address);
        
        if (result.success) {
            showNotification('Results released successfully!', 'success');
            loadMyElections();
            await refreshBalance();
        } else {
            showNotification(result.error || 'Failed to release results', 'error');
        }
    } catch (error) {
        console.error('Result release failed:', error);
        showNotification(`Failed to release results: ${error.message}`, 'error');
    }
}

// ============================================================================
// NOTIFICATION SYSTEM
// ============================================================================

function showNotification(message, type = 'info') {
    const container = document.getElementById('notificationContainer');
    if (!container) {
        console.warn('Notification container not found');
        console.log(`[${type.toUpperCase()}] ${message}`);
        return;
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">${escapeHtml(message)}</div>
        <button class="notification-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

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
    if (!text) return '';
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
    
    if (event.reason?.message?.toLowerCase().includes('rejected')) {
        showNotification('Transaction cancelled by user', 'info');
    }
});

// ============================================================================
// EXPORT FOR DEBUGGING & INLINE HANDLERS
// ============================================================================

if (typeof window !== 'undefined') {
    // Debug object
    window.VoteSecureOrganizer = {
        currentOrganizer,
        electionConfig,
        ckbServiceReady,
        blockchainReady,
        refreshBalance,
        connectWallet,
        disconnectWallet,
        showNotification,
    };

    // Expose functions for inline onclick handlers
    Object.assign(window, {
        nextStep,
        previousStep,
        addQuestion,
        removeQuestion,
        addOption,
        removeOption,
        updateQuestionType,
        confirmPublish,
        showMyElections,
        showCreateView,
        viewElectionDetails,
        copyVoterUrl,
        viewLiveStats,
        releaseResults,
        closeSuccessModal,
        downloadInviteMaterials,
        copyToClipboard,
    });

    console.log('✓ VoteSecure Organizer loaded');
    console.log('Debug interface: window.VoteSecureOrganizer');
}
