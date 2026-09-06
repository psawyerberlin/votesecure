# Migration Guide: Fixing the JoyID "You Cannot Send CKB to Yourself" Error

## Executive Summary

The error occurs because the code attempts to use JoyID's simple `signTransaction()` function (designed for peer-to-peer CKB transfers) to create blockchain cells. When `from === to`, JoyID rejects it.

**Fix:** Use the `TransactionSkeleton` pattern with proper inputs/outputs instead.

---

## 🔴 Problem Summary

### Current Broken Code Flow

```
blockchain.js:publishEvent()
    ↓
blockchain.js:createCellsOnChain()
    ↓
ckbServiceBridge.js:signAndSendTransaction(orgAddr, orgAddr, amount) ← PROBLEM!
    ↓
joyidSignTransaction({ from: orgAddr, to: orgAddr, amount: ... })
    ↓
❌ "You cannot send CKB to yourself"
```

### Why It's Wrong

The `signAndSendTransaction()` function at line 298 of `ckbServiceBridge.js`:

```javascript
async function signAndSendTransaction(fromAddress, toAddress, amountCkb) {
  // ... balance check ...
  
  const signedTx = await signTransaction({
    from: fromAddress,
    to: toAddress,         // ← When this equals fromAddress...
    amount: shannons,      // ... JoyID rejects it
    rpcURL: RPC_URL,
    network: JOYID_NET,
    name: 'VoteSecure',
    logo: '...'
  });
  
  return txHash;
}
```

This function is called from:
- `blockchain.js` line 500 in `createCellsOnChain()`
- Both arguments are `organizerAddress`

---

## ✅ Solution Overview

Replace the simple transfer pattern with proper CKB transaction structure:

```
Inputs:      [Spendable cells from organizer]
Outputs:     [EventFund cell, Metadata cell, Result cell]
Cell Deps:   [VoteSecure lockscript reference]
Witnesses:   [JoyID signature]
```

This is the correct pattern from the VoteSecure architecture.

---

## 📋 Step-by-Step Migration

### Phase 1: Update ckbServiceBridge.js

#### Step 1.1: Add Required Imports

At the top of `ckbServiceBridge.js`, add:

```javascript
import { 
  TransactionSkeleton,
  sealTransaction,
  scriptToHash,
} from "@ckb-lumos/helpers";
import { common } from "@ckb-lumos/common-scripts";
```

**Note:** These are already dependencies of Lumos, so no new packages needed.

#### Step 1.2: Replace `createCellsOnChain()`

**REMOVE this function entirely:**

```javascript
// ❌ DELETE THIS - Line 467-516 in blockchain.js
async function createCellsOnChain(organizerAddress, cells) {
  try {
    // ... all the old code ...
    
    // This line is the problem:
    const txHash = await window.CKBService.signAndSendTransaction(
        organizerAddress,
        organizerAddress,  // ← SAME ADDRESS
        totalCKB
    );
    
    // ...
  }
}
```

**REPLACE WITH this corrected implementation:**

See the file: `CORRECTED_ckbServiceBridge_functions.js` (provided separately)

Key changes:
- Uses `TransactionSkeleton` instead of simple transfer
- Properly collects input cells
- Creates output cells (not transfers)
- Adds VoteSecure lockscript as cell dependency
- Calculates fees correctly
- Never attempts to send CKB to the same address

#### Step 1.3: Update Cell Creation Pattern

The corrected function:

```javascript
async function createCellsOnChain(organizerAddress, cells) {
  // 1. Calculate total capacity needed
  // 2. Check balance
  // 3. Create TransactionSkeleton
  // 4. Collect input cells
  // 5. Add output cells
  // 6. Add change output
  // 7. Add cell dependencies
  // 8. Calculate fees with payFeeByFeeRate()
  // 9. Sign with JoyID
  // 10. Send to blockchain
}
```

---

### Phase 2: Update blockchain.js

#### Step 2.1: No Changes Needed to Call Sites

The existing calls to `createCellsOnChain()` are correct:

```javascript
// This is FINE - function signature doesn't change
const txHash = await createCellsOnChain(organizerAddress, [
    eventFundCell,
    metadataCell,
    resultCell
]);
```

The function implementation handles the complexity internally.

#### Step 2.2: Update `submitBallot()` Function

Replace the current `submitBallot()` (line 650) with the corrected version that uses EventFund sponsorship.

**Current pattern (line 699):**
```javascript
const txHash = await createCellsOnChain(event.organizerId, [voterCell]);
```

**New pattern:**
```javascript
const txHash = await window.CKBService.submitBallotWithSponsorship(
    ballot,
    voterAddress
);
```

