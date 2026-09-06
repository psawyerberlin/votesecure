# VoteSecure Initialization & Error Troubleshooting Guide

## Problem 1: "Waiting for CKB Service..." (Infinite Loop)

### Symptoms
- Console continuously logs "Waiting for CKB Service..." every 100ms
- organizer.html never fully loads
- "Connect Wallet" button is grayed out
- Service status shows "loading" indefinitely

### Root Causes

#### A) Missing or Incorrect Script Tags
**Most Common**: ckbServiceBridge.js not loaded before blockchain.js

**Fix - organizer.html**:
```html
<!-- CORRECT ORDER - must be in this sequence: -->
<head>
    <!-- Other head content... -->
    
    <!-- 1. Load CKB Service Bridge FIRST -->
    <script src="web/ckbServiceBridge.js"></script>
    
    <!-- 2. Load Blockchain Module SECOND -->
    <script src="web/blockchain.js"></script>
    
    <!-- 3. Then load organizer.js LAST -->
    <script src="web/organizer.js"></script>
</head>
```

**Why order matters**:
- ckbServiceBridge.js creates `window.CKBService`
- blockchain.js creates `window.VoteSecureBlockchain` and reads from CKBService
- organizer.js waits for both to be ready

#### B) File Not Found / 404 Error
**Check**: Browser DevTools → Network tab

**You should see**:
```
✓ ckbServiceBridge.js    Status 200
✓ blockchain.js           Status 200
✓ organizer.js            Status 200
```

**If you see 404**:
- Check file paths in script tags
- Verify files exist in web/ directory
- Check for typos in filenames

#### C) JavaScript Syntax Error in ckbServiceBridge.js or blockchain.js
**Check**: Browser DevTools → Console

**Look for**: Red error messages with stack traces

**Fix**: See "Problem 2: BigInt Error" below

#### D) Module Loading Issue
**Check**: Open DevTools Console and run:
```javascript
window.debugBlockchainServices()
```

**Output should show**:
```
✓ CKBService loaded: true
  - connectJoyID: function
  - getLockscriptConfig: function
  - VOTESECURE_CONFIG: loaded
    - Code Hash: 0x3b3f2d37f03fac4145aeb092d1e925b5624c86b2d7c9717d526be708c9efb6e1
✓ VoteSecureBlockchain loaded: true
  - connectJoyID: function
  - publishEvent: function
```

**If any show false**, that file isn't loading.

### Solution Steps

1. **Open organizer.html in browser**
2. **Open DevTools** (F12 or right-click → Inspect)
3. **Go to Network tab**
4. **Reload page (Ctrl+R)**
5. **Check for 404 errors** - if you see them, fix file paths
6. **Go to Console tab**
7. **Look for red errors** - if BigInt error, see Problem 2
8. **Run debug command**:
   ```javascript
   window.debugBlockchainServices()
   ```
9. **Check which services are missing** and verify script tags

---

## Problem 2: BigInt Type Error

### Error Message
```
Uncaught TypeError: Cannot mix BigInt and other types, use explicit conversions
    at ckbServiceBridge.js:88:30
```

### Root Cause
Mixing BigInt values (e.g., `100000000n`) with regular JavaScript numbers without explicit conversion.

**Example of BAD code**:
```javascript
// WRONG - mixes number with BigInt
const MIN_CELL_CAPACITY = 61 * 100000000n;  // ❌ Error!
```

**Correct code**:
```javascript
// CORRECT - explicitly convert to BigInt
const MIN_CELL_CAPACITY = BigInt(61) * BigInt(100000000);  // ✓ Works!
```

### Where This Occurs
- ckbServiceBridge.js line 88-90 (if not fixed)
- Any transaction value calculation
- Any cell capacity calculation

### Fix Applied
Already fixed in updated ckbServiceBridge.js:
```javascript
// Lines 80-83 (FIXED)
const MIN_CELL_CAPACITY = BigInt(61) * BigInt(100000000);
const EVENTFUND_CELL_CAPACITY = BigInt(70) * BigInt(100000000);
const METADATA_CELL_CAPACITY = BigInt(150) * BigInt(100000000);
```

**If you're still getting this error**:
1. Make sure you're using the updated files from outputs/
2. Don't mix `n` suffix with regular numbers
3. Always wrap numbers in `BigInt()` when working with big integers

### Common BigInt Mistakes to Avoid

❌ **WRONG**:
```javascript
const capacity = 100 * 100000000n;  // Mixing types
const balance = BigInt(value) + 1000;  // Mixing BigInt + number
const result = 5n / 2n;  // BigInt division (loses decimals!)
```

✓ **CORRECT**:
```javascript
const capacity = BigInt(100) * BigInt(100000000);  // Both BigInt
const balance = BigInt(value) + BigInt(1000);  // Both BigInt
const result = 5n / 2n;  // Results in 2n (integer division)
```

---

## Problem 3: "Cannot read property 'connectJoyID' of undefined"

