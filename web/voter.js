/**
 * VoteSecure Voter Interface
 * Handles voter authentication, ballot submission, and verification
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let currentEvent = null;
let currentVoter = null;
let currentReceipt = null;
let votingHistory = [];

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Parse URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    const inviteKey = urlParams.get('key');
    const proofId = urlParams.get('proof');
    
    if (!eventId) {
        showError('No election ID provided. Please check your invitation link.');
        return;
    }
    
    // Load election
    await loadElection(eventId, inviteKey);
    
    // If proof parameter exists, show verification
    if (proofId) {
        showVerificationSection();
    }
    
    // Setup event listeners
    setupEventListeners();
});

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Wallet connection
    document.getElementById('connectWalletBtn').addEventListener('click', connectWallet);
    
    // Voting form submission
    document.getElementById('votingForm')?.addEventListener('submit', handleBallotSubmission);
    
    // Verification form
    document.getElementById('verificationForm')?.addEventListener('submit', handleVerification);
    
    // Reporting granularity changes
    document.querySelectorAll('input[name="reportingGranularity"]').forEach(radio => {
        radio.addEventListener('change', updateGroupingFields);
    });
}

// ============================================================================
// ELECTION LOADING
// ============================================================================

/**
 * Load election from blockchain
 * @param {string} eventId - Election ID
 * @param {string} inviteKey - Optional invite key
 */
async function loadElection(eventId, inviteKey) {
    try {
        showLoading();
        
        // Get event from blockchain
        const event = window.VoteSecureBlockchain.getEvent(eventId);
        
        if (!event) {
            showError('Election not found. Please check your invitation link.');
            return;
        }
        
        // Validate invite key if required
        if (event.metadata.eligibility.type === 'invite_key' && 
            inviteKey !== event.inviteMaterials.inviteKey) {
            showError('Invalid invite key. Please use the correct invitation link.');
            return;
        }
        
        currentEvent = event;
        
        // Check election status
        const now = Date.now();
        const status = getElectionStatus(event.metadata.schedule, now);
        
        // Render election interface
        renderElectionInterface(event, status);
        
        // Load live statistics
        updateLiveStats(eventId);
        
        // Show wallet prompt if not connected
        if (!currentVoter) {
            showWalletRequired();
        }
        
    } catch (error) {
        console.error('Failed to load election:', error);
        showError('Failed to load election. Please try again later.');
    }
}

/**
 * Get election status based on schedule
 * @param {Object} schedule - Election schedule
 * @param {number} now - Current timestamp
 * @returns {string} Status
 */
function getElectionStatus(schedule, now) {
    if (now < schedule.startTime) return 'upcoming';
    if (now >= schedule.startTime && now < schedule.endTime) return 'active';
    if (now >= schedule.endTime && now < schedule.resultsReleaseTime) return 'ended';
    return 'results_available';
}

// ============================================================================
// UI RENDERING
// ============================================================================

/**
 * Render election interface
 * @param {Object} event - Election event
 * @param {string} status - Election status
 */
function renderElectionInterface(event, status) {
    hideLoading();
    
    // Set title and description
    document.getElementById('electionTitle').textContent = event.metadata.title;
    document.getElementById('electionDescription').innerHTML = sanitizeAndRenderMarkdown(event.metadata.description);
    
    // Set status badge
    const statusBadge = document.getElementById('electionStatus');
    statusBadge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    statusBadge.className = `status-badge status-${status}`;
    
    // Set end time
    document.getElementById('electionEndTime').textContent = formatDateTime(event.metadata.schedule.endTime);
    
    // Render questions
    renderQuestions(event.metadata.questions);
    
    // Render grouping fields if needed
    if (event.metadata.reportingGranularity === 'by_group') {
        renderGroupingFields(event.metadata.groupingFields);
    }
    
    // Update limit info
    document.getElementById('updateLimitInfo').textContent = 
        `You can update your ballot ${event.metadata.allowedUpdates} time(s).`;
    
    // Show voting interface
    document.getElementById('votingInterface').style.display = 'block';
    
    // Show results if available
    if (status === 'results_available' && event.results && event.results.status === 'released') {
        renderResults(event);
    }
}

/**
 * Render questions and options
 * @param {Array} questions - Questions array
 */
function renderQuestions(questions) {
    const container = document.getElementById('questionsContainer');
    container.innerHTML = '';
    
    questions.forEach((question, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question-block';
        questionDiv.innerHTML = `
            <h3>Question ${index + 1}</h3>
            <p class="question-text">${escapeHtml(question.text)}</p>
            <div class="options-container" data-question-id="${question.id}" data-type="${question.type}">
                ${renderOptions(question)}
            </div>
        `;
        container.appendChild(questionDiv);
    });
}

