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
    if (DEBUG_LOG) {
        console.log('=== VOTESECURE ELECTION DETAILS VIEWER ===');
        console.log('Initializing...');
        console.log('DEBUG_LOG enabled');
    }

    // Get event ID from URL parameter (support both 'event' and 'eventId')
    const urlParams = new URLSearchParams(window.location.search);
    currentEventId = urlParams.get('event') || urlParams.get('eventId');

    if (DEBUG_LOG) {
        console.log('URL Parameters:', window.location.search);
        console.log('Event ID from URL:', currentEventId || '(none)');
    }

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

        if (DEBUG_LOG) {
            console.log('=== LOADING ELECTION DETAILS ===');
            console.log('Event ID:', eventId);
            console.log('Fetching from blockchain...');
        }
        
        // Fetch complete event data from blockchain
        const event = await window.CKBService.getEvent(eventId);
        
        if (!event) {
            if (DEBUG_LOG) console.error('❌ Event not found on blockchain');
            showError('Election not found on blockchain');
            return;
        }
        
        if (DEBUG_LOG) {
            console.log('=== EVENT DETAILS RETRIEVED ===');
            console.log('Full event object:', event);
            console.log('Event ID:', event.eventId);
            console.log('Title:', event.title);
            console.log('Status:', event.status);
            console.log('Metadata:', event.metadata);
            console.log('Eligibility:', event.eligibility);
            console.log('Metadata eligibility:', event.metadata?.eligibility);
            console.log('Schedule:', event.schedule);
            console.log('Questions:', event.questions);
            console.log('Event Fund:', event.eventFund);
            console.log('Cells:', event.cells);
            console.log('Result:', event.result);
            console.log('===============================');
        }

        currentEvent = event;

        // Load participation statistics
        let participationStats = null;
        try {
            if (DEBUG_LOG) console.log('Loading participation statistics...');
            participationStats = await window.CKBService.getParticipationStats(eventId);
            if (DEBUG_LOG) console.log('Participation stats:', participationStats);
        } catch (statsError) {
            if (DEBUG_LOG) console.warn('Failed to load participation stats:', statsError);
        }

        displayElectionDetails(event, participationStats);

    } catch (error) {
        if (DEBUG_LOG) {
            console.error('=== ERROR LOADING ELECTION DETAILS ===');
            console.error('Error object:', error);
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
            console.error('=====================================');
        }
        console.error('Failed to load election details:', error);
        showError('Failed to load election details: ' + error.message);
    } finally {
        document.getElementById('loadingState').style.display = 'none';
    }
}

// ============================================================================
// DISPLAY FUNCTIONS
// ============================================================================

function displayElectionDetails(event, participationStats = null) {
    if (DEBUG_LOG) {
        console.log('=== DISPLAYING ELECTION DETAILS ===');
        console.log('Rendering HTML for event:', event.eventId);
        console.log('Participation stats:', participationStats);
    }

    hideAllSections();

    const container = document.getElementById('electionDetails');
    container.innerHTML = generateElectionDetailsHTML(event, participationStats);
    container.style.display = 'block';

    if (DEBUG_LOG) {
        console.log('✓ Election details displayed successfully');
    }
}