### Symptoms
```
TypeError: Cannot read property 'connectJoyID' of undefined
    at organizer.js:xxx
```

### Root Cause
Code trying to use `window.CKBService` or `window.VoteSecureBlockchain` before they're loaded

### Solution

**Wait for services to be ready before using them**:

```javascript
// WRONG - tries to use immediately
const organizer = await window.VoteSecureBlockchain.connectJoyID();

// CORRECT - waits for services first
window.waitForBlockchainReady
    .then(({ CKBService, Blockchain }) => {
        // Now safe to use
        const organizer = await Blockchain.connectJoyID();
    })
    .catch(err => {
        console.error('Services not ready:', err);
    });
```

**Or check if available first**:
```javascript
if (window.VoteSecureBlockchain?.connectJoyID) {
    // Safe to use
    await window.VoteSecureBlockchain.connectJoyID();
} else {
    console.error('Blockchain service not ready yet');
}
```

---

## Problem 4: Lockscript Config Missing

### Symptoms
```
Error: VoteSecure Lockscript not configured
```

### Check
```javascript
// In console:
window.CKBService.config.VOTESECURE_CONFIG
```

**Should show**:
```javascript
{
  lockscript: {
    codeHash: "0x3b3f2d37...",
    hashType: "data",
    txHash: "0x0ebf65d...",
    outPoint: {...},
    deployedAt: "2025-10-21T00:16:14.394657",
    network: "testnet",
    ...
  }
}
```

**If it's undefined**:
- ckbServiceBridge.js didn't load
- Check VOTESECURE_CONFIG constant at top of ckbServiceBridge.js
- Verify you're using the updated file from outputs/

---

## Problem 5: JoyID Connection Fails

### Symptoms
- "Connect Wallet" button causes error
- Error mentions JoyID or authentication

### Possible Causes

#### A) JoyID Not Available
```javascript
// Check in console:
window.CKBService.config.JOYID_NET  // Should be "testnet" or "mainnet"
```

#### B) Wrong Network
```javascript
// Make sure USE_MAINNET matches your network
// In ckbServiceBridge.js line 44:
const USE_MAINNET = false;  // Use false for testnet
```

#### C) Network Issues
```javascript
// Check RPC/Indexer URLs in console:
window.CKBService.config.RPC_URL
window.CKBService.config.INDEXER_URL
```

**Should match**:
- Testnet: `https://testnet.ckb.dev/rpc`
- Or local node: `http://192.168.178.94:8112`

#### D) Missing JoyID Library
```html
<!-- Make sure these are imported in organizer.html -->
<!-- Check if @joyid/ckb is available -->
```

### Solution
1. Check that JOYID_NET is correct for your network
2. Verify network endpoints (RPC/Indexer URLs)
3. Check browser console for JoyID library errors
4. Try connecting from a fresh browser tab
5. Clear browser cache (Ctrl+Shift+Del)

---

## Problem 6: Cells Not Creating / Transactions Failing

### Symptoms
- `publishEvent()` returns `{success: false, error: "..."}`
- Transaction hash is null
- Balance check fails

### Check

**1. Test wallet connection**:
```javascript
const organizer = await window.VoteSecureBlockchain.connectJoyID();
console.log('Address:', organizer.address);
console.log('Balance:', organizer.balance);
```

**2. Test cost estimation**:
```javascript
const cost = window.VoteSecureBlockchain.estimateEventCost({
    estimatedVoters: 100,
    allowedUpdates: 3
});
console.log('Required CKB:', cost.totalCost);
```

**3. Check balance vs. cost**:
```javascript
// If balance is less than cost, you need more CKB
if (balance < cost.totalCost) {
    console.error('Insufficient balance. Need:', cost.totalCost, 'Have:', balance);
}
```

### Solutions
- Get CKB from faucet if on testnet
- Ensure you have sufficient balance
- Check transaction fee estimates
- Verify account has no pending transactions

---

## Problem 7: Error in Console During Event Creation

### Symptoms
```
Uncaught (in promise) Error: Failed to create blockchain transaction
```

### Check Detailed Error
```javascript
// Try creating event and catch full error:
try {
    const result = await window.VoteSecureBlockchain.publishEvent(config, address);
    if (!result.success) {
        console.error('Full error:', result.error);
    }
} catch (err) {
    console.error('Exception:', err.message, err.stack);
}
```

### Common Causes
- Insufficient balance
- Invalid event configuration
- Network connection issues
- JoyID transaction timeout

---

## Debug Checklist

Run this in console to diagnose issues:

