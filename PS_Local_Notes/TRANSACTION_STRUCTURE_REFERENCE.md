# VoteSecure Transaction Structure Reference

## Overview

This document shows the exact transaction structures for VoteSecure operations, demonstrating why the old "send to yourself" approach was wrong and how the corrected structure works.

---

## ❌ WRONG: Current Broken Approach

### What the Code Currently Does

```
blockchain.js:
  createCellsOnChain(organizerAddress, [eventFundCell, metadataCell, resultCell])
    ↓
  signAndSendTransaction(organizerAddress, organizerAddress, totalCKB)
    ↓
  signTransaction({
    from: ckt1qzda0cr08m...  (organizer)
    to:   ckt1qzda0cr08m...  (SAME - organizer)
    amount: 50000000000       (50,000 CKB in shannons)
  })
    ↓
  ❌ "You cannot send CKB to yourself"
```

### Why JoyID Rejects This

JoyID's `signTransaction(from, to, amount)` is designed for **simple peer-to-peer transfers**:

```
Input:  [ckt1qz... cell with 60,000 CKB]
  ↓
Output: [ckt1qz... cell with 50,000 CKB]
  ↓
Change: [ckt1qz... cell with 10,000 - fee CKB]
```

This structure makes sense: "Send 50,000 to someone else."

When `to === from`, it becomes:
```
Input:  [ckt1qz... cell with 60,000 CKB]
  ↓
Output: [ckt1qz... cell with 50,000 CKB]  ← To same address!
  ↓
Change: [ckt1qz... cell with 10,000 - fee CKB]
```

**This is wasteful and doesn't make sense,** so JoyID rejects it.

---

## ✅ CORRECT: New Approach with TransactionSkeleton

### What the Corrected Code Should Do

```
blockchain.js:
  publishEvent(eventConfig, organizerAddress)
    ↓
  createCellsOnChain(organizerAddress, [eventFundCell, metadataCell, resultCell])
    ↓
  // Build proper transaction with multiple outputs
  TransactionSkeleton()
    .update('inputs', [spendable cells])
    .update('outputs', [EventFund, Metadata, Result])
    .update('cellDeps', [lockscript reference])
    ↓
  payFeeByFeeRate(txSkeleton, addresses, feeRate)
    ↓
  joyidSignTransaction(txJson, organizerAddress)
    ↓
  ✅ Transaction sent successfully
```

### Transaction Structure: Publish Event

#### Inputs (What's Consumed)

```
┌─────────────────────────────────────────────────────┐
│ Input Cell 1                                        │
│ Lock: organizer's JoyID script                      │
│ Capacity: 60,000 CKB (6,000,000,000 shannons)      │
│ Type: None (empty/plain CKB cell)                  │
│ Data: 0x (empty)                                    │
└─────────────────────────────────────────────────────┘
        ↓ CONSUMED
┌─────────────────────────────────────────────────────┐
│ Input Cell 2                                        │
│ Lock: organizer's JoyID script                      │
│ Capacity: 40,000 CKB (4,000,000,000 shannons)      │
│ Type: None                                          │
│ Data: 0x                                            │
└─────────────────────────────────────────────────────┘
```

**Total Input Capacity: 100,000 CKB**

#### Outputs (What's Created)

