/**
 * VoteSecure Election Details Viewer
 * Displays comprehensive election information and results
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEBUG_LOG = true;
const USE_MAINNET = false;

// ============================================================================
// STATE
// ============================================================================

let currentEventId = null;
let currentEvent = null;
let ckbServiceReady = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    if (DEBUG_LOG) console.log('VoteSecure Election Details initializing...');
    
    // Get event ID from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    currentEventId = urlParams.get('eventId');
    
    // Setup form handler
    setupEventIdForm();
    
    // Wait for CKB Service
    waitForCKBService();
});

function waitForCKBService() {
    const checkService = () => {
        if (window.CKBService && typeof window.CKBService.getEvent === 'function') {
            ckbServiceReady = true;
            if (DEBUG_LOG) console.log('✓ CKB Service ready');
            
            // Load election if we have an event ID
            if (currentEventId) {
                loadElectionDetails(currentEventId);
            } else {
                showElectionIdInput();
            }
        } else {
            if (DEBUG_LOG) console.log('Waiting for CKB Service...');
            setTimeout(checkService, 100);
        }
    };
    checkService();
}

// ============================================================================
// EVENT ID FORM
// ============================================================================

function setupEventIdForm() {
    const form = document.getElementById('electionIdForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('electionIdInputField');
            const eventId = input.value.trim();
            if (eventId) {
                // Update URL and load election
                window.history.pushState({}, '', `?eventId=${eventId}`);
                currentEventId = eventId;
                loadElectionDetails(eventId);
            }
        });
    }
}

function showElectionIdInput() {
    hideAllSections();
    document.getElementById('electionIdInput').style.display = 'block';
}

// ============================================================================
// LOAD ELECTION DETAILS
// ============================================================================

async function loadElectionDetails(eventId) {
    try {
        hideAllSections();
        document.getElementById('loadingState').style.display = 'block';
        
        if (DEBUG_LOG) console.log('Fetching details for:', eventId);
        
        // Fetch complete event data from blockchain
        const event = await window.CKBService.getEvent(eventId);
        
        if (!event) {
            showError('Election not found on blockchain');
            return;
        }
        
        if (DEBUG_LOG) console.log('Event details:', event);
        
        currentEvent = event;
        displayElectionDetails(event);
        
    } catch (error) {
        console.error('Failed to load election details:', error);
        showError('Failed to load election details: ' + error.message);
    }
}

// ============================================================================
// DISPLAY FUNCTIONS
// ============================================================================

function displayElectionDetails(event) {
    hideAllSections();
    
    const container = document.getElementById('electionDetails');
    container.innerHTML = generateElectionDetailsHTML(event);
    container.style.display = 'block';
}

function generateElectionDetailsHTML(event) {
    const metadata = event.metadata || {};
    const result = event.result || {};
    const eventFund = event.eventFund || {};
    
    // Format dates
    const createdDate = metadata.createdAt ? 
        new Date(metadata.createdAt * 1000).toLocaleString() : 'Unknown';
    const startDate = event.schedule?.startTime ? 
        new Date(event.schedule.startTime * 1000).toLocaleString() : 'Not set';
    const endDate = event.schedule?.endTime ? 
        new Date(event.schedule.endTime * 1000).toLocaleString() : 'Not set';
    const resultsReleaseDate = event.schedule?.resultReleaseTime ? 
        new Date(event.schedule.resultReleaseTime * 1000).toLocaleString() : 'Not set';
    
    // Status badge
    const statusClass = event.status === 'active' ? 'status-active' : 
                       event.status === 'ended' ? 'status-ended' : 'status-pending';
    
    // Transaction info
    const txHash = event.cells?.metadata?.outPoint?.txHash;
    const blockNumber = event.cells?.metadata?.blockNumber;
    
    // Build HTML sections
    return `
        <div class="details-section">
            <div class="details-header">
                <h3>${escapeHtml(event.title || 'Untitled Election')}</h3>
                <span class="status-badge ${statusClass}">${event.status}</span>
            </div>
            
            ${event.description ? `
                <div class="details-description">
                    <p>${escapeHtml(event.description)}</p>
                </div>
            ` : ''}
        </div>
        
        <!-- Schedule Section -->
        <div class="details-section">
            <h4>📅 Schedule</h4>
            <div class="details-grid">
                <div class="detail-item">
                    <strong>Created:</strong>
                    <span>${createdDate}</span>
                </div>
                <div class="detail-item">
                    <strong>Voting Start:</strong>
                    <span>${startDate}</span>
                </div>
                <div class="detail-item">
                    <strong>Voting End:</strong>
                    <span>${endDate}</span>
                </div>
                <div class="detail-item">
                    <strong>Results Release:</strong>
                    <span>${resultsReleaseDate}</span>
                </div>
            </div>
        </div>
        
        <!-- Questions Section -->
        <div class="details-section">
            <h4>❓ Questions</h4>
            ${generateQuestionsHTML(event.questions || [])}
        </div>
        
        <!-- Results Section -->
        <div class="details-section">
            <h4>📊 Results</h4>
            ${generateResultsHTML(event, result)}
        </div>
        
        <!-- Settings Section -->
        <div class="details-section">
            <h4>⚙️ Settings</h4>
            <div class="details-grid">
                <div class="detail-item">
                    <strong>Eligibility:</strong>
                    <span>${metadata.eligibility?.mode || 'Not configured'}</span>
                </div>
                <div class="detail-item">
                    <strong>Anonymity Level:</strong>
                    <span>${metadata.anonymityLevel || 'Full'}</span>
                </div>
                <div class="detail-item">
                    <strong>Reporting:</strong>
                    <span>${metadata.reportingGranularity || 'Totals only'}</span>
                </div>
                <div class="detail-item">
                    <strong>Min Group Size:</strong>
                    <span>${metadata.minGroupSize || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <strong>Allowed Updates:</strong>
                    <span>${eventFund.allowedUpdates || 0} per voter</span>
                </div>
                <div class="detail-item">
                    <strong>Live Stats Mode:</strong>
                    <span>${metadata.liveStatsMode || 'Hidden'}</span>
                </div>
            </div>
        </div>
        
        <!-- Event Fund Section -->
        <div class="details-section">
            <h4>💰 Event Fund</h4>
            <div class="details-grid">
                <div class="detail-item">
                    <strong>Initial Funds:</strong>
                    <span>${formatCapacity(eventFund.initialFunds)} CKB</span>
                </div>
                <div class="detail-item">
                    <strong>Remaining Funds:</strong>
                    <span>${formatCapacity(eventFund.remainingFunds)} CKB</span>
                </div>
                <div class="detail-item">
                    <strong>Funds Used:</strong>
                    <span>${formatCapacity((eventFund.initialFunds || 0) - (eventFund.remainingFunds || 0))} CKB</span>
                </div>
            </div>
        </div>
        
        <!-- Blockchain Info Section -->
        <div class="details-section">
            <h4>⛓️ Blockchain Information</h4>
            <div class="details-grid">
                <div class="detail-item">
                    <strong>Event ID:</strong>
                    <code onclick="copyToClipboard('${event.eventId}')" title="Click to copy">${event.eventId}</code>
                </div>
                ${txHash ? `
                    <div class="detail-item">
                        <strong>Transaction Hash:</strong>
                        <code onclick="copyToClipboard('${txHash}')" title="Click to copy">${txHash.slice(0, 20)}...</code>
                    </div>
                ` : ''}
                ${blockNumber ? `
                    <div class="detail-item">
                        <strong>Block Number:</strong>
                        <span>${blockNumber}</span>
                    </div>
                ` : ''}
                ${txHash ? `
                    <div class="detail-item">
                        <strong>Explorer Link:</strong>
                        <a href="${getExplorerUrl(txHash)}" target="_blank" rel="noopener noreferrer" class="explorer-link">
                            View on CKB Explorer →
                        </a>
                    </div>
                ` : ''}
            </div>
        </div>
        
        <!-- Voter Link Section -->
        <div class="details-section">
            <h4>🔗 Share with Voters</h4>
            <div class="voter-link-section">
                <input 
                    type="text" 
                    readonly 
                    value="${getVoterUrl(event.eventId)}"
                    class="voter-link-input"
                    id="voterLinkInput"
                >
                <button 
                    class="btn btn-primary" 
                    onclick="copyVoterLink()">
                    📋 Copy Link
                </button>
            </div>
        </div>
        
        <!-- Action Buttons -->
        <div class="action-buttons">
            <a href="voter.html?event=${event.eventId}" class="btn btn-primary">
                🗳️ Vote in This Election
            </a>
            <a href="organizer.html" class="btn btn-secondary">
                Back to Dashboard
            </a>
        </div>
    `;
}

/**
 * Generate HTML for questions and options
 */