This new function:
- Takes EventFund as input
- Creates Voter cell as output
- Updates EventFund with reduced capacity
- Signs with voter's JoyID (even if wallet is empty!)

---

### Phase 3: Implementation Details

#### Key Pattern 1: Transaction Skeleton

```javascript
let txSkeleton = TransactionSkeleton({ cellProvider: indexer });

// Add inputs
for await (const cell of collector.collect()) {
  txSkeleton = txSkeleton.update('inputs', inputs => inputs.push(cell));
}

// Add outputs
txSkeleton = txSkeleton.update('outputs', outputs => {
  return outputs.push({
    cellOutput: { capacity, lock, type },
    data: encodedData
  });
});

// Add cell deps
txSkeleton = txSkeleton.update('cellDeps', cellDeps => 
  cellDeps.push({
    outPoint: VOTESECURE_CONFIG.lockscript.outPoint,
    depType: 'code'
  })
);
```

#### Key Pattern 2: Fee Calculation

```javascript
// Calculate and pay fees automatically
txSkeleton = await common.payFeeByFeeRate(
  txSkeleton,
  [organizerAddress],  // fee payer(s)
  BigInt(1000)         // fee rate in shannons/kB
);
```

#### Key Pattern 3: JoyID Signing

```javascript
// Convert to JSON
const txJson = {
  version: '0x0',
  cellDeps: txSkeleton.get('cellDeps').toJSON(),
  headerDeps: txSkeleton.get('headerDeps').toJSON(),
  inputs: txSkeleton.get('inputs').toJSON(),
  outputs: txSkeleton.get('outputs').toJSON(),
  outputsData: txSkeleton.get('outputsData').toJSON(),
  witnesses: txSkeleton.get('witnesses').toJSON()
};

// Sign with JoyID
const signedTx = await joyidSignTransaction({
  tx: txJson,
  from: organizerAddress,
  rpcURL: RPC_URL,
  network: JOYID_NET,
  name: 'VoteSecure',
  logo: '...'
});

// Send
const txHash = await rpc.sendTransaction(toSnakeCaseTx(signedTx), 'passthrough');
```

---

## 🧪 Testing Checklist

### Test 1: publishEvent()

```javascript
// Should create EventFund, Metadata, Result cells
const result = await VoteSecureBlockchain.publishEvent(eventConfig, organizerAddress);

// Expected:
// ✓ result.success === true
// ✓ result.txHash present (no "You cannot send CKB to yourself" error)
// ✓ Transaction shows 3 outputs in explorer
```

**Test on testnet explorer:**
- Go to: `https://pudge.explorer.nervos.org/transaction/{txHash}`
- Verify: 3+ outputs (EventFund, Metadata, Result, change)
- Verify: VoteSecure lockscript in cell deps

### Test 2: submitBallot()

```javascript
// Voter with EMPTY wallet submits ballot
const voterResult = await VoteSecureBlockchain.submitBallot(ballot, voterAddress);

// Expected:
// ✓ voterResult.success === true
// ✓ Ballot accepted even though voter has no CKB
// ✓ EventFund sponsorship works
```

**Test on testnet explorer:**
- Verify: Transaction inputs include EventFund
- Verify: Outputs include Voter cell and updated EventFund
- Verify: Voter's lock script is preserved

### Test 3: Error Cases

Test these should still work correctly:

```javascript
// Should fail: insufficient balance
try {
  await publishEvent(config, poorAddress);
} catch (e) {
  console.log(e.message); // "Insufficient balance..."
}

// Should fail: EventFund out of capacity
try {
  await submitBallot(ballot, voterAddress); // 1000th voter
} catch (e) {
  console.log(e.message); // "Insufficient funds in EventFund..."
}
```

---

## 🔍 Verification Steps

### Step 1: Code Review

- [ ] `createCellsOnChain()` uses `TransactionSkeleton`
- [ ] No calls to `signTransaction(addr, addr, amount)` with same `from` and `to`
- [ ] All outputs have proper `cellOutput` structure
- [ ] VoteSecure lockscript added as cell dependency
- [ ] Fees calculated with `payFeeByFeeRate()`

### Step 2: Unit Tests

- [ ] `publishEvent()` creates 3 cells without error
- [ ] `submitBallot()` works with empty voter wallet
- [ ] Multiple ballots deplete EventFund correctly
- [ ] Change output calculated correctly

### Step 3: Integration Tests

- [ ] Full flow: publishEvent → submitBallot → releaseResults
- [ ] Multiple events can be created
- [ ] Multiple voters can submit ballots

### Step 4: Testnet Verification

