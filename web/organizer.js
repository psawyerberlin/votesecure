/**
 * VoteSecure Organizer Interface
 * Handles election creation, configuration, and publishing with JoyID wallet
 */

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
    
    // Wait for CKB Service to be ready
    waitForCKBService();
    
    // Initialize with one question
    addQuestion();
    
    // Setup event listeners
    setupEventListeners();
    
    // Set default dates
    setDefaultDates();
    
    // Check if wallet was previously connected (session storage)
    checkPreviousConnection();
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
        btn.title = 'Connect your JoyID wallet';
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
    const savedAddress = sessionStorage.getItem('joyid_address');
    const savedBalance = sessionStorage.getItem('joyid_balance');
    const savedNetwork = sessionStorage.getItem('joyid_network');
    
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
// WALLET CONNECTION (JoyID via CKB Service Bridge)
// ============================================================================

/**
 * Toggle wallet connection (connect/disconnect)
 */
async function toggleWalletConnection() {
    if (!ckbServiceReady) {
        showNotification('Blockchain service is not ready yet. Please wait...', 'warning');
        return;
    }
    
    if (currentOrganizer) {
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
    const btnText = btn.querySelector('.btn-text');
    const originalHTML = btnText.innerHTML;
    
    if (!ckbServiceReady) {
        showNotification('CKB Service not ready. Please refresh the page.', 'error');
        return;
    }
    
    try {
        // Show loading state
        btn.disabled = true;
        btn.classList.add('loading');
        btnText.innerHTML = 'Connecting...';
        
        console.log('Initiating JoyID connection...');
        
        // Connect via CKB Service Bridge
        const walletInfo = await window.CKBService.connectJoyID();
        
        console.log('JoyID connection successful:', {
            address: formatAddress(walletInfo.address),
            balance: walletInfo.balance,
            network: walletInfo.network
        });
        
        currentOrganizer = {
            address: walletInfo.address,
            balance: walletInfo.balance,
            network: walletInfo.network
        };
        
        // Save to session storage
        sessionStorage.setItem('joyid_address', walletInfo.address);
        sessionStorage.setItem('joyid_balance', walletInfo.balance);
        sessionStorage.setItem('joyid_network', walletInfo.network);
        
        // Update UI
        updateWalletUI(true);
        
        console.log('✓ Wallet connected successfully');
        
        // Show success message
        showNotification('Wallet connected successfully!', 'success');
        
    } catch (error) {
        console.error('Wallet connection failed:', error);
        
        // Reset button state
        btn.disabled = false;
        btn.classList.remove('loading');
        btnText.innerHTML = originalHTML;
        
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
        
        showNotification(errorMsg, 'error');
    }
}

/**
 * Disconnect wallet
 */
function disconnectWallet() {
    console.log('Disconnecting wallet:', formatAddress(currentOrganizer?.address));
    
    currentOrganizer = null;
    
    // Clear session storage
    sessionStorage.removeItem('joyid_address');
    sessionStorage.removeItem('joyid_balance');
    sessionStorage.removeItem('joyid_network');
    
    // Update UI
    updateWalletUI(false);
    
    showNotification('Wallet disconnected', 'info');
}

/**
 * Update wallet UI based on connection state
 * @param {boolean} connected - Is wallet connected
 */
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
        
        console.log('Wallet UI updated: connected');
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
        
        console.log('Wallet UI updated: disconnected');
    }
}

/**
 * Refresh wallet balance
 */
async function refreshBalance() {
    if (!currentOrganizer || !ckbServiceReady) return;
    
    try {
        const balance = await window.CKBService.getSpendableCapacityShannons(currentOrganizer.address);
        const balanceFormatted = window.CKBService.padCkb(window.CKBService.shannons2CKB(balance));
        
        currentOrganizer.balance = balanceFormatted;
        sessionStorage.setItem('joyid_balance', balanceFormatted);
        
        updateWalletUI(true);
        
        console.log('Balance refreshed:', balanceFormatted, 'CKB');
    } catch (error) {
        console.error('Failed to refresh balance:', error);
    }
}

/**
 * Format address for display (show first 6 and last 4 characters)
 * @param {string} address - Full address
 * @returns {string} Formatted address
 */