```
┌─────────────────────────────────────────────────────┐
│ Output 1: EventFund Cell                            │
│ Lock:                                               │
│   codeHash: VOTESECURE_LOCKSCRIPT_HASH             │
│   hashType: data                                    │
│   args: 0x04 + eventId                    │
│ Type: None                                          │
│ Capacity: 500 CKB (50,000,000,000 shannons)        │
│ Data: {                                             │
│   "eventId": "evt_...",                            │
│   "organizerPubKeyHash": "0xabc...",               │
│   "initialFunds": 500,                             │
│   "remainingFunds": 500,                           │
│   "createdAt": 1729425600                          │
│ }                                                   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Output 2: Metadata Cell                             │
│ Lock: organizer's JoyID address                    │
│ Type:                                               │
│   codeHash: VOTESECURE_LOCKSCRIPT_HASH             │
│   hashType: data                                    │
│   args: 0x01 + eventId                    │
│ Capacity: 150 CKB (15,000,000,000 shannons)        │
│ Data: {                                             │
│   "eventId": "evt_...",                            │
│   "title": "Board Election 2025",                  │
│   "questions": [...],                              │
│   "schedule": {...},                               │
│   "eligibility": {...},                            │
│   "anonymityLevel": "full",                        │
│   "publicKey": "RSA_PUB_KEY",                      │
│   ...                                               │
│ }                                                   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Output 3: Result Cell                               │
│ Lock:                                               │
│   codeHash: VOTESECURE_LOCKSCRIPT_HASH             │
│   hashType: data                                    │
│   args: 0x03 + eventId                    │
│ Type:                                               │
│   codeHash: VOTESECURE_LOCKSCRIPT_HASH             │
│   hashType: data                                    │
│   args: 0x03 + eventId                    │
│ Capacity: 200 CKB (20,000,000,000 shannons)        │
│ Data: {                                             │
│   "eventId": "evt_...",                            │
│   "status": "locked",                              │
│   "encryptedResults": null,                        │
│   "results": null,                                 │
│   "includedBallots": [],                           │
│   "confirmations": []                              │
│ }                                                   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Output 4: Change Cell (Organizer's Leftover)        │
│ Lock: organizer's JoyID script                      │
│ Type: None                                          │
│ Capacity: 99,050 CKB (9,905,000,000 shannons)      │
│ Data: 0x (empty)                                    │
│                                                     │
│ (100,000 input - 850 output - 100 fee)            │
└─────────────────────────────────────────────────────┘
```

#### Cell Dependencies (What Contracts Are Used)

```
┌─────────────────────────────────────────────────────┐
│ Cell Dep 1: VoteSecure Lockscript Code              │
│ OutPoint:                                            │
│   txHash: 0x0ebf65d3adbabb40bae687283b0a51b3...   │
│   index: 0x0                                        │
│ DepType: code                                       │
│                                                     │
│ This cell contains the Rust binary that validates  │
│ all VoteSecure cell operations (EventFund rules,   │
│ Ballot validation, Result release, etc.)           │
└─────────────────────────────────────────────────────┘
```

#### Witnesses (Signatures)

```
┌─────────────────────────────────────────────────────┐
│ Witness 1: JoyID Signature                          │
│ Signed by: organizer's JoyID private key           │
│ Covers:    All inputs and outputs of transaction   │
│                                                     │
│ Format: [0xXXXX...0000] (placeholder until signed) │
└─────────────────────────────────────────────────────┘
```

#### Final Transaction JSON

```json
{
  "version": "0x0",
  "cellDeps": [
    {
      "outPoint": {
        "txHash": "0x0ebf65d3adbabb40bae687283b0a51b3dd0fa619e78c890fe0ba516f4eae061f",
        "index": "0x0"
      },
      "depType": "code"
    }
  ],
  "headerDeps": [],
  "inputs": [
    {
      "previousOutput": {
        "txHash": "0xabcd...1234",
        "index": "0x0"
      },
      "since": "0x0"
    },
    {
      "previousOutput": {
        "txHash": "0xabcd...5678",
        "index": "0x1"
      },
      "since": "0x0"
    }
  ],
  "outputs": [
    {
      "capacity": "0xba43b74000",  // 500 CKB in shannons
      "lock": {
        "codeHash": "0x3b3f2d37f03fac4145aeb092d1e925b5624c86b2d7c9717d526be708c9efb6e1",
        "hashType": "data",
        "args": "0x04evt_1729425600_abc123..."
      },
      "type": null
    },
    {
      "capacity": "0x37e11d0000",  // 150 CKB
      "lock": {
        "codeHash": "0x9bd7e06f3ecf4be0f2ffa1a7eca6d5ac0fef8b3b36e6a6ff99d6a5d72daabd9e",
        "hashType": "type",
        "args": "0x..."  // organizer's lock args
      },
      "type": {
        "codeHash": "0x3b3f2d37f03fac4145aeb092d1e925b5624c86b2d7c9717d526be708c9efb6e1",
        "hashType": "data",
        "args": "0x01evt_1729425600_abc123..."
      }
    },
    {
      "capacity": "0x4b3b4b0000",  // 200 CKB
      "lock": {
        "codeHash": "0x3b3f2d37f03fac4145aeb092d1e925b5624c86b2d7c9717d526be708c9efb6e1",
        "hashType": "data",
        "args": "0x03evt_1729425600_abc123..."
      },
      "type": {
        "codeHash": "0x3b3f2d37f03fac4145aeb092d1e925b5624c86b2d7c9717d526be708c9efb6e1",
        "hashType": "data",
        "args": "0x03evt_1729425600_abc123..."
      }
    },
    {
      "capacity": "0x24d7f22700",  // Change: ~99,050 CKB
      "lock": {
        "codeHash": "0x9bd7e06f3ecf4be0f2ffa1a7eca6d5ac0fef8b3b36e6a6ff99d6a5d72daabd9e",
        "hashType": "type",
        "args": "0x..."  // organizer's lock args
      },
      "type": null
    }
  ],
  "outputsData": [
    "0x{eventFundData}",
    "0x{metadataData}",
    "0x{resultData}",
    "0x"  // change cell has no data
  ],
  "witnesses": [
    "0x{joyidSignature}"
  ]
}
```

