# VoteSecure Withdrawal Implementation Guide

## Overview

This guide describes the implementation of the withdrawal functionality that allows organizers to reclaim funds and clean up cells after the audit period ends.

## Contract Requirements (from main.rs)

The withdrawal functionality must comply with these contract validation rules:

### 1. EventFund Cell Withdrawal (lines 479-502)
- **Timing Check**: Current time MUST be >= `audit_end_time`
- **Authorization**: Transaction output must go to organizer's lock hash
- **Signature**: Organizer's signature MUST be in witness[0]
- **Cell Type**: EventFund cell has lock args starting with `0x00` (EVENTFUND_TYPE)

### 2. Metadata Cell Cleanup (lines 532-556)
- **Timing Check**: Current time >= `audit_end_time`
- **Authorization**: Organizer signature required in witness
- **Cell Type**: Metadata cell has lock args starting with `0x01` (METADATA_TYPE)

### 3. Result Cell Cleanup (lines 674-702)
- **Timing Check**: Current time >= `audit_end_time`
- **Authorization**: Organizer signature required in witness
- **Cell Type**: Result cell has lock args starting with `0x03` (RESULT_TYPE)

## CKBService Implementation Required

### Function Signature

```javascript
/**
 * Withdraw event funds and clean up all cells after audit period
 * @param {string} eventId - Event identifier
 * @param {string} organizerAddress - Organizer's CKB address
 * @param {object} event - Complete event object with cells info
 * @returns {Promise<object>} - { success: boolean, txHash: string, amount: number, error?: string }
 */
async function withdrawEventFunds(eventId, organizerAddress, event)
```

### Implementation Steps

#### Step 1: Validate Preconditions

```javascript
// 1. Check audit period has ended
const now = Math.floor(Date.now() / 1000);
const auditEndTime = event.schedule?.auditEndTime;

if (now < auditEndTime) {
    throw new Error('Audit period has not ended');
}

// 2. Calculate remaining funds
const remainingFunds = event.eventFund?.remainingFunds || 0;
if (remainingFunds === 0) {
    return { success: false, error: 'No funds to withdraw' };
}
```

#### Step 2: Collect All Event Cells

```javascript
// Collect input cells for the event
const inputCells = [];

// 1. EventFund cell (lock args: 0x00 + eventId)
const eventFundCell = event.cells?.eventFund;
if (eventFundCell) {
    inputCells.push({
        outPoint: eventFundCell.outPoint,
        capacity: eventFundCell.capacity,
        cellOutput: eventFundCell.cellOutput,
        data: eventFundCell.data
    });
}

// 2. Metadata cell (lock args: 0x01 + eventId)
const metadataCell = event.cells?.metadata;
if (metadataCell) {
    inputCells.push({
        outPoint: metadataCell.outPoint,
        capacity: metadataCell.capacity,
        cellOutput: metadataCell.cellOutput,
        data: metadataCell.data
    });
}

// 3. Result cell (lock args: 0x03 + eventId)
const resultCell = event.cells?.result;
if (resultCell) {
    inputCells.push({
        outPoint: resultCell.outPoint,
        capacity: resultCell.capacity,
        cellOutput: resultCell.cellOutput,
        data: resultCell.data
    });
}
```

#### Step 3: Calculate Total Capacity

```javascript
// Sum up all input capacity
let totalCapacity = 0n;
for (const cell of inputCells) {
    totalCapacity += BigInt(cell.capacity);
}

// Calculate transaction fee (estimate)
const TX_FEE = 100000n; // 0.001 CKB
const outputCapacity = totalCapacity - TX_FEE;
```

#### Step 4: Create Output Cell to Organizer

```javascript
// Create output cell sending all capacity to organizer
const outputs = [{
    capacity: outputCapacity.toString(),
    lock: {
        codeHash: organizerLockScript.codeHash,
        hashType: organizerLockScript.hashType,
        args: organizerLockScript.args
    }
}];

const outputsData = ['0x']; // Empty data for simple transfer
```

#### Step 5: Build Transaction with Witnesses

```javascript
// Build transaction
const tx = {
    version: '0x0',
    cellDeps: [
        // Include contract cell dep for validation
        {
            outPoint: contractCellDep.outPoint,
            depType: 'code'
        },
        // Include secp256k1 dep for signature verification
        {
            outPoint: secp256k1Dep.outPoint,
            depType: 'depGroup'
        }
    ],
    headerDeps: [],
    inputs: inputCells.map(cell => ({
        previousOutput: cell.outPoint,
        since: '0x0'
    })),
    outputs: outputs,
    outputsData: outputsData,
    witnesses: []
};

// CRITICAL: Add organizer signature as witness[0]
// The contract checks witness[0] for organizer authorization
const witness = await signTransaction(tx, organizerPrivateKey);
tx.witnesses.push(witness);

// Add empty witnesses for other inputs
for (let i = 1; i < inputCells.length; i++) {
    tx.witnesses.push('0x');
}
```