function generateElectionDetailsHTML(event, participationStats = null) {
    const metadata = event.metadata || {};
    const result = event.result || {};
    const eventFund = event.eventFund || {};

    // Get eligibility from either event.eligibility or event.metadata.eligibility
    const eligibility = event.eligibility || metadata.eligibility || {};

    if (DEBUG_LOG) {
        console.log('=== GENERATING ELECTION DETAILS HTML ===');
        console.log('Eligibility data:', eligibility);
        console.log('Eligibility type:', eligibility.type);
        console.log('Eligibility mode:', eligibility.mode);
        console.log('Eligibility voters:', eligibility.voters);
    }

    // Format dates
    const createdDate = metadata.createdAt ?
        new Date(metadata.createdAt * 1000).toLocaleString() : 'Unknown';
    const startDate = event.schedule?.startTime ?
        new Date(event.schedule.startTime * 1000).toLocaleString() : 'Not set';
    const endDate = event.schedule?.endTime ?
        new Date(event.schedule.endTime * 1000).toLocaleString() : 'Not set';
    const resultsReleaseDate = event.schedule?.resultsReleaseTime ?
        new Date(event.schedule.resultsReleaseTime * 1000).toLocaleString() : 'Not set';
    const auditEndDate = event.schedule?.auditEndTime ?
        new Date(event.schedule.auditEndTime * 1000).toLocaleString() : 'Not set';

    // Status badge
    const statusClass = event.status === 'active' ? 'status-active' :
                       event.status === 'ended' ? 'status-ended' : 'status-pending';

    // Transaction info
    const txHash = event.cells?.metadata?.outPoint?.txHash;
    const blockNumber = event.cells?.metadata?.blockNumber;

    // Format eligibility display
    let eligibilityDisplay = 'Not configured';
    if (eligibility.type) {
        const type = eligibility.type;
        if (type === 'open') {
            eligibilityDisplay = 'Open (Anyone can vote)';
        } else if (type === 'whitelist' || type === 'voter_list') {
            const voterCount = eligibility.voters?.length || 0;
            eligibilityDisplay = `Whitelist (${voterCount} registered voters)`;
        } else if (type === 'token_holder') {
            eligibilityDisplay = `Token Holder (${eligibility.tokenType || 'Unknown token'})`;
        } else if (type === 'nft_holder') {
            eligibilityDisplay = `NFT Holder (${eligibility.nftCollection || 'Unknown collection'})`;
        } else {
            eligibilityDisplay = type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');
        }
    } else if (eligibility.mode) {
        eligibilityDisplay = eligibility.mode.charAt(0).toUpperCase() + eligibility.mode.slice(1).replace('_', ' ');
    }

    if (DEBUG_LOG) {
        console.log('Formatted eligibility display:', eligibilityDisplay);
        console.log('======================================');
    }
    
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
                <div class="detail-item">
                    <strong>Audit End:</strong>
                    <span>${auditEndDate}</span>
                </div>
            </div>
        </div>

        <!-- Participation Section -->
        ${generateParticipationHTML(participationStats)}

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
                    <span>${eligibilityDisplay}</span>
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
        
        <!-- Withdrawal Section -->
        ${generateWithdrawalSectionHTML(event)}

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
 * Generate withdrawal section HTML
 */
function generateWithdrawalSectionHTML(event) {
    const now = Math.floor(Date.now() / 1000);
    const auditEndTime = event.schedule?.auditEndTime;
    const remainingFunds = event.eventFund?.remainingFunds || 0;
    const remainingCKB = (remainingFunds / 100000000).toFixed(2);

    if (!auditEndTime || remainingFunds === 0) {
        return ''; // No withdrawal section needed
    }

    const withdrawAvailable = now >= auditEndTime;

    if (withdrawAvailable) {
        return `
            <div class="details-section">
                <h4>💰 Withdrawal Available</h4>
                <div class="withdrawal-notice" style="padding: 16px; background: #d4edda; border: 2px solid #28a745; border-radius: 8px;">
                    <p style="margin: 0 0 12px 0; color: #155724; font-weight: 600;">
                        ✓ The audit period has ended. Funds are available for withdrawal.
                    </p>
                    <div class="details-grid">
                        <div class="detail-item">
                            <strong>Remaining Funds:</strong>
                            <span style="color: #28a745; font-size: 18px; font-weight: bold;">${remainingCKB} CKB</span>
                        </div>
                        <div class="detail-item">
                            <strong>Audit End Date:</strong>
                            <span>${new Date(auditEndTime * 1000).toLocaleString()}</span>
                        </div>
                    </div>
                    <div style="margin-top: 16px;">
                        <button
                            onclick="initiateWithdrawal('${event.eventId}')"
                            class="btn btn-primary"
                            style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); width: 100%;">
                            💸 Withdraw ${remainingCKB} CKB to Organizer Wallet
                        </button>
                        <p style="margin: 12px 0 0 0; font-size: 13px; color: #666;">
                            ⓘ This will consume all event cells and return funds to your wallet.
                        </p>
                    </div>
                </div>
            </div>
        `;
    } else {
        const timeRemaining = auditEndTime - now;
        const days = Math.floor(timeRemaining / 86400);
        const hours = Math.floor((timeRemaining % 86400) / 3600);
        const minutes = Math.floor((timeRemaining % 3600) / 60);

        let timeString = '';
        if (days > 0) timeString = `${days} day${days > 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''}`;
        else if (hours > 0) timeString = `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
        else timeString = `${minutes} minute${minutes !== 1 ? 's' : ''}`;

        return `
            <div class="details-section">
                <h4>💰 Fund Withdrawal</h4>
                <div class="withdrawal-pending" style="padding: 16px; background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px;">
                    <p style="margin: 0 0 12px 0; color: #856404; font-weight: 600;">
                        ⏳ Withdrawal will be available after the audit period ends
                    </p>
                    <div class="details-grid">
                        <div class="detail-item">
                            <strong>Remaining Funds:</strong>
                            <span style="font-size: 18px; font-weight: bold;">${remainingCKB} CKB</span>
                        </div>
                        <div class="detail-item">
                            <strong>Audit End Date:</strong>
                            <span>${new Date(auditEndTime * 1000).toLocaleString()}</span>
                        </div>
                        <div class="detail-item">
                            <strong>Time Until Withdrawal:</strong>
                            <span style="color: #ffc107; font-weight: bold;">${timeString}</span>
                        </div>
                    </div>
                    <p style="margin: 12px 0 0 0; font-size: 13px; color: #666;">
                        ⓘ Funds can be withdrawn after ${new Date(auditEndTime * 1000).toLocaleString()}
                    </p>
                </div>
            </div>
        `;
    }
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
 * Generate HTML for participation statistics
 */
function generateParticipationHTML(participationStats) {
    if (!participationStats) {
        return `
            <div class="details-section">
                <h4>👥 Participation</h4>
                <p class="no-data">Loading participation data...</p>
            </div>
        `;
    }

    const { totalVotes, hasGrouping, groupBreakdown } = participationStats;

    let groupHTML = '';
    if (hasGrouping && groupBreakdown.length > 0) {
        groupHTML = `
            <div class="group-breakdown" style="margin-top: 16px;">
                <strong style="display: block; margin-bottom: 12px;">Votes by Group:</strong>
                <div class="details-grid">
                    ${groupBreakdown.map(group => {
                        const groupLabel = Object.entries(group.groupData)
                            .map(([key, value]) => `${key}: ${value}`)
                            .join(', ');
                        return `
                            <div class="detail-item">
                                <strong>${escapeHtml(groupLabel)}:</strong>
                                <span>${group.count} vote${group.count !== 1 ? 's' : ''}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    return `
        <div class="details-section">
            <h4>👥 Participation</h4>
            <div class="participation-stats">
                <div class="stat-highlight" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 12px; margin-bottom: 16px;">
                    <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">Total Votes Submitted</div>
                    <div style="font-size: 48px; font-weight: bold; line-height: 1;">${totalVotes}</div>
                    <div style="font-size: 13px; opacity: 0.8; margin-top: 8px;">
                        ${totalVotes === 0 ? 'No votes yet' : totalVotes === 1 ? '1 ballot submitted' : `${totalVotes} ballots submitted`}
                    </div>
                </div>
                ${groupHTML}
            </div>
        </div>
    `;
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
 * Initiate withdrawal process
 */
async function initiateWithdrawal(eventId) {
    if (DEBUG_LOG) {
        console.log('=== INITIATING WITHDRAWAL ===');
        console.log('Event ID:', eventId);
    }

    try {
        // Check if user has connected wallet
        if (!window.CKBService || !window.CKBService.checkJoyIDSession) {
            showNotification('Please connect your wallet first', 'error');
            // Redirect to organizer page
            setTimeout(() => {
                window.location.href = `organizer.html`;
            }, 2000);
            return;
        }

        // Check for existing session
        const session = await window.CKBService.checkJoyIDSession();
        if (!session || !session.address) {
            showNotification('Please connect your wallet on the organizer dashboard', 'info');
            // Redirect to organizer page
            setTimeout(() => {
                window.location.href = `organizer.html`;
            }, 2000);
            return;
        }

        if (DEBUG_LOG) {
            console.log('User session:', session.address);
        }

        // Load event data
        const event = await window.CKBService.getEvent(eventId);
        if (!event) {
            showNotification('Event not found', 'error');
            return;
        }

        // Verify audit period has ended
        const now = Math.floor(Date.now() / 1000);
        const auditEndTime = event.schedule?.auditEndTime;

        if (!auditEndTime || now < auditEndTime) {
            showNotification('Audit period has not ended yet', 'warning');
            return;
        }

        // Calculate withdrawal amount
        const remainingFunds = event.eventFund?.remainingFunds || 0;
        const remainingCKB = (remainingFunds / 100000000).toFixed(2);

        if (remainingFunds === 0) {
            showNotification('No funds available for withdrawal', 'info');
            return;
        }

        // Confirm withdrawal
        const confirmed = confirm(
            `Withdraw Event Funds\n\n` +
            `This will:\n` +
            `• Withdraw ${remainingCKB} CKB from EventFund\n` +
            `• Clean up Metadata cell\n` +
            `• Clean up Result cell\n` +
            `• Return all capacity to your wallet\n\n` +
            `The event will be permanently closed.\n\n` +
            `Continue?`
        );

        if (!confirmed) {
            return;
        }

        showNotification('Processing withdrawal transaction...', 'info');

        // Execute withdrawal
        if (!window.CKBService.withdrawEventFunds) {
            showNotification('Withdrawal service not available', 'error');
            return;
        }

        const result = await window.CKBService.withdrawEventFunds(
            eventId,
            session.address,
            event
        );

        if (result.success) {
            if (DEBUG_LOG) {
                console.log('=== WITHDRAWAL SUCCESS ===');
                console.log('Transaction hash:', result.txHash);
                console.log('Amount withdrawn:', result.amount);
                console.log('==========================');
            }

            showNotification(
                `✓ Withdrawal successful! ${(result.amount / 100000000).toFixed(2)} CKB returned to your wallet.`,
                'success'
            );

            // Reload page after 3 seconds
            setTimeout(() => {
                window.location.reload();
            }, 3000);
        } else {
            showNotification(`Withdrawal failed: ${result.error}`, 'error');
        }

    } catch (error) {
        console.error('=== WITHDRAWAL FAILED ===');
        console.error('Error:', error);
        console.error('Error message:', error.message);
        console.error('========================');

        showNotification(`Withdrawal failed: ${error.message}`, 'error');
    }
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