---

## Submit Ballot with EventFund Sponsorship

### Transaction Structure: Voter Ballot Submission

#### Inputs (EventFund Sponsorship)

```
┌─────────────────────────────────────────────────────┐
│ Input 1: EventFund Cell                             │
│ Lock:                                               │
│   codeHash: VOTESECURE_LOCKSCRIPT_HASH             │
│   hashType: data                                    │
│   args: 0x04 + eventId                    │
│ Capacity: 450 CKB (remaining after voters)         │
│ Data: EventFund data (to be updated)                │
│                                                     │
│ PURPOSE: Sponsor the voter cell creation           │
│          (voter pays nothing!)                     │
└─────────────────────────────────────────────────────┘
```

#### Outputs (Voter Cell + Updated EventFund)

```
┌─────────────────────────────────────────────────────┐
│ Output 1: New Voter Cell                            │
│ Lock: voter's JoyID address                        │
│ Type:                                               │
│   codeHash: VOTESECURE_LOCKSCRIPT_HASH             │
│   hashType: data                                    │
│   args: 0x02 + eventId                    │
│ Capacity: 70 CKB (comes from EventFund sponsor)    │
│ Data: {                                             │
│   "eventId": "evt_...",                            │
│   "voterCommitment": "0xabc...",                   │
│   "encryptedBallot": "RSA_ENCRYPTED...",           │
│   "sequence": 1,                                    │
│   "groupingData": {"city": "Berlin", ...},         │
│   "timestamp": 1729500000,                         │
│   "voterPubKeyHash": "0xdef..."                    │
│ }                                                   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Output 2: Updated EventFund Cell                    │
│ Lock:                                               │
│   codeHash: VOTESECURE_LOCKSCRIPT_HASH             │
│   hashType: data                                    │
│   args: 0x04 + eventId                    │
│ Capacity: 380 CKB (reduced by 70 for voter)        │
│ Data: {                                             │
│   "eventId": "evt_...",                            │
│   "organizerPubKeyHash": "0xabc...",               │
│   "initialFunds": 500,                             │
│   "remainingFunds": 380,    ← REDUCED!             │
│   "createdAt": 1729425600                          │
│ }                                                   │
└─────────────────────────────────────────────────────┘
```

#### Why This Works (And Why "Send to Yourself" Doesn't)

**Old Wrong Approach:**
```
signTransaction(
  from: organizer,
  to: organizer,     ← SAME ADDRESS!
  amount: 70 CKB
)
```
JoyID sees: "Transfer 70 CKB from you to yourself" → ❌ Rejected

**Correct Approach:**
```
TransactionSkeleton:
  Inputs:  [EventFund from organizer]
  Outputs: [Voter cell, Updated EventFund]
```
JoyID sees: "Create 2 new cells from existing cell" → ✅ Accepted