/**
 * Render question options
 * @param {Object} question - Question object
 * @returns {string} HTML for options
 */
function renderOptions(question) {
    const inputType = question.type === 'single' ? 'radio' : 'checkbox';
    const inputName = question.type === 'single' ? `question_${question.id}` : '';
    
    return question.options.map(option => `
        <label class="option-label">
            <input type="${inputType}" 
                   name="${inputName}" 
                   value="${option.id}" 
                   data-question-id="${question.id}"
                   ${question.type === 'single' ? 'required' : ''}>
            <span>${escapeHtml(option.text)}</span>
        </label>
    `).join('');
}

/**
 * Render grouping fields
 * @param {Array} fields - Grouping field names
 */
function renderGroupingFields(fields) {
    const container = document.getElementById('groupingFieldsContainer');
    const fieldsDiv = document.getElementById('groupingFields');
    
    if (!fields || fields.length === 0) return;
    
    fieldsDiv.innerHTML = fields.map(field => `
        <div class="form-group">
            <label for="group_${field}">${formatFieldName(field)}</label>
            <input type="text" id="group_${field}" name="group_${field}" placeholder="Enter your ${formatFieldName(field).toLowerCase()}">
        </div>
    `).join('');
    
    container.style.display = 'block';
}

/**
 * Render election results
 * @param {Object} event - Election event
 */