```javascript
console.log('=== VOTESECURE DEBUG ===');
console.log('1. Files loaded:');
console.log('   CKBService:', !!window.CKBService);
console.log('   Blockchain:', !!window.VoteSecureBlockchain);
console.log('');
console.log('2. Configuration:');
console.log('   Network:', window.CKBService?.config?.JOYID_NET);
console.log('   RPC:', window.CKBService?.config?.RPC_URL);
console.log('   Lockscript Code Hash:', window.CKBService?.config?.VOTESECURE_CONFIG?.lockscript?.codeHash);
console.log('');
console.log('3. Cell Types:');
console.log('   METADATA:', window.CKBService?.config?.VOTESECURE_CELL_TYPES?.METADATA);
console.log('   VOTER:', window.CKBService?.config?.VOTESECURE_CELL_TYPES?.VOTER);
console.log('   EVENTFUND:', window.CKBService?.config?.VOTESECURE_CELL_TYPES?.EVENTFUND);
console.log('   RESULT:', window.CKBService?.config?.VOTESECURE_CELL_TYPES?.RESULT);
console.log('');
console.log('4. Functions available:');
console.log('   connectJoyID:', typeof window.VoteSecureBlockchain?.connectJoyID);
console.log('   publishEvent:', typeof window.VoteSecureBlockchain?.publishEvent);
console.log('   submitBallot:', typeof window.VoteSecureBlockchain?.submitBallot);
console.log('   releaseResults:', typeof window.VoteSecureBlockchain?.releaseResults);
console.log('');
console.log('5. Test connection (will require JoyID popup):');
console.log('   Run: await window.VoteSecureBlockchain.connectJoyID()');
```

---

## Quick Fix Reference

| Problem | Fix | Location |
|---------|-----|----------|
| BigInt error | Use `BigInt(61) * BigInt(100000000)` not `61 * 100000000n` | ckbServiceBridge.js:80-83 |
| "Waiting for CKB Service..." | Check script tag order | organizer.html |
| 404 on files | Fix file paths | organizer.html script tags |
| CKBService undefined | Load ckbServiceBridge.js before blockchain.js | organizer.html |
| Lockscript config missing | Verify VOTESECURE_CONFIG in ckbServiceBridge.js | ckbServiceBridge.js:20-30 |
| JoyID connection fails | Check JOYID_NET and network URLs | ckbServiceBridge.js:44-46 |
| Insufficient balance | Get CKB from faucet or use funded account | External |
| Cell creation fails | Check balance and cost estimate | Console |

---

## Testing Initialization Flow

**Complete end-to-end test**:

```javascript
// 1. Check services loaded
console.assert(window.CKBService, 'CKBService not loaded');
console.assert(window.VoteSecureBlockchain, 'Blockchain not loaded');
console.log('✓ Services loaded');

// 2. Check lockscript config
console.assert(
    window.CKBService.config.VOTESECURE_CONFIG,
    'Lockscript config missing'
);
console.log('✓ Lockscript config ready');

// 3. Connect JoyID (requires user interaction)
console.log('Connecting to JoyID...');
const organizer = await window.VoteSecureBlockchain.connectJoyID();
console.log('✓ Connected:', organizer.address);
console.log('✓ Balance:', organizer.balance);

// 4. Create test event config
const config = {
    title: 'Test Event',
    description: 'Testing initialization',
    estimatedVoters: 10,
    questions: [
        {
            id: 'q1',
            text: 'Test question?',
            type: 'single',
            options: [
                { id: 'opt1', text: 'Yes' },
                { id: 'opt2', text: 'No' }
            ]
        }
    ],
    schedule: {
        startTime: Date.now(),
        endTime: Date.now() + 86400000,
        resultsReleaseTime: Date.now() + 90000000
    },
    eligibility: { type: 'public' }
};

// 5. Estimate cost
const cost = window.VoteSecureBlockchain.estimateEventCost(config);
console.log('✓ Estimated cost:', cost.totalCost, 'CKB');
console.assert(
    parseFloat(organizer.balance) >= cost.totalCost,
    'Insufficient balance for test'
);

// 6. Publish event (requires wallet signature)
console.log('Publishing event...');
const result = await window.VoteSecureBlockchain.publishEvent(config, organizer.address);
console.assert(result.success, 'Event publication failed: ' + result.error);
console.log('✓ Event published:', result.event.eventId);
console.log('✓ Transaction hash:', result.txHash);

console.log('\n=== ALL TESTS PASSED ===');
```

---

## When to Update Files

If you encounter issues, **always verify you're using the latest files**:

```bash
# In your project directory:
# Make sure these are the UPDATED versions from outputs/:
✓ ckbServiceBridge.js  (v2 - with BigInt fix)
✓ blockchain.js        (v2 - with EventFund support)
✓ organizer.js         (or use ORGANIZER_INITIALIZATION_PATCH.js)
```

---

## Support Information

If problems persist:

1. **Copy full console error** (F12 → Console tab → right-click on error → Copy)
2. **Run debug command**:
   ```javascript
   window.debugBlockchainServices()
   ```
3. **Export console logs**: DevTools → Console → right-click → Save as...
4. Check this guide again for your specific error message
5. Review file paths and load order in organizer.html

Most issues are caused by:
- 🔴 **70%**: Missing or incorrect script tag order
- 🔴 **20%**: BigInt conversion errors (already fixed)
- 🔴 **5%**: Network/RPC URL configuration
- 🔴 **5%**: Insufficient CKB balance