The key difference:
- **Wrong:** Simple peer-to-peer transfer (doesn't make sense to yourself)
- **Correct:** Cell-based state transition (EventFund consumed, new cells created)

---

## On-Chain Cell Structure After Transactions

### After `publishEvent()` is Confirmed

```
Blockchain State:
│
├─ EventFund Cell [Cell #1]
│  ├─ Lock: VOTESECURE_LOCKSCRIPT(0x04 + eventId)
│  ├─ Capacity: 500 CKB
│  └─ Data: Funds tracking
│
├─ Metadata Cell [Cell #2]
│  ├─ Lock: organizer's address
│  ├─ Type: VOTESECURE_LOCKSCRIPT(0x01 + eventId)
│  ├─ Capacity: 150 CKB
│  └─ Data: Event config, questions, schedule, etc.
│
├─ Result Cell [Cell #3]
│  ├─ Lock: VOTESECURE_LOCKSCRIPT(0x03 + eventId)
│  ├─ Type: VOTESECURE_LOCKSCRIPT(0x03 + eventId)
│  ├─ Capacity: 200 CKB
│  └─ Data: Encrypted results (locked until release)
│
└─ Other cells...
```

### After First `submitBallot()` is Confirmed

```
Blockchain State:
│
├─ EventFund Cell (UPDATED) [Cell #1]
│  ├─ Lock: VOTESECURE_LOCKSCRIPT(0x04 + eventId)
│  ├─ Capacity: 430 CKB (reduced by 70)
│  └─ Data: Funds tracking updated
│
├─ Metadata Cell [Cell #2]
│  └─ (unchanged)
│
├─ Result Cell [Cell #3]
│  └─ (unchanged)
│
├─ Voter Cell [Cell #4]  ← NEW!
│  ├─ Lock: voter's JoyID address
│  ├─ Type: VOTESECURE_LOCKSCRIPT(0x02 + eventId)
│  ├─ Capacity: 70 CKB
│  └─ Data: Encrypted ballot
│
└─ Other cells...
```

---

## Debug: How to Verify Transaction Structure

### Check on CKB Explorer

1. **Go to testnet explorer:**
   ```
   https://pudge.explorer.nervos.org/transaction/{txHash}
   ```

2. **Verify Inputs:**
   - Should see plain CKB cells from organizer
   - Lock script should be organizer's JoyID

3. **Verify Outputs:**
   - Should see EventFund, Metadata, Result, Change
   - Each with correct lock/type scripts
   - Capacities match expected values

4. **Verify Cell Dependencies:**
   - Should list VoteSecure lockscript
   - Points to deployed contract cell

5. **Verify Witnesses:**
   - Should show JoyID signature present
   - Signature valid (transaction confirmed)

### Debugging in Code

```javascript
// Log transaction before signing
console.log('TX JSON:');
console.log(JSON.stringify({
  version: txSkeleton.get('version'),
  cellDeps: txSkeleton.get('cellDeps').toJSON(),
  inputs: txSkeleton.get('inputs').toJSON(),
  outputs: txSkeleton.get('outputs').toJSON(),
  outputsData: txSkeleton.get('outputsData').toJSON()
}, null, 2));

// Should see:
// - Multiple inputs from organizer
// - Multiple outputs (EventFund, Metadata, Result, Change)
// - VoteSecure lockscript in cellDeps
// - outputsData with encoded cell data
```

---

## Summary Table

| Aspect | Wrong Approach | Correct Approach |
|--------|---|---|
| **Function** | `signTransaction(from, to, amount)` | `TransactionSkeleton` |
| **Semantics** | Peer-to-peer transfer | Cell creation |
| **From == To** | Rejected by JoyID | Not applicable |
| **New Cells** | Not created | Created as outputs |
| **Sponsorship** | N/A | Works (EventFund as input) |
| **Lock Script** | Standard address | VoteSecure or address |
| **Type Script** | None | VoteSecure for special cells |
| **Cell Deps** | Optional | Required (lockscript) |
| **Witnesses** | Single signature | Can be multiple |

---

## Key Takeaways

1. **Never use `signTransaction(addr, addr, amount)`** - JoyID rejects sending to yourself
2. **Always use `TransactionSkeleton`** for cell creation on VoteSecure
3. **EventFund is an INPUT**, not a destination
4. **Voter cells are OUTPUTS**, created by the transaction
5. **Add lockscript as cell dep** so VoteSecure validation runs
6. **Include change output** so organizer doesn't lose funds
7. **Calculate fees properly** using `payFeeByFeeRate()`