function renderResults(event) {
    const container = document.getElementById('resultsContainer');
    const resultsSection = document.getElementById('resultsSection');
    
    if (!event.results || !event.results.results) return;
    
    let html = '<div class="results-grid">';
    
    // Render each question's results
    event.metadata.questions.forEach(question => {
        const questionResults = event.results.results[question.id];
        
        html += `
            <div class="result-card">
                <h3>${escapeHtml(question.text)}</h3>
                <div class="result-bars">
                    ${renderResultBars(question, questionResults)}
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    // Add group results if available
    if (event.metadata.reportingGranularity === 'by_group' && event.results.groupResults) {
        html += '<h3>Results by Group</h3>';
        html += renderGroupResults(event);
    }
    
    container.innerHTML = html;
    resultsSection.style.display = 'block';
}

/**
 * Render result bars for a question
 * @param {Object} question - Question object
 * @param {Object} results - Results for this question
 * @returns {string} HTML for result bars
 */
function renderResultBars(question, results) {
    const total = Object.values(results).reduce((sum, count) => sum + count, 0);
    
    return question.options.map(option => {
        const count = results[option.id] || 0;
        const percentage = total > 0 ? (count / total * 100).toFixed(1) : 0;
        
        return `
            <div class="result-bar">
                <div class="result-label">
                    <span>${escapeHtml(option.text)}</span>
                    <span class="result-count">${count} votes (${percentage}%)</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Render group results
 * @param {Object} event - Election event
 * @returns {string} HTML for group results
 */
function renderGroupResults(event) {
    let html = '<div class="group-results">';
    
    Object.entries(event.results.groupResults).forEach(([groupKey, groupData]) => {
        const displayName = groupKey === '_other_merged' ? 'Other (merged small groups)' : groupKey.replace(/_/g, ' - ');
        
        html += `
            <div class="group-result-card">
                <h4>${escapeHtml(displayName)} (${groupData._count} voters)</h4>
                <div class="group-questions">
        `;
        
        event.metadata.questions.forEach(question => {
            if (!groupData[question.id]) return;
            
            html += `<div class="group-question">
                <strong>${escapeHtml(question.text)}</strong>
                ${renderResultBars(question, groupData[question.id])}
            </div>`;
        });
        
        html += `</div></div>`;
    });
    
    html += '</div>';
    return html;
}

// ============================================================================
// WALLET CONNECTION
// ============================================================================

/**
 * Connect JoyID wallet
 */
async function connectWallet() {
    try {
        // Simulate JoyID connection (replace with actual JoyID SDK in production)
        const mockVoter = {
            id: `voter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            address: `ckb_mock_${Math.random().toString(36).substr(2, 12)}`,
            publicKey: await window.VoteSecureBlockchain.generateKeyPair().then(kp => kp.publicKey)
        };
        
        currentVoter = mockVoter;
        
        // Update UI
        document.getElementById('connectWalletBtn').textContent = 'Connected';
        document.getElementById('connectWalletBtn').disabled = true;
        document.getElementById('walletRequired').style.display = 'none';
        
        // Check for previous ballots
        await checkPreviousBallots();
        
        console.log('Wallet connected:', mockVoter);
    } catch (error) {
        console.error('Wallet connection failed:', error);
        alert('Failed to connect wallet. Please try again.');
    }
}

/**
 * Check if voter has previously voted
 */
async function checkPreviousBallots() {
    if (!currentVoter || !currentEvent) return;
    
    // Query blockchain for previous ballots
    const allVoterCells = window.VoteSecureBlockchain.getEvent(currentEvent.eventId);
    // In production, query actual cells by voter ID
    
    // For demo, check in-memory storage
    votingHistory = []; // Populate from blockchain
    
    if (votingHistory.length > 0) {
        const latest = votingHistory[votingHistory.length - 1];
        document.getElementById('previousBallot').style.display = 'block';
        document.getElementById('previousTimestamp').textContent = formatDateTime(latest.timestamp);
        document.getElementById('updatesUsed').textContent = `${votingHistory.length}/${currentEvent.metadata.allowedUpdates}`;
    }
}

// ============================================================================
// BALLOT SUBMISSION
// ============================================================================

/**
 * Handle ballot form submission
 * @param {Event} e - Submit event
 */
async function handleBallotSubmission(e) {
    e.preventDefault();
    
    if (!currentVoter) {
        alert('Please connect your wallet first.');
        return;
    }
    
    if (!currentEvent) {
        alert('Election not loaded. Please refresh the page.');
        return;
    }
    
    try {
        // Collect answers
        const answers = collectAnswers();
        
        // Collect grouping data
        const groupingData = collectGroupingData();
        
        // Create ballot
        const ballot = {
            eventId: currentEvent.eventId,
            voterId: currentVoter.id,
            voterPublicKey: currentVoter.publicKey,
            answers: answers,
            groupingData: groupingData,
            timestamp: Date.now()
        };
        
        // Show loading
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="spinner-small"></div> Submitting...';
        
        // Submit to blockchain
        const result = await window.VoteSecureBlockchain.submitBallot(ballot, currentVoter.id);
        
        if (result.success) {
            currentReceipt = result.receipt;
            showReceipt(result.receipt);
            votingHistory.push(ballot);
        } else {
            throw new Error(result.error);
        }
        
        // Reset button
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        
    } catch (error) {
        console.error('Ballot submission failed:', error);
        alert(`Failed to submit ballot: ${error.message}`);
        
        // Reset button
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
    }
}

/**
 * Collect answers from form
 * @returns {Array} Array of answers
 */
function collectAnswers() {
    const answers = [];
    const questionsContainers = document.querySelectorAll('.options-container');
    
    questionsContainers.forEach(container => {
        const questionId = container.dataset.questionId;
        const type = container.dataset.type;
        
        if (type === 'single') {
            const selected = container.querySelector('input:checked');
            if (selected) {
                answers.push({
                    questionId: questionId,
                    selectedOptions: selected.value
                });
            }
        } else {
            const selected = Array.from(container.querySelectorAll('input:checked'))
                .map(input => input.value);
            if (selected.length > 0) {
                answers.push({
                    questionId: questionId,
                    selectedOptions: selected
                });
            }
        }
    });
    
    return answers;
}

/**
 * Collect grouping data from form
 * @returns {Object} Grouping data
 */
function collectGroupingData() {
    const data = {};
    const groupingInputs = document.querySelectorAll('#groupingFields input');
    
    groupingInputs.forEach(input => {
        const fieldName = input.name.replace('group_', '');
        data[fieldName] = input.value.trim();
    });
    
    return data;
}

// ============================================================================
// RECEIPT DISPLAY
// ============================================================================

/**
 * Show ballot receipt modal
 * @param {Object} receipt - Receipt data
 */
function showReceipt(receipt) {
    document.getElementById('receiptCommitment').textContent = receipt.commitment;
    document.getElementById('receiptCellId').textContent = receipt.cellId;
    document.getElementById('receiptTimestamp').textContent = formatDateTime(receipt.timestamp);
    document.getElementById('receiptProofUrl').textContent = receipt.proofUrl;
    
    document.getElementById('receiptModal').style.display = 'flex';
}

/**
 * Close receipt modal
 */
function closeReceiptModal() {
    document.getElementById('receiptModal').style.display = 'none';
}

/**
 * Copy text to clipboard
 * @param {string} elementId - ID of element containing text
 */
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.textContent;
    
    navigator.clipboard.writeText(text).then(() => {
        // Show feedback
        const btn = element.nextElementSibling;
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    });
}

/**
 * Email receipt to voter
 */
function emailReceipt() {
    if (!currentReceipt) return;
    
    const email = prompt('Enter your email address:');
    if (!email) return;
    
    // In production, send via backend API
    const subject = encodeURIComponent('Your VoteSecure Ballot Receipt');
    const body = encodeURIComponent(`
Your ballot has been submitted successfully!

Event ID: ${currentReceipt.eventId}
Commitment Hash: ${currentReceipt.commitment}
Cell ID: ${currentReceipt.cellId}
Timestamp: ${formatDateTime(currentReceipt.timestamp)}

Verification URL: ${currentReceipt.proofUrl}

Keep this information safe to verify your vote later.
    `);
    
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
}

/**
 * Download receipt as text file
 */
function downloadReceipt() {
    if (!currentReceipt) return;
    
    const content = `VoteSecure Ballot Receipt
========================

Event ID: ${currentReceipt.eventId}
Commitment Hash: ${currentReceipt.commitment}
Cell ID: ${currentReceipt.cellId}
Timestamp: ${formatDateTime(currentReceipt.timestamp)}
Sequence: ${currentReceipt.sequence}

Verification URL: ${currentReceipt.proofUrl}

Keep this information safe to verify your vote later.
`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `votesecure_receipt_${currentReceipt.eventId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================================================
// VERIFICATION
// ============================================================================

/**
 * Show verification section
 */
function showVerificationSection() {
    document.getElementById('verificationSection').style.display = 'block';
}

/**
 * Handle verification form submission
 * @param {Event} e - Submit event
 */
async function handleVerification(e) {
    e.preventDefault();
    
    const commitment = document.getElementById('verifyCommitment').value.trim();
    
    if (!commitment) {
        alert('Please enter a commitment hash');
        return;
    }
    
    try {
        const result = window.VoteSecureBlockchain.verifyBallotInclusion(
            currentEvent.eventId,
            commitment
        );
        
        const resultDiv = document.getElementById('verificationResult');
        
        if (result.verified) {
            resultDiv.innerHTML = `
                <div class="success-message">
                    <h3>✓ Ballot Verified</h3>
                    <p>Your ballot has been successfully included in the election.</p>
                    <div class="verification-details">
                        <div><strong>Cell ID:</strong> ${result.cellId}</div>
                        <div><strong>Timestamp:</strong> ${formatDateTime(result.timestamp)}</div>
                        <div><strong>Sequence:</strong> ${result.sequence}</div>
                    </div>
                </div>
            `;
        } else {
            resultDiv.innerHTML = `
                <div class="error-message">
                    <h3>⚠️ Verification Failed</h3>
                    <p>${result.error}</p>
                </div>
            `;
        }
        
        resultDiv.style.display = 'block';
        
    } catch (error) {
        console.error('Verification failed:', error);
        alert('Verification failed. Please try again.');
    }
}

// ============================================================================
// LIVE STATISTICS
// ============================================================================

/**
 * Update live statistics
 * @param {string} eventId - Event ID
 */
function updateLiveStats(eventId) {
    const stats = window.VoteSecureBlockchain.getLiveStatistics(eventId);
    
    if (!stats) return;
    
    document.getElementById('participantCount').textContent = stats.uniqueVoters;
    
    // Update periodically
    setTimeout(() => updateLiveStats(eventId), 10000); // Every 10 seconds
}

// ============================================================================
// UI HELPERS
// ============================================================================

/**
 * Show loading state
 */
function showLoading() {
    document.getElementById('loadingState').style.display = 'flex';
    document.getElementById('errorState').style.display = 'none';
    document.getElementById('votingInterface').style.display = 'none';
}

/**
 * Hide loading state
 */
function hideLoading() {
    document.getElementById('loadingState').style.display = 'none';
}

/**
 * Show error state
 * @param {string} message - Error message
 */
function showError(message) {
    hideLoading();
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('errorState').style.display = 'block';
}

/**
 * Show wallet required prompt
 */
function showWalletRequired() {
    document.getElementById('walletRequired').style.display = 'block';
}

/**
 * Format date and time
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
 * Format field name for display
 * @param {string} fieldName - Field name
 * @returns {string} Formatted name
 */
function formatFieldName(fieldName) {
    return fieldName
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
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
 * Sanitize and render Markdown (simplified)
 * @param {string} markdown - Markdown text
 * @returns {string} HTML
 */
function sanitizeAndRenderMarkdown(markdown) {
    if (!markdown) return '';
    
    // Simple markdown rendering (use a proper library in production)
    let html = escapeHtml(markdown);
    
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    
    return html;
}