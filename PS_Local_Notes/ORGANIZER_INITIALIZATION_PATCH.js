/**
 * ORGANIZER.JS INITIALIZATION PATCH
 * Fix for "Waiting for CKB Service..." infinite loop
 * 
 * Replace the initialization section in organizer.js (lines 35-98) with this code
 */

// Enhanced initialization with better error handling
document.addEventListener('DOMContentLoaded', () => {
    console.log('VoteSecure Organizer initializing...');
    
    // Initialize UI first (doesn't depend on blockchain)
    addQuestion();
    setupEventListeners();
    setDefaultDates();
    checkPreviousConnection();
    
    // Then wait for blockchain services with timeout
    waitForBlockchainServices();
});

/**
 * Wait for both CKB Service Bridge and Blockchain Module
 * with timeout and fallback handling
 */
function waitForBlockchainServices() {
    const MAX_WAIT_TIME = 15000; // 15 seconds max
    const CHECK_INTERVAL = 200; // Check every 200ms
    let totalWaitTime = 0;
    
    const checkServices = () => {
        const hasCKBService = window.CKBService && 
                              typeof window.CKBService.connectJoyID === 'function' &&
                              window.CKBService.config?.VOTESECURE_CONFIG;
        
        const hasBlockchainAPI = window.VoteSecureBlockchain && 
                                 typeof window.VoteSecureBlockchain.connectJoyID === 'function';
        
        if (hasCKBService && hasBlockchainAPI) {
            // Both ready!
            ckbServiceReady = true;
            console.log('✓ CKB Service Bridge ready');
            console.log('✓ Blockchain API ready');
            console.log('✓ VoteSecure Lockscript Config loaded');
            console.log('  Code Hash:', window.CKBService.config.VOTESECURE_CONFIG.lockscript.codeHash);
            updateServiceStatus('ready');
            
            // Try auto-reconnect if session exists
            const savedAddress = sessionStorage.getItem('joyid_address');
            if (savedAddress) {
                console.log('Found previous session, attempting reconnect...');
            }
            
        } else if (totalWaitTime >= MAX_WAIT_TIME) {
            // Timeout - show error but allow UI to function
            console.error('TIMEOUT: Blockchain services failed to load after 15 seconds');
            console.error('CKBService ready:', hasCKBService);
            console.error('BlockchainAPI ready:', hasBlockchainAPI);
            
            // Check what files are loaded
            if (!window.CKBService) {
                console.error('ERROR: ckbServiceBridge.js not loaded - check script tag');
            }
            if (!window.VoteSecureBlockchain) {
                console.error('ERROR: blockchain.js not loaded - check script tag');
            }
            
            ckbServiceReady = false;
            updateServiceStatus('error');
            
            // Show user-friendly error
            showInitializationError(
                'Blockchain services failed to load. ' +
                'Check console for errors. ' +
                'Ensure ckbServiceBridge.js and blockchain.js are loaded in correct order.'
            );
            
        } else {
            // Still waiting
            totalWaitTime += CHECK_INTERVAL;
            
            // Log progress every 2 seconds
            if (totalWaitTime % 2000 < CHECK_INTERVAL) {
                console.log(`Waiting for blockchain services... (${Math.round(totalWaitTime / 1000)}s)`);
                updateServiceStatus('loading');
            }
            
            setTimeout(checkServices, CHECK_INTERVAL);
        }
    };
    
    // Start checking
    checkServices();
}

/**
 * Show initialization error to user
 */
function showInitializationError(message) {
    const errorDiv = document.getElementById('service-status') || 
                     document.querySelector('.status-indicator');
    
    if (errorDiv) {
        errorDiv.innerHTML = `
            <div style="
                background-color: #fee;
                border: 2px solid #c00;
                color: #c00;
                padding: 15px;
                border-radius: 5px;
                font-family: monospace;
            ">
                ⚠️ <strong>Initialization Error</strong><br/>
                ${message}<br/>
                <small>Check browser console (F12) for details</small>
            </div>
        `;
    }
    
    console.error('[INIT ERROR]', message);
}