- [ ] Publish an event
- [ ] Check explorer: Should see proper transaction structure
- [ ] Submit a ballot
- [ ] Check explorer: EventFund sponsorship visible

---

## 📦 Files to Update

| File | Changes | Lines | Severity |
|------|---------|-------|----------|
| `ckbServiceBridge.js` | Replace `createCellsOnChain()` function | 467-516 | **CRITICAL** |
| `ckbServiceBridge.js` | Add new `submitBallotWithSponsorship()` | (append) | **HIGH** |
| `blockchain.js` | Update `submitBallot()` call site | 699 | **HIGH** |
| `blockchain.js` | Keep `publishEvent()` unchanged | (no change) | OK |

---

## ⚠️ Common Mistakes to Avoid

### ❌ Mistake 1: Still Using Simple Transfer

```javascript
// WRONG - Will cause same error
const txHash = await signTransaction({
  from: organizerAddress,
  to: organizerAddress,  // ← STOP!
  amount: BigInt(...),
});
```

**Fix:** Use `TransactionSkeleton` pattern above.

### ❌ Mistake 2: Missing Cell Dependencies

```javascript
// WRONG - Transaction won't validate
txSkeleton.update('cellDeps', cellDeps => []);  // ← Empty!
```

**Fix:** Add VoteSecure lockscript as dependency:
```javascript
txSkeleton = txSkeleton.update('cellDeps', cellDeps =>
  cellDeps.push({
    outPoint: VOTESECURE_CONFIG.lockscript.outPoint,
    depType: 'code'
  })
);
```

### ❌ Mistake 3: Forgetting Change Output

```javascript
// WRONG - Organizer loses unspent CKB
// Only add cell outputs, no change
```

**Fix:** Calculate and add change:
```javascript
const changeCapacity = collectedCapacity - totalCapacityNeeded;
if (changeCapacity > 0n) {
  txSkeleton = txSkeleton.update('outputs', outputs => 
    outputs.push({
      cellOutput: { capacity: changeCapacity, lock: organizerLock },
      data: '0x'
    })
  );
}
```

### ❌ Mistake 4: Incorrect Fee Calculation

```javascript
// WRONG - Manual fee calculation
const txSize = JSON.stringify(tx).length;
const fee = txSize * 1000;
```

**Fix:** Use `payFeeByFeeRate()`:
```javascript
txSkeleton = await common.payFeeByFeeRate(
  txSkeleton,
  [organizerAddress],
  BigInt(1000)
);
```

---

## 🚀 Rollout Plan

### Week 1: Development & Testing
- [ ] Implement corrected functions
- [ ] Write unit tests
- [ ] Test on private CKB node

### Week 2: Testnet Validation
- [ ] Deploy to testnet
- [ ] Publish test events
- [ ] Submit test ballots
- [ ] Verify explorer transactions

### Week 3: Code Review & Audit
- [ ] Security review
- [ ] Performance testing
- [ ] Load testing

### Week 4: Mainnet Deployment
- [ ] Final deployment
- [ ] Monitor production
- [ ] User communication

---

## 📞 Troubleshooting

### Issue: "VoteSecure Lockscript not found"

**Cause:** Cell dependency outPoint is wrong

**Fix:** Verify `VOTESECURE_CONFIG.lockscript.outPoint`:
```javascript
console.log(VOTESECURE_CONFIG.lockscript.outPoint);
// Should output: { txHash: "0x...", index: "0x0" }
```

### Issue: "Insufficient spendable cells"

**Cause:** Not enough plain CKB cells to collect

**Fix:** Check that organizer has spendable cells:
```javascript
const cells = await window.CKBService.getCellsByAddress(organizerAddress);
console.log('Plain CKB cells:', cells.filter(c => !c.cellOutput.type));
```

### Issue: Transaction rejected with "Invalid signature"

**Cause:** JoyID signature doesn't match transaction

**Fix:** Ensure transaction JSON is correct:
```javascript
console.log('TX JSON for signing:', txJson);
// All fields must be exact and in correct format
```

---

## 📚 References

- **Architecture:** `votesecure_architecture.md` (lines 545-621)
- **Lumos Docs:** https://docs.nervos.org/docs/reference/lumos/
- **JoyID Integration:** https://github.com/joyid/joyid-js-sdk
- **CKB Transaction:** https://docs.nervos.org/docs/basics/transaction/

---

## ✅ Success Criteria

When the fix is complete:

- ✅ No more "You cannot send CKB to yourself" error
- ✅ Events can be published to testnet
- ✅ Voters can submit ballots
- ✅ EventFund sponsorship works
- ✅ Explorer shows proper transaction structure
- ✅ All cells appear on-chain correctly
