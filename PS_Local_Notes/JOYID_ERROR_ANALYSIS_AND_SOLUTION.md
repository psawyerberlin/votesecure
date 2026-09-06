# JoyID Wallet Error Analysis: "You cannot send CKB to yourself"

## 🔴 Root Cause

The error occurs in `ckbServiceBridge.js` at line 298-329 in the `signAndSendTransaction()` function:

```javascript
async function signAndSendTransaction(fromAddress, toAddress, amountCkb) {
  // ... validation ...
  
  const signedTx = await signTransaction({
    from: fromAddress,
    to: toAddress,  // ⚠️ PROBLEM: When called from publishEvent/submitBallot,
    amount: shannons,  // this is the SAME as fromAddress!
    rpcURL: RPC_URL,
    network: JOYID_NET,
    // ...
  });
}
```

### Where It's Called (The Issue):

In `blockchain.js` line 500-504 (`createCellsOnChain` function):

```javascript
const txHash = await window.CKBService.signAndSendTransaction(
    organizerAddress,    // from
    organizerAddress,    // to ← SAME ADDRESS! 
    totalCKB             // amount
);
```

**This happens in:**
- `publishEvent()` → line 592
- `submitBallot()` → line 699

---

## 📋 Why This is Wrong

JoyID's `signTransaction()` function treats `from` and `to` as a simple CKB transfer operation. When you set them to the same address, JoyID's wallet validation rejects it with:

> **"You cannot send CKB to yourself"**

This is a wallet security feature—normal CKB transfers to yourself don't make sense.

---

## ✅ The Solution (From Architecture Document)

According to the **VoteSecure Architecture**, the correct approach is:

### **Phase 1: Create Cells with Proper Outputs**

Instead of using `signTransaction()` (which assumes a simple peer-to-peer transfer), you must:

1. **Build a custom CKB transaction** with proper inputs/outputs structure
2. **Use the EventFund cell as sponsorship** (not as a "to" address)
3. **Sign with JoyID** using a proper transaction skeleton
4. **Never try to "send CKB to yourself"** — instead, create new cells (outputs)

---

## 🛠️ Implementation Fix

### Step 1: Replace the Simple Transfer Function

**Remove this approach:**
```javascript
// ❌ WRONG - Tries to transfer CKB to self
const signedTx = await signTransaction({
  from: organizerAddress,
  to: organizerAddress,  // ← This is the problem!
  amount: shannons,
  ...
});
```

**Use this proper cell-creation approach:**
```javascript
// ✅ CORRECT - Creates cells on-chain
async function createCellsOnChain(organizerAddress, cells) {
  try {
    // Step 1: Build transaction skeleton
    let txSkeleton = TransactionSkeleton({ cellProvider: indexer });
    
    // Step 2: Get organizer's spendable cells as inputs
    const lock = helpers.parseAddress(organizerAddress);
    const collector = indexer.collector({ lock, type: "empty", data: "0x" });
    let inputCapacity = 0n;
    
    for await (const cell of collector.collect()) {
      if (inputCapacity >= totalCapacity) break;
      txSkeleton = txSkeleton.update('inputs', inputs => 
        inputs.push(cell)
      );
      inputCapacity += BigInt(cell.cellOutput.capacity);
    }
    
    // Step 3: Add the cells as outputs (EventFund, Metadata, Result, etc.)
    for (const cell of cells) {
      txSkeleton = txSkeleton.update('outputs', outputs =>
        outputs.push({
          cellOutput: cell.cellOutput,
          data: cell.encodedData
        })
      );
    }
    
    // Step 4: Add cell deps (reference to VoteSecure lockscript)
    txSkeleton = txSkeleton.update('cellDeps', cellDeps =>
      cellDeps.push({
        outPoint: VOTESECURE_CONFIG.lockscript.outPoint,
        depType: 'code'
      })
    );
    
    // Step 5: Calculate and pay fees
    txSkeleton = await common.payFeeByFeeRate(txSkeleton, [organizerAddress], 1000);
    
    // Step 6: Sign with JoyID (using proper transaction, not simple transfer)
    const signedTx = await signTransaction(txSkeleton, organizerAddress);
    
    // Step 7: Send to blockchain
    const txHash = await rpc.sendTransaction(signedTx, 'passthrough');
    
    return txHash;
  } catch (error) {
    console.error('Cell creation failed:', error);
    throw error;
  }
}
```

### Step 2: Update the Call Sites

In `blockchain.js`, change:

```javascript
// OLD (Line 592 in publishEvent):
const txHash = await createCellsOnChain(organizerAddress, [
    eventFundCell,
    metadataCell,
    resultCell
]);

// NEW: Already passes cells correctly, no change needed to the call!
// The createCellsOnChain function now handles the proper transaction structure.
```

### Step 3: For submitBallot (Sponsored Transaction)

For voter ballots sponsored by EventFund, the architecture shows a different pattern:

```javascript
async function submitBallot(ballot, voterAddress) {
  try {
    const event = blockchainStorage.events.find(e => e.eventId === ballot.eventId);
    const eventFundCell = blockchainStorage.cells.find(
      c => c.eventId === event.eventFundCellId && c.cellType === CELL_TYPES.EVENTFUND
    );
    
    let txSkeleton = TransactionSkeleton({ cellProvider: indexer });
    
    // Input: EventFund cell (sponsor pays)
    txSkeleton = txSkeleton.update('inputs', inputs =>
      inputs.push(eventFundCell)
    );
    
    // Output 1: New Voter cell
    const voterCell = await createVoterCell(ballot, publicKey, ballot.eventId);
    txSkeleton = txSkeleton.update('outputs', outputs =>
      outputs.push({
        cellOutput: voterCell.cellOutput,
        data: voterCell.encodedData
      })
    );
    
    // Output 2: Updated EventFund cell (with reduced capacity)
    const updatedEventFund = {
      cellOutput: {
        ...eventFundCell.cellOutput,
        capacity: '0x' + (BigInt(eventFundCell.cellOutput.capacity) - voterCellCost).toString(16)
      },
      data: eventFundCell.encodedData
    };
    txSkeleton = txSkeleton.update('outputs', outputs =>
      outputs.push(updatedEventFund)
    );
    
    // Add cell deps
    txSkeleton = txSkeleton.update('cellDeps', cellDeps =>
      cellDeps.push({
        outPoint: VOTESECURE_CONFIG.lockscript.outPoint,
        depType: 'code'
      })
    );
    
    // Pay fees
    txSkeleton = await common.payFeeByFeeRate(txSkeleton, [voterAddress], 1000);
    
    // Sign with voter's JoyID
    const signedTx = await signTransaction(txSkeleton, voterAddress);
    
    // Send
    const txHash = await rpc.sendTransaction(signedTx, 'passthrough');
    
    return { success: true, txHash };
  } catch (error) {
    console.error('Ballot submission failed:', error);
    throw error;
  }
}
```

---

## 🔑 Key Architectural Principles

From the **votesecure_architecture.md**, the correct pattern is:

1. **EventFund Cell as Sponsor** (not as a transfer destination)
   - EventFund is an INPUT to the transaction
   - Voter cells are OUTPUTS (created by the transaction)
   - Lockscript validates that EventFund is legitimately decreased

2. **Never Use Simple Transfer Pattern for Cell Creation**
   - `signTransaction(from, to, amount)` is for peer-to-peer CKB transfers only
   - For creating VoteSecure cells, use proper transaction skeleton with inputs/outputs

3. **Lumos TransactionSkeleton Pattern**
   ```
   Inputs:        [spendable cells from organizer]
   Outputs:       [EventFund cell, Metadata cell, Result cell]
   Cell Deps:     [VoteSecure lockscript reference]
   Witnesses:     [JoyID signature]
   ```

---

## 📋 Checklist for Fixing

- [ ] Replace `signAndSendTransaction(addr, addr, amount)` pattern with `TransactionSkeleton` approach
- [ ] Update `createCellsOnChain()` to build proper tx with inputs/outputs
- [ ] For `publishEvent()`: Create EventFund, Metadata, Result as outputs
- [ ] For `submitBallot()`: Use EventFund as input, create Voter cell as output
- [ ] Ensure all cells have proper `cellOutput` with lock/type scripts
- [ ] Add VoteSecure lockscript as cell dependency
- [ ] Sign transaction properly with JoyID
- [ ] Add proper fee calculation using `common.payFeeByFeeRate()`

---

## 🧪 Testing Strategy

1. **Test publishEvent()**: Should create 3 cells (EventFund, Metadata, Result) without "send to self" error
2. **Test submitBallot()**: Should consume EventFund and create Voter cell
3. **Verify on Explorer**: Transaction should show proper inputs/outputs structure
4. **Check Lockscript Execution**: VoteSecure lockscript should validate cell creation rules

---

## 📚 Related Documentation

- **votesecure_architecture.md**: Section "Cell Creation JavaScript" (lines 545-621)
- **Lumos Documentation**: https://docs.nervos.org/docs/reference/lumos/
- **JoyID Integration**: Use `signTransaction(txSkeleton, address)` for complex transactions
- **CKB Transaction Structure**: Inputs consume cells, Outputs create cells

---

## 💡 Summary

**The Problem:**
- Code incorrectly uses `signTransaction(from, to, amount)` with `from === to`
- JoyID rejects this as "cannot send CKB to yourself"

**The Solution:**
- Use `TransactionSkeleton` with proper inputs/outputs
- EventFund is an INPUT (not a destination)
- Voter cells are OUTPUTS (created by the transaction)
- This aligns with the VoteSecure architecture design

**Files to Update:**
1. `ckbServiceBridge.js` - Implement proper `createCellsOnChain()`
2. `blockchain.js` - Update `publishEvent()` and `submitBallot()` to use correct pattern
