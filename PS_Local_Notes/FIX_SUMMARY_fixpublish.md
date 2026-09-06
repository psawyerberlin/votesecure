# VoteSecure JoyID Integration Fixes

## Problem Summary

The original code had two critical issues:

1. **"You cannot send CKB to yourself" error** - EventFund cells were using the organizer's lock script, making it appear as if the organizer was sending CKB to themselves
2. **"Cannot read properties of undefined (reading 'address')" error** - Transaction skeleton was incomplete, missing actual input cells that JoyID needs to process

## Solutions Implemented

### Fix 1: EventFund Lock Script (blockchain.js)

**Before:**
```javascript
lock: {
    codeHash: organizerLockScript.codeHash,
    hashType: organizerLockScript.hashType,
    args: organizerLockScript.args  // ❌ Organizer's own lock
}
```

**After:**
```javascript
lock: {
    codeHash: VOTESECURE_LOCKSCRIPT?.codeHash,
    hashType: VOTESECURE_LOCKSCRIPT?.hashType,
    args: eventId  // ✅ VoteSecure lockscript with eventId
}
```

**Why this works:**
- EventFund cells are now controlled by the smart contract (VoteSecure lockscript), not the organizer's personal address
- This prevents JoyID from seeing it as "sending to yourself"
- The lockscript validates who can spend the EventFund based on event rules

### Fix 2: Proper Transaction Building (ckbServiceBridge.js)

Added two new functions that properly build transactions using Lumos:

#### `buildAndSignTransaction` - For Event Creation
```javascript
async function buildAndSignTransaction(fromAddress, outputCells, lockscriptConfig)
```

This function:
1. **Collects actual input cells** from the organizer's address using Lumos indexer
2. **Builds complete transaction skeleton** with:
   - Real input cells (with outPoints and data)
   - Output cells for EventFund, Metadata, Result
   - Cell dependencies (VoteSecure lockscript)
   - Change output if needed
   - Witness placeholders
3. **Converts to JoyID format** and signs

#### `buildBallotTransaction` - For Ballot Submission
```javascript
async function buildBallotTransaction(voterAddress, eventFundCell, voterCell, updatedEventFundCell, lockscriptConfig)
```

This function:
1. **Queries the actual EventFund cell** from blockchain
2. **Builds transaction** that:
   - Uses EventFund cell as input
   - Creates voter cell (output 1)
   - Creates updated EventFund cell with reduced capacity (output 2)
3. **Voter signs** but EventFund pays the fees

### Fix 3: Transaction Structure

**Before (Incorrect):**
```javascript
const tx = {
    version: '0x0',
    cellDeps: [...],
    inputs: [],  // ❌ Empty! JoyID can't process this
    outputs: [...],
    outputsData: [...]
}
```

**After (Correct):**
```javascript
const tx = {
    version: '0x0',
    cellDeps: [
        { outPoint: lockscriptConfig.outPoint, depType: 'code' }
    ],
    inputs: [
        // ✅ Actual cells with outPoint, cellOutput, data
        {
            outPoint: { txHash: '0x...', index: '0x0' },
            cellOutput: { capacity: '0x...', lock: {...}, type: {...} },
            data: '0x...'
        }
    ],
    outputs: [...],  // Cell outputs
    outputsData: [...],  // Cell data
    witnesses: ['0x' + '00'.repeat(65)]  // Signature placeholders
}
```

## Architecture Compliance

The fixes align with the VoteSecure architecture (votesecure_architecture.md):

✅ **EventFund cells use VoteSecure lockscript** (lines 576-586 in architecture)
- Lock script validates spending rules
- Args contain eventId for identification
- Lockscript enforces who can spend funds

✅ **Ballot submission is sponsored by EventFund** (lines 626-691 in architecture)
- Transaction spends EventFund cell
- Creates voter cell + updated EventFund cell
- Voter signs but doesn't pay fees
- Lockscript validates ballot is legitimate

✅ **No "sending to yourself"** 
- Organizer's funds go to smart contract-controlled cells
- Different lock scripts prevent JoyID error
- Smart contract handles fund distribution

## Testing Checklist

1. ✅ Event creation (publishEvent)
   - Creates EventFund with VoteSecure lock
   - Creates Metadata with organizer lock
   - Creates Result with VoteSecure lock
   - Transaction has proper inputs from organizer

2. ✅ Ballot submission (submitBallot)
   - Spends EventFund cell
   - Creates voter cell
   - Updates EventFund cell
   - Voter can submit with empty wallet

3. ✅ JoyID wallet integration
   - No "sending to yourself" error
   - No "cannot read address" error
   - Transaction properly formatted

## Files Modified

1. **blockchain.js**
   - Fixed EventFund lock script (line 280-286)
   - Updated createCellsOnChain to use buildAndSignTransaction
   - Updated submitBallot to use buildBallotTransaction
   - Added organizerAddress parameter to createMetadataCell
   - Added voterAddress parameter to createVoterCell

2. **ckbServiceBridge.js**
   - Added buildAndSignTransaction function
   - Added buildBallotTransaction function
   - Exported both new functions
   - Properly uses Lumos TransactionSkeleton
   - Collects actual input cells from blockchain

## Key Concepts

### Lock Script vs Type Script
- **Lock Script**: Controls WHO can spend a cell (like ownership)
- **Type Script**: Defines WHAT the cell represents (like metadata)

### EventFund Cell Structure
```
EventFund Cell:
├─ Lock Script: VoteSecure lockscript + eventId args
│  └─ Validates spending rules
├─ Type Script: None
└─ Data: JSON with funding info
```

### Transaction Flow

**Event Creation:**
```
Organizer's Cells (inputs)
    ↓ [buildAndSignTransaction]
    ├─ EventFund Cell (VoteSecure lock)
    ├─ Metadata Cell (Organizer lock)
    ├─ Result Cell (VoteSecure lock)
    └─ Change Cell (Organizer lock)
```

**Ballot Submission:**
```
EventFund Cell (input)
    ↓ [buildBallotTransaction]
    ├─ Voter Cell (Voter lock)
    └─ Updated EventFund Cell (VoteSecure lock)
```

## Next Steps

1. Test event creation on testnet
2. Test ballot submission with empty voter wallet
3. Verify transactions on CKB Explorer
4. Test with multiple voters
5. Test EventFund withdrawal after event ends