/**
 * Update service status indicator
 */
function updateServiceStatus(status) {
    const statusElement = document.getElementById('service-status');
    
    if (!statusElement) {
        return; // Status element doesn't exist yet, skip
    }
    
    const statusColor = {
        'loading': '#ff9800',   // Orange
        'ready': '#4caf50',     // Green
        'error': '#f44336'      // Red
    };
    
    const statusText = {
        'loading': 'Connecting to blockchain...',
        'ready': 'Connected to CKB network',
        'error': 'Failed to connect to blockchain'
    };
    
    statusElement.style.color = statusColor[status] || '#999';
    statusElement.textContent = statusText[status] || 'Unknown status';
    
    // Add visual indicator
    const indicator = statusElement.querySelector('.indicator');
    if (indicator) {
        indicator.style.backgroundColor = statusColor[status];
    }
}

/**
 * Enhanced error handler for global JavaScript errors
 */
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    
    // Handle BigInt errors specifically
    if (event.error && event.error.message && 
        event.error.message.includes('BigInt')) {
        console.error('BigInt Error - ensure all BigInt operations use explicit conversions');
        console.error('Example fix: BigInt(61) * BigInt(100000000) instead of 61 * 100000000n');
        
        showInitializationError(
            'BigInt conversion error in blockchain module. ' +
            'This is a code error - check console for details.'
        );
    }
    
    return false; // Don't prevent default error handling
});

/**
 * Enhanced unhandled promise rejection handler
 */
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    if (event.reason && event.reason.message && 
        event.reason.message.includes('BigInt')) {
        showInitializationError(
            'BigInt error in async operation. Check console for full error.'
        );
    }
});

/**
 * Debug function - call this in console if services aren't loading
 */
window.debugBlockchainServices = function() {
    console.group('=== Blockchain Services Debug ===');
    
    console.log('CKBService loaded:', !!window.CKBService);
    if (window.CKBService) {
        console.log('  - connectJoyID:', typeof window.CKBService.connectJoyID);
        console.log('  - getLockscriptConfig:', typeof window.CKBService.getLockscriptConfig);
        console.log('  - VOTESECURE_CONFIG:', window.CKBService.config?.VOTESECURE_CONFIG ? 'loaded' : 'missing');
        if (window.CKBService.config?.VOTESECURE_CONFIG) {
            console.log('    - Code Hash:', window.CKBService.config.VOTESECURE_CONFIG.lockscript.codeHash);
        }
    }
    
    console.log('VoteSecureBlockchain loaded:', !!window.VoteSecureBlockchain);
    if (window.VoteSecureBlockchain) {
        console.log('  - connectJoyID:', typeof window.VoteSecureBlockchain.connectJoyID);
        console.log('  - publishEvent:', typeof window.VoteSecureBlockchain.publishEvent);
        console.log('  - CAPACITY_CKB:', window.VoteSecureBlockchain.CAPACITY_CKB);
    }
    
    console.log('organizer.js state:');
    console.log('  - ckbServiceReady:', ckbServiceReady);
    console.log('  - currentOrganizer:', currentOrganizer);
    
    console.groupEnd();
};

// Make debug function available immediately
console.log('✓ Initialization code loaded. Call window.debugBlockchainServices() for debug info.');

// Also provide a ready check promise for external code
window.waitForBlockchainReady = new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
        if (window.CKBService && window.VoteSecureBlockchain && ckbServiceReady) {
            clearInterval(checkInterval);
            resolve({
                CKBService: window.CKBService,
                Blockchain: window.VoteSecureBlockchain
            });
        }
    }, 100);
    
    // Reject after 20 seconds
    setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Blockchain services failed to load'));
    }, 20000);
});

// Example usage:
// window.waitForBlockchainReady
//     .then(({ CKBService, Blockchain }) => {
//         console.log('Ready to use blockchain services');
//     })
//     .catch(err => {
//         console.error('Failed to initialize:', err);
//     });