function generateQuestionsHTML(questions) {
    if (!questions || questions.length === 0) {
        return '<p class="no-data">No questions configured</p>';
    }
    
    return questions.map((q, index) => `
        <div class="question-item">
            <div class="question-title">
                <strong>Question ${index + 1}:</strong> ${escapeHtml(q.text || q.question || 'Untitled Question')}
            </div>
            <div class="question-type">
                Type: ${q.type === 'single' ? 'Single Choice' : 'Multiple Choice'}
            </div>
            <div class="question-options">
                <strong>Options:</strong>
                <ul>
                    ${(q.options || []).map((opt, i) => `
                        <li>${escapeHtml(opt.text || opt || `Option ${i + 1}`)}</li>
                    `).join('')}
                </ul>
            </div>
        </div>
    `).join('');
}

/**
 * Generate HTML for results (if available)
 */
function generateResultsHTML(event, result) {
    // Check if voting has ended
    const now = Math.floor(Date.now() / 1000);
    const votingEnded = event.schedule?.endTime && now > event.schedule.endTime;
    
    if (!votingEnded) {
        return `
            <div class="results-pending">
                <p>⏳ Voting is still in progress. Results will be available after ${
                    new Date(event.schedule.endTime * 1000).toLocaleString()
                }</p>
            </div>
        `;
    }
    
    // Check if results are released
    if (!result || !result.results) {
        const resultReleaseTime = event.schedule?.resultReleaseTime;
        const resultsScheduled = resultReleaseTime && now < resultReleaseTime;
        
        return `
            <div class="results-pending">
                <p>🔒 Results are ${resultsScheduled ? 'scheduled for release on' : 'not yet released'}</p>
                ${resultsScheduled ? `
                    <p><strong>Release Date:</strong> ${new Date(resultReleaseTime * 1000).toLocaleString()}</p>
                ` : ''}
            </div>
        `;
    }
    
    // Display results
    const results = result.results;
    const releasedAt = result.releasedAt ? 
        new Date(result.releasedAt * 1000).toLocaleString() : 'Unknown';
    
    return `
        <div class="results-released">
            <p class="results-header">✅ Results Released: ${releasedAt}</p>
            ${generateResultsDataHTML(results, event.questions)}
        </div>
    `;
}