#### Step 6: Sign and Submit Transaction

```javascript
// Sign transaction with JoyID
const signedTx = await ccc.Signer.signTransaction(tx);

// Submit to blockchain
const txHash = await ccc.Client.sendTransaction(signedTx);

// Wait for confirmation (optional)
await waitForTransaction(txHash);

return {
    success: true,
    txHash: txHash,
    amount: totalCapacity.toString()
};
```

## Contract Validation Flow

When the transaction is submitted, the contract will validate:

### For EventFund Cell (main.rs:479-502)
1. ✓ Check `current_time >= audit_end_time` (line 486)
2. ✓ Verify output goes to organizer lock hash (line 474)
3. ✓ Validate organizer signature in witness (line 492-500)

### For Metadata Cell (main.rs:532-556)
1. ✓ Check `current_time >= audit_end_time` (line 550)
2. ✓ Call `verify_metadata_cleanup()` (line 551)
3. ✓ Verify organizer signature (line 567-569)

### For Result Cell (main.rs:674-702)
1. ✓ Check `current_time >= audit_end_time` (line 689)
2. ✓ Validate cleanup authorization (line 693-700)
3. ✓ Verify organizer signature in witness (line 698)

## Cell Type Identifiers (CRITICAL)

Ensure lock args are correctly formed:

```javascript
// EventFund: Type 0x00
eventFundArgs = '0x00' + stringToHex(eventId).padStart(64, '0')

// Metadata: Type 0x01
metadataArgs = '0x01' + stringToHex(eventId).padStart(64, '0')

// Result: Type 0x03
resultArgs = '0x03' + stringToHex(eventId).padStart(64, '0')
```

## Error Handling

```javascript
// Contract error codes (from main.rs)
const ERROR_INVALID_TIMING = -5;           // Audit period not ended
const ERROR_UNAUTHORIZED_WITHDRAWAL = -10; // Not organizer
const ERROR_INVALID_SIGNATURE = -15;       // Bad signature

// Map contract errors to user messages
function mapContractError(code) {
    switch(code) {
        case -5: return 'Audit period has not ended yet';
        case -10: return 'Only organizer can withdraw funds';
        case -15: return 'Invalid signature';
        default: return 'Transaction failed';
    }
}
```

## Testing Checklist

- [ ] Withdrawal before audit_end_time is rejected
- [ ] Withdrawal by non-organizer is rejected
- [ ] All three cells (EventFund, Metadata, Result) are consumed
- [ ] Correct capacity is returned to organizer
- [ ] Transaction includes valid organizer signature
- [ ] Cell type identifiers are correct (0x00, 0x01, 0x03)
- [ ] Event ID encoding matches contract expectations
- [ ] Successful withdrawal updates UI correctly

## UI Integration Points

### 1. organizer.js (lines 1921-2087)
- `withdrawEventFunds(eventId, organizerAddress)` - Main withdrawal function
- `canWithdraw(event)` - Check if withdrawal available
- `getWithdrawalTimeRemaining(event)` - Display countdown

### 2. viewElectionDetails.js (lines 407-490)
- `generateWithdrawalSectionHTML(event)` - Display withdrawal UI
- `initiateWithdrawal(eventId)` - Handle withdrawal button click

### 3. Election Cards (organizer.js:369-464)
- Shows "✓ Funds Available for Withdrawal" notice
- Shows "⏳ Withdrawal Available In: X" countdown
- Displays "Withdraw X CKB" button when ready

## Security Considerations

1. **Signature Verification**: Contract validates organizer signature
2. **Timing Enforcement**: Cannot withdraw before audit_end_time
3. **Authorization**: Only organizer can withdraw
4. **Cell Cleanup**: All event cells consumed atomically
5. **No Double Spend**: Cells consumed in single transaction

## Next Steps

1. Implement `withdrawEventFunds()` in `src/ckbService_ccc.js`
2. Add helper functions for cell collection
3. Test withdrawal with testnet events
4. Verify contract validation passes
5. Test error scenarios (early withdrawal, wrong user, etc.)

## References

- Contract: `PythonSetup/contract/src/main.rs`
- UI: `web/organizer.js`, `web/viewElectionDetails.js`
- Cell Creation: `web/organizer.js:1681-1715`