function formatAddress(address) {
    if (!address) return '';
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Show notification message
 * @param {string} message - Message to show
 * @param {string} type - Type: 'success', 'error', 'info', 'warning'
 */
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
// FORM NAVIGATION
// ============================================================================

/**
 * Navigate to next step
 */
function nextStep() {
    if (!validateCurrentStep()) {
        return;
    }
    
    // Save current step data
    saveStepData(currentStep);
    
    currentStep++;
    if (currentStep > 6) currentStep = 6;
    
    updateStepDisplay();
    
    // Generate review on last step
    if (currentStep === 6) {
        generateReview();
    }
}

/**
 * Navigate to previous step
 */
function previousStep() {
    currentStep--;
    if (currentStep < 1) currentStep = 1;
    
    updateStepDisplay();
}

/**
 * Update step display
 */
function updateStepDisplay() {
    // Update progress indicators
    document.querySelectorAll('.progress-steps .step').forEach(step => {
        const stepNum = parseInt(step.dataset.step);
        step.classList.toggle('active', stepNum === currentStep);
        step.classList.toggle('completed', stepNum < currentStep);
    });
    
    // Show/hide form steps
    document.querySelectorAll('.form-step').forEach(step => {
        const stepNum = parseInt(step.dataset.step);
        step.classList.toggle('active', stepNum === currentStep);
    });
    
    // Update navigation buttons
    document.getElementById('prevBtn').style.display = currentStep > 1 ? 'block' : 'none';
    document.getElementById('nextBtn').style.display = currentStep < 6 ? 'block' : 'none';
    document.getElementById('publishBtn').style.display = currentStep === 6 ? 'block' : 'none';
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Validate current step
 * @returns {boolean} Is valid
 */
function validateCurrentStep() {
    const currentStepEl = document.querySelector(`.form-step[data-step="${currentStep}"]`);
    const requiredInputs = currentStepEl.querySelectorAll('input[required], textarea[required]');
    
    for (let input of requiredInputs) {
        if (!input.value.trim()) {
            input.focus();
            showNotification(`Please fill in: ${input.previousElementSibling?.textContent || 'required field'}`, 'error');
            return false;
        }
    }
    
    // Step-specific validation
    switch (currentStep) {
        case 2:
            if (electionConfig.questions.length === 0) {
                showNotification('Please add at least one question', 'error');
                return false;
            }
            break;
        case 3:
            if (!validateSchedule()) {
                return false;
            }
            break;
    }
    
    return true;
}

/**
 * Validate schedule dates
 * @returns {boolean} Is valid
 */
function validateSchedule() {
    const startTime = new Date(document.getElementById('startTime').value).getTime();
    const endTime = new Date(document.getElementById('endTime').value).getTime();
    const releaseTime = new Date(document.getElementById('resultsReleaseTime').value).getTime();
    const now = Date.now();
    
    if (startTime < now) {
        showNotification('Start time must be in the future', 'error');
        return false;
    }
    
    if (endTime <= startTime) {
        showNotification('End time must be after start time', 'error');
        return false;
    }
    
    if (releaseTime < endTime) {
        showNotification('Results release time must be after end time', 'error');
        return false;
    }
    
    return true;
}

/**
 * Save data from current step
 * @param {number} step - Step number
 */
function saveStepData(step) {
    switch (step) {
        case 1:
            electionConfig.title = document.getElementById('electionTitle').value;
            electionConfig.description = document.getElementById('electionDescription').value;
            electionConfig.estimatedVoters = parseInt(document.getElementById('estimatedVoters').value);
            break;
            
        case 2:
            // Questions are saved dynamically
            break;
            
        case 3:
            electionConfig.schedule = {
                startTime: new Date(document.getElementById('startTime').value).getTime(),
                endTime: new Date(document.getElementById('endTime').value).getTime(),
                resultsReleaseTime: new Date(document.getElementById('resultsReleaseTime').value).getTime()
            };
            electionConfig.allowedUpdates = parseInt(document.getElementById('allowedUpdates').value);
            break;
            
        case 4:
            saveEligibilityConfig();
            break;
            
        case 5:
            savePrivacyConfig();
            break;
    }
}

// ============================================================================
// QUESTIONS MANAGEMENT
// ============================================================================

let questionCounter = 0;

/**
 * Add new question
 */
function addQuestion() {
    questionCounter++;
    const questionId = `q${questionCounter}`;
    
    const questionDiv = document.createElement('div');
    questionDiv.className = 'question-card';
    questionDiv.dataset.questionId = questionId;
    questionDiv.innerHTML = `
        <div class="question-header">
            <h4>Question ${questionCounter}</h4>
            <button type="button" onclick="removeQuestion('${questionId}')" class="btn-remove">×</button>
        </div>
        
        <div class="form-group">
            <label>Question Text *</label>
            <input type="text" class="question-text" required placeholder="Enter your question">
        </div>
        
        <div class="form-group">
            <label>Question Type *</label>
            <select class="question-type" onchange="updateQuestionType('${questionId}')">
                <option value="single">Single Choice</option>
                <option value="multi">Multiple Choice</option>
            </select>
        </div>
        
        <div class="form-group">
            <label>Options *</label>
            <div class="options-list" data-question-id="${questionId}">
                <!-- Options will be added here -->
            </div>
            <button type="button" onclick="addOption('${questionId}')" class="btn btn-sm btn-secondary">
                + Add Option
            </button>
        </div>
    `;
    
    document.getElementById('questionsContainer').appendChild(questionDiv);
    
    // Add two default options
    addOption(questionId);
    addOption(questionId);
    
    // Update config
    updateQuestionsConfig();
}

/**
 * Remove question
 * @param {string} questionId - Question ID
 */
function removeQuestion(questionId) {
    const questionCard = document.querySelector(`.question-card[data-question-id="${questionId}"]`);
    if (questionCard) {
        questionCard.remove();
        updateQuestionsConfig();
    }
}

/**
 * Add option to question
 * @param {string} questionId - Question ID
 */
function addOption(questionId) {
    const optionsList = document.querySelector(`.options-list[data-question-id="${questionId}"]`);
    const optionId = `opt${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    const optionDiv = document.createElement('div');
    optionDiv.className = 'option-item';
    optionDiv.dataset.optionId = optionId;
    optionDiv.innerHTML = `
        <input type="text" class="option-text" placeholder="Option text" required>
        <button type="button" onclick="removeOption('${questionId}', '${optionId}')" class="btn-remove-small">×</button>
    `;
    
    optionsList.appendChild(optionDiv);
    updateQuestionsConfig();
}

/**
 * Remove option
 * @param {string} questionId - Question ID
 * @param {string} optionId - Option ID
 */
function removeOption(questionId, optionId) {
    const optionDiv = document.querySelector(`.options-list[data-question-id="${questionId}"] [data-option-id="${optionId}"]`);
    if (optionDiv) {
        optionDiv.remove();
        updateQuestionsConfig();
    }
}

/**
 * Update question type
 * @param {string} questionId - Question ID
 */
function updateQuestionType(questionId) {
    updateQuestionsConfig();
}

/**
 * Update questions configuration
 */
function updateQuestionsConfig() {
    const questions = [];
    
    document.querySelectorAll('.question-card').forEach(card => {
        const questionId = card.dataset.questionId;
        const text = card.querySelector('.question-text').value;
        const type = card.querySelector('.question-type').value;
        
        const options = [];
        card.querySelectorAll('.option-item').forEach(optionDiv => {
            const optionText = optionDiv.querySelector('.option-text').value;
            if (optionText.trim()) {
                options.push({
                    id: optionDiv.dataset.optionId,
                    text: optionText
                });
            }
        });
        
        if (text.trim() && options.length >= 2) {
            questions.push({
                id: questionId,
                text: text,
                type: type,
                options: options
            });
        }
    });
    
    electionConfig.questions = questions;
}

// ============================================================================
// ELIGIBILITY CONFIGURATION
// ============================================================================

/**
 * Handle eligibility type change
 */
function handleEligibilityChange(e) {
    const type = e.target.value;
    const voterListContainer = document.getElementById('voterListContainer');
    
    voterListContainer.style.display = 
        (type === 'per_voter' || type === 'curated_list') ? 'block' : 'none';
}

/**
 * Save eligibility configuration
 */
function saveEligibilityConfig() {
    const type = document.querySelector('input[name="eligibilityType"]:checked').value;
    
    electionConfig.eligibility = {
        type: type,
        enableCaptcha: document.getElementById('enableCaptcha').checked,
        enableRateLimit: document.getElementById('enableRateLimit').checked
    };
    
    if (type === 'per_voter' || type === 'curated_list') {
        const voterListText = document.getElementById('voterList').value;
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

// ============================================================================
// PRIVACY CONFIGURATION
// ============================================================================

/**
 * Handle reporting granularity change
 */
function handleReportingChange(e) {
    const value = e.target.value;
    document.getElementById('groupingContainer').style.display = 
        value === 'by_group' ? 'block' : 'none';
}

/**
 * Save privacy configuration
 */
function savePrivacyConfig() {
    electionConfig.anonymityLevel = document.querySelector('input[name="anonymityLevel"]:checked').value;
    electionConfig.reportingGranularity = document.querySelector('input[name="reportingGranularity"]:checked').value;
    electionConfig.liveStatsMode = document.querySelector('input[name="liveStatsMode"]:checked').value;
    
    const resultPolicy = document.querySelector('input[name="resultPolicy"]:checked').value;
    electionConfig.resultReleasePolicy = {
        type: resultPolicy
    };
    
    if (electionConfig.reportingGranularity === 'by_group') {
        const fieldsText = document.getElementById('groupingFields').value;
        electionConfig.groupingFields = fieldsText
            .split(',')
            .map(f => f.trim())
            .filter(f => f.length > 0);
        
        electionConfig.minGroupSize = parseInt(document.getElementById('minGroupSize').value);
    }
}

// ============================================================================
// REVIEW & PUBLISH
// ============================================================================

/**
 * Generate review summary
 */
function generateReview() {
    // Update questions config one more time
    updateQuestionsConfig();
    saveStepData(5);
    
    const summary = document.getElementById('reviewSummary');
    summary.innerHTML = `
        <div class="review-item">
            <strong>Title:</strong>
            <p>${escapeHtml(electionConfig.title)}</p>
        </div>
        
        <div class="review-item">
            <strong>Questions:</strong>
            <p>${electionConfig.questions.length} question(s)</p>
            <ul>
                ${electionConfig.questions.map(q => `
                    <li>${escapeHtml(q.text)} (${q.type === 'single' ? 'Single' : 'Multiple'} choice, ${q.options.length} options)</li>
                `).join('')}
            </ul>
        </div>
        
        <div class="review-item">
            <strong>Schedule:</strong>
            <ul>
                <li>Start: ${formatDateTime(electionConfig.schedule.startTime)}</li>
                <li>End: ${formatDateTime(electionConfig.schedule.endTime)}</li>
                <li>Results Release: ${formatDateTime(electionConfig.schedule.resultsReleaseTime)}</li>
            </ul>
        </div>
        
        <div class="review-item">
            <strong>Eligibility:</strong>
            <p>${formatEligibilityType(electionConfig.eligibility.type)}</p>
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
    const costEstimate = window.VoteSecureBlockchain.estimateEventCost(electionConfig);
    const costBreakdown = document.getElementById('costBreakdown');
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
                <span>Voter Cells (${costEstimate.estimatedVoters} voters):</span>
                <span>${costEstimate.votersCost} CKB</span>
            </div>
            <div class="cost-row">
                <span>Lockscript Overhead:</span>
                <span>${costEstimate.lockscriptOverhead} CKB</span>
            </div>
            <div class="cost-row total">
                <span><strong>Total Estimated Cost:</strong></span>
                <span><strong>${costEstimate.totalCost} CKB</strong></span>
            </div>
        </div>
        <p class="cost-note">Unused funds will be returned to your wallet after the election ends.</p>
    `;
}

/**
 * Handle election publication
 * @param {Event} e - Submit event
 */
async function handlePublish(e) {
    e.preventDefault();
    
    if (!currentOrganizer) {
        showNotification('Please connect your JoyID wallet first', 'error');
        document.getElementById('connectWalletBtn').focus();
        return;
    }
    
    if (!ckbServiceReady) {
        showNotification('CKB Service not ready. Please refresh the page.', 'error');
        return;
    }
    
    try {
        // Generate event ID
        electionConfig.eventId = `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log('Publishing election:', electionConfig.eventId);
        
        // Show loading
        const publishBtn = document.getElementById('publishBtn');
        const originalText = publishBtn.innerHTML;
        publishBtn.disabled = true;
        publishBtn.innerHTML = '<div class="spinner-small"></div> Publishing to blockchain...';
        
        // Publish to blockchain
        const result = await window.VoteSecureBlockchain.publishEvent(
            electionConfig,
            currentOrganizer.address
        );
        
        if (result.success) {
            publishedEvent = result;
            showSuccessModal(result);
            console.log('✓ Election published successfully');
            
            // Refresh balance after transaction
            await refreshBalance();
        } else {
            throw new Error(result.error || 'Publication failed');
        }
        
        // Reset button
        publishBtn.disabled = false;
        publishBtn.innerHTML = originalText;
        
    } catch (error) {
        console.error('Publication failed:', error);
        
        let errorMsg = 'Failed to publish election';
        if (error.message) {
            if (error.message.includes('Insufficient')) {
                errorMsg = 'Insufficient balance. Please fund your wallet.';
            } else if (error.message.includes('rejected')) {
                errorMsg = 'Transaction rejected by user';
            } else {
                errorMsg = `Publication failed: ${error.message}`;
            }
        }
        
        showNotification(errorMsg, 'error');
        
        const publishBtn = document.getElementById('publishBtn');
        publishBtn.disabled = false;
        publishBtn.innerHTML = originalText;
    }
}

// ============================================================================
// SUCCESS MODAL
// ============================================================================

/**
 * Show success modal with published event details
 * @param {Object} result - Publication result
 */
function showSuccessModal(result) {
    document.getElementById('publishedEventId').textContent = result.event.eventId;
    document.getElementById('publishedUrl').textContent = result.eventUrl;
    
    // Show QR code
    const qrCodeDiv = document.getElementById('publishedQRCode');
    qrCodeDiv.innerHTML = `<img src="${result.qrCode}" alt="QR Code" style="width: 200px; height: 200px;">`;
    
    // Show invite key if applicable
    if (result.inviteMaterials.type === 'invite_key') {
        document.getElementById('inviteKeySection').style.display = 'block';
        document.getElementById('publishedInviteKey').textContent = result.inviteMaterials.inviteKey;
    }
    
    document.getElementById('successModal').style.display = 'flex';
}

/**
 * Close success modal
 */
function closeSuccessModal() {
    document.getElementById('successModal').style.display = 'none';
}

/**
 * Download invite materials
 */
function downloadInviteMaterials() {
    if (!publishedEvent) return;
    
    let content = `VoteSecure Election Invitation
================================

Election: ${electionConfig.title}
Event ID: ${publishedEvent.event.eventId}

Voter URL: ${publishedEvent.eventUrl}

`;
    
    if (publishedEvent.inviteMaterials.type === 'invite_key') {
        content += `Invite Key: ${publishedEvent.inviteMaterials.inviteKey}\n\n`;
    }
    
    if (publishedEvent.inviteMaterials.type === 'per_voter' && publishedEvent.inviteMaterials.voterKeys) {
        content += '\nPer-Voter Keys:\n';
        content += '===============\n\n';
        Object.entries(publishedEvent.inviteMaterials.voterKeys).forEach(([voterId, data]) => {
            content += `${data.email}: ${data.url}\n`;
        });
    }
    
    content += `\nSchedule:
- Voting starts: ${formatDateTime(electionConfig.schedule.startTime)}
- Voting ends: ${formatDateTime(electionConfig.schedule.endTime)}
- Results release: ${formatDateTime(electionConfig.schedule.resultsReleaseTime)}

Keep this information secure and distribute to authorized voters only.
`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `votesecure_invitation_${publishedEvent.event.eventId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================================================
// MY ELECTIONS
// ============================================================================

/**
 * Show my elections view
 */
function showMyElections() {
    if (!currentOrganizer) {
        showNotification('Please connect your wallet first', 'error');
        return;
    }
    
    document.getElementById('createView').style.display = 'none';
    document.getElementById('electionsListView').style.display = 'block';
    document.getElementById('successModal').style.display = 'none';
    
    loadMyElections();
}

/**
 * Show create view
 */
function showCreateView() {
    document.getElementById('createView').style.display = 'block';
    document.getElementById('electionsListView').style.display = 'none';
}

/**
 * Load organizer's elections
 */
function loadMyElections() {
    const events = window.VoteSecureBlockchain.getEventsByOrganizer(currentOrganizer.address);
    const container = document.getElementById('electionsList');
    
    if (events.length === 0) {
        container.innerHTML = '<p class="empty-state">No elections yet. Create your first election to get started.</p>';
        return;
    }
    
    container.innerHTML = events.map(event => {
        const now = Date.now();
        const status = getEventStatus(event.metadata.schedule, now);
        const stats = window.VoteSecureBlockchain.getLiveStatistics(event.eventId);
        
        return `
            <div class="election-card">
                <div class="election-card-header">
                    <h3>${escapeHtml(event.metadata.title)}</h3>
                    <span class="status-badge status-${status}">${status}</span>
                </div>
                
                <div class="election-card-body">
                    <div class="election-stat">
                        <span class="stat-label">Participants:</span>
                        <span class="stat-value">${stats?.uniqueVoters || 0}</span>
                    </div>
                    <div class="election-stat">
                        <span class="stat-label">Questions:</span>
                        <span class="stat-value">${event.metadata.questions.length}</span>
                    </div>
                    <div class="election-stat">
                        <span class="stat-label">Ends:</span>
                        <span class="stat-value">${formatDateTime(event.metadata.schedule.endTime)}</span>
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

/**
 * Get event status
 * @param {Object} schedule - Event schedule
 * @param {number} now - Current timestamp
 * @returns {string} Status
 */
function getEventStatus(schedule, now) {
    if (now < schedule.startTime) return 'upcoming';
    if (now >= schedule.startTime && now < schedule.endTime) return 'active';
    if (now >= schedule.endTime && now < schedule.resultsReleaseTime) return 'ended';
    return 'results_available';
}

/**
 * View election details
 * @param {string} eventId - Event ID
 */
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
- Start: ${formatDateTime(event.metadata.schedule.startTime)}
- End: ${formatDateTime(event.metadata.schedule.endTime)}
- Results Release: ${formatDateTime(event.metadata.schedule.resultsReleaseTime)}

Eligibility: ${formatEligibilityType(event.metadata.eligibility.type)}
    `.trim();
    
    console.log(details);
    showNotification('Event details logged to console (F12)', 'info');
}

/**
 * Copy voter URL to clipboard
 * @param {string} eventId - Event ID
 */
function copyVoterUrl(eventId) {
    const url = `${window.location.origin}/web/voter.html?event=${eventId}`;
    
    navigator.clipboard.writeText(url).then(() => {
        showNotification('Voter URL copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy:', err);
        prompt('Copy this URL:', url);
    });
}

/**
 * View live statistics
 * @param {string} eventId - Event ID
 */
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

/**
 * Release election results
 * @param {string} eventId - Event ID
 */
async function releaseResults(eventId) {
    if (!currentOrganizer) {
        showNotification('Please connect your wallet first', 'error');
        return;
    }
    
    const confirmed = confirm('Are you ready to release the results? This requires threshold confirmations.');
    if (!confirmed) return;
    
    try {
        console.log('Releasing results for:', eventId);
        
        const result = await window.VoteSecureBlockchain.releaseResults(eventId, currentOrganizer.address);
        
        if (result.success) {
            showNotification('Results released successfully!', 'success');
            loadMyElections();
            
            // Refresh balance
            await refreshBalance();
        } else {
            showNotification(result.message || 'Failed to release results', 'error');
        }
    } catch (error) {
        console.error('Result release failed:', error);
        showNotification(`Failed to release results: ${error.message}`, 'error');
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format datetime for input field
 * @param {Date} date - Date object
 * @returns {string} Formatted datetime string
 */
function formatDateTimeLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Format date and time for display
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Formatted date/time
 */
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

/**
 * Format eligibility type for display
 * @param {string} type - Eligibility type
 * @returns {string} Formatted type
 */
function formatEligibilityType(type) {
    const types = {
        'public': 'Public (anyone with link)',
        'invite_key': 'Invite Key Required',
        'per_voter': 'Per-Voter Keys',
        'curated_list': 'Curated Voter List'
    };
    return types[type] || type;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Copy text to clipboard
 * @param {string} elementId - ID of element containing text
 */
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
    
    if (event.reason?.message?.includes('User rejected')) {
        showNotification('Transaction cancelled by user', 'info');
    }
});

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

// Make functions available in console for debugging
// Make module functions accessible to inline HTML handlers AND keep the debug namespace
if (typeof window !== 'undefined') {
  // Keep your namespaced debug/export object
  window.VoteSecureOrganizer = {
    currentOrganizer,
    electionConfig,
    ckbServiceReady,
    refreshBalance,
    connectWallet,
    disconnectWallet,
    showNotification,
  };

  // Expose functions used by inline onclick="..."
  Object.assign(window, {
    // form navigation
    nextStep,
    previousStep,

    // question/option management
    addQuestion,
    removeQuestion,
    addOption,
    removeOption,
    updateQuestionType,

    // view switching
    showMyElections,
    showCreateView,

    // elections list actions
    viewElectionDetails,
    copyVoterUrl,
    viewLiveStats,
    releaseResults,

    // success modal + utilities
    closeSuccessModal,
    downloadInviteMaterials,
    copyToClipboard,
  });

  console.log('VoteSecure Organizer loaded successfully');
  console.log('Debug interface available at: window.VoteSecureOrganizer');
}