/**
 * Generate HTML for actual vote results data
 */
function generateResultsDataHTML(results, questions) {
    if (typeof results === 'object' && !Array.isArray(results)) {
        // Results by question
        return Object.keys(results).map((questionKey, qIndex) => {
            const questionResults = results[questionKey];
            const question = questions?.[qIndex];
            
            return `
                <div class="result-item">
                    <h5>Question ${qIndex + 1}: ${escapeHtml(question?.text || question?.question || questionKey)}</h5>
                    <div class="result-chart">
                        ${generateResultBarsHTML(questionResults, question)}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    return '<p class="no-data">Results format not recognized</p>';
}

/**
 * Generate result bars for visualization
 */
function generateResultBarsHTML(questionResults, question) {
    if (!questionResults || typeof questionResults !== 'object') {
        return '<p class="no-data">No results available</p>';
    }
    
    // Calculate total votes
    const votes = Object.values(questionResults);
    const totalVotes = votes.reduce((sum, count) => sum + (typeof count === 'number' ? count : 0), 0);
    
    if (totalVotes === 0) {
        return '<p class="no-data">No votes recorded</p>';
    }
    
    // Generate bars
    return Object.entries(questionResults).map(([optionKey, count]) => {
        const percentage = totalVotes > 0 ? ((count / totalVotes) * 100).toFixed(1) : 0;
        const option = question?.options?.find(o => o.id === optionKey || o.text === optionKey);
        const optionText = option?.text || option || optionKey;
        
        return `
            <div class="result-bar-container">
                <div class="result-bar-label">
                    <span class="option-name">${escapeHtml(optionText)}</span>
                    <span class="vote-count">${count} votes (${percentage}%)</span>
                </div>
                <div class="result-bar-track">
                    <div class="result-bar-fill" style="width: ${percentage}%">${percentage}%</div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format capacity (shannons to CKB)
 */
function formatCapacity(shannons) {
    if (!shannons) return '0';
    const ckb = Number(shannons) / 100000000;
    return ckb.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Get voter URL
 */
function getVoterUrl(eventId) {
    const baseUrl = window.location.origin;
    const path = window.location.pathname.includes('/web/') ? '/web' : '';
    return `${baseUrl}${path}/voter.html?event=${eventId}`;
}

/**
 * Get explorer URL
 */
function getExplorerUrl(txHash) {
    return USE_MAINNET
        ? `https://explorer.nervos.org/transaction/${txHash}`
        : `https://testnet.explorer.nervos.org/transaction/${txHash}`;
}

/**
 * Copy to clipboard
 */
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy:', err);
        showNotification('Failed to copy', 'error');
    });
}

/**
 * Copy voter link
 */
function copyVoterLink() {
    const input = document.getElementById('voterLinkInput');
    if (input) {
        copyToClipboard(input.value);
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show error state
 */
function showError(message) {
    hideAllSections();
    const errorState = document.getElementById('errorState');
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorState.style.display = 'block';
}

/**
 * Hide all sections
 */
function hideAllSections() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('electionIdInput').style.display = 'none';
    document.getElementById('errorState').style.display = 'none';
    document.getElementById('electionDetails').style.display = 'none';
}

/**
 * Show notification (simple version)
 */
function showNotification(message, type = 'info') {
    // Simple alert for now - can be enhanced with a toast notification system
    const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
    console.log(`${icon} ${message}`);
    
    // Create a simple toast
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#6366f1'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
