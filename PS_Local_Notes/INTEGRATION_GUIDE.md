# VoteSecure Blockchain.js & CKBServiceBridge.js Integration Guide

## Overview

The updated `blockchain.js` and `ckbServiceBridge.js` files are now fully integrated with the **VoteSecure Lockscript configuration** deployed on CKB testnet. These files implement the complete architecture specified in `votesecure_architecture.md` and the white paper.

## Key Changes

### 1. **ckbServiceBridge.js** - New Lockscript Integration

#### Added Functionality:
- **VoteSecure Configuration Import**: Hardcoded `VOTESECURE_CONFIG` with the deployed lockscript details
  ```javascript
  const VOTESECURE_CONFIG = {
    lockscript: {
      codeHash: "0x3b3f2d37f03fac4145aeb092d1e925b5624c86b2d7c9717d526be708c9efb6e1",
      hashType: "data",
      txHash: "0x0ebf65d3adbabb40bae687283b0a51b3dd0fa619e78c890fe0ba516f4eae061f",
      outPoint: { ... },
      deployedAt: "2025-10-21T00:16:14.394657",
      ...
    }
  }
  ```

- **Cell Type Constants**: Defined all VoteSecure cell types for use in queries
  ```javascript
  const VOTESECURE_CELL_TYPES = {
    METADATA: 0x01,
    VOTER: 0x02,
    RESULT: 0x03,
    EVENTFUND: 0x04
  };
  ```

- **Encoding Functions**: New functions to encode cell data for storage on-chain
  - `encodeEventFundData()` - Encodes EventFund cell data
  - `encodeVoterData()` - Encodes voter ballot data
  - `encodeMetadataData()` - Encodes event metadata
  - `encodeResultData()` - Encodes results data

- **Query Functions**: New cell querying capabilities
  - `queryEventFundCells(eventId)` - Find EventFund cells by event
  - `queryMetadataCells(eventId)` - Query event metadata
  - `queryVoterCells(eventId)` - Query voter ballots
  - `queryResultCells(eventId)` - Query result cells

- **Configuration Access**:
  - `getLockscriptConfig()` - Returns deployed lockscript configuration
  - `getCellTypes()` - Returns cell type identifiers
  - All constants exposed via `window.CKBService.config`

#### What Changed:
- ✅ Added VoteSecure cell encoding functions
- ✅ Added cell query functions for Lumos indexer
- ✅ Exposed lockscript config and cell types
- ✅ Maintained all existing CKB transaction functions

---

### 2. **blockchain.js** - Major Refactoring for Lockscript Architecture

#### Removed:
- ❌ `createLockscriptCell()` - No longer needed (lockscript is one-time deployed)
- ❌ Internal cell storage logic (now references remote cells)

#### Redesigned Cell Creation Functions:

**EventFund Cell** (new):
```javascript
createEventFundCell(organizerId, eventId, fundAmountCkb)
```
- Creates sponsorship fund cells
- Uses lockscript with type identifier `0x04`
- Capacity = EventFund base + requested funding amount
- Returns cell with `cellOutput` formatted for CKB transactions

**Metadata Cell** (refactored):
```javascript
createMetadataCell(eventConfig)
```
- Now uses lockscript type script with `0x01` identifier
- Encodes all event config via `window.CKBService.encodeMetadataData()`
- Generates event key pair for ballot encryption
- Computes frontend code hash for integrity verification
- Returns properly formatted `cellOutput`

**Voter Cell** (refactored):
```javascript
createVoterCell(ballot, eventPublicKey, eventId)
```
- Uses lockscript type script with `0x02` identifier
- Encrypts ballot payload with event public key
- Generates voter commitment (proof of ballot inclusion)
- Stores sequence number for revoting support
- Grouped data for k-anonymity enforcement
- Returns properly formatted `cellOutput`

**Result Cell** (refactored):
```javascript
createResultCell(eventId, releasePolicy)
```
- Uses lockscript with `0x03` identifier for type script
- Timelock enforcement via custom lock script
- Supports 3-of-N threshold multisig for result release
- Capacity: 200 CKB (larger for aggregated results)
- Returns properties for unlock rule configuration

#### New Core Functions:

**publishEvent()** - Refactored:
- Now creates EventFund, Metadata, and Result cells together
- Auto-generates eventId if not provided
- Calculates accurate capacity based on estimated voters and update limits
- Returns `estimatedCost` breakdown
- Validates lockscript configuration before publishing

**submitBallot()** - Refactored:
- Ballot fees now paid by EventFund (organizer sponsorship)
- Voter can have empty wallet
- Enforces schedule (voting window)
- Implements revote limits via sequence counter
- Updates EventFund remaining capacity
- Returns receipt with commitment hash and proof URL

**releaseResults()** - Refactored:
- Enforces timelock (can't release before resultsReleaseTime)
- Implements threshold multisig (default 3-of-N)
- Accumulates confirmations from eligible parties
- Unlocks and computes results only when threshold met

**computeResults()** - Enhanced:
- Filters latest ballot per voter (respects revote limit)
- Applies k-anonymity by merging groups below minimum size
- Generates inclusion proofs with voter commitments
- Supports both per-group and aggregate tallying

#### Capacity Constants (in CKB):
```javascript
const CAPACITY_CKB = {
  MIN_CELL: 61,        // Minimum for any cell
  METADATA: 150,       // Event configuration
  RESULT: 200,         // Results storage
  VOTER: 70,           // Per ballot
  EVENTFUND_BASE: 100  // EventFund overhead
};
```

#### Query Functions - Refactored:

- `getEvent(eventId)` - Queries all event data including metadata, results, funds
- `getEventsByOrganizer(organizerId)` - All events for an organizer
- `verifyBallotInclusion(eventId, commitment)` - Proves ballot was counted
- `getLiveStatistics(eventId)` - Real-time turnout and group counts

#### New Helper:

**withdrawEventFunds()** - After event ends:
- Allows organizer to withdraw unused EventFund balance
- Enforces event-ended check
- Returns withdrawn amount

---

## Architecture Alignment

### Cell Structure (Architecture Mapping):

| Cell Type | Purpose | Type Script Args | Lock Script | Capacity |
|-----------|---------|-----------------|-------------|----------|
| **EventFund** | Organizer sponsorship fund | `0x04<eventId>` | Lockscript | 100 + funding CKB |
| **Metadata** | Event config & keys | `0x01<eventId>` | Organizer address | 150 CKB |
| **Voter** | Encrypted ballot | `0x02<eventId>` | Voter JoyID address | 70 CKB |
| **Result** | Aggregated tallies | `0x03<eventId>` | Multisig + timelock | 200 CKB |

### Sponsorship Flow:

```
Organizer connects JoyID → Creates event with EventFund
                        ↓
                   Fund EventFund with estimated voters × cost
                        ↓
Voter submits ballot ← EventFund pays transaction fees
                        ↓
                   Voter has empty wallet (no cost to voter)
                        ↓
            Event ends → Organizer withdraws remainder
```

---

## Usage Example

### Step 1: Initialize
```javascript
// Both files must be loaded in order:
// <script src="ckbServiceBridge.js"></script>
// <script src="blockchain.js"></script>

// Wait for both services
window.addEventListener('ckbServiceReady', () => {
  console.log('CKB Service Ready');
  console.log('Lockscript:', window.CKBService.getLockscriptConfig());
});

window.addEventListener('blockchainReady', () => {
  console.log('Blockchain Module Ready');
});
```

### Step 2: Connect Organizer
```javascript
const organizer = await window.VoteSecureBlockchain.connectJoyID();
console.log('Organizer address:', organizer.address);
console.log('Balance:', organizer.balance);
```

### Step 3: Create Event
```javascript
const eventConfig = {
  eventId: null,  // Auto-generated
  title: "Board Election 2025",
  description: "Annual board member election",
  estimatedVoters: 150,
  questions: [
    {
      id: "q1",
      text: "Select board members (max 3)",
      type: "multi",
      options: [
        { id: "alice", text: "Alice" },
        { id: "bob", text: "Bob" },
        { id: "charlie", text: "Charlie" }
      ]
    }
  ],
  schedule: {
    startTime: Date.now(),
    endTime: Date.now() + 7 * 24 * 60 * 60 * 1000,  // 7 days
    resultsReleaseTime: Date.now() + 7 * 24 * 60 * 60 * 1000 + 3600000  // +1 hour
  },
  eligibility: {
    type: "invite_key",
    keyHash: "0x..."
  },
  anonymityLevel: "full",
  reportingGranularity: "totals_only",
  allowedUpdates: 3,
  minGroupSize: 5,
  liveStatsMode: "hidden"
};

const result = await window.VoteSecureBlockchain.publishEvent(eventConfig, organizer.address);
if (result.success) {
  console.log('Event published!');
  console.log('Event ID:', result.event.eventId);
  console.log('Event URL:', result.eventUrl);
  console.log('Cost:', result.estimatedCost.totalCost, 'CKB');
  console.log('Explorer:', result.explorerUrl);
} else {
  console.error('Publication failed:', result.error);
}
```

### Step 4: Submit Ballot (Voter)
```javascript
const voter = await window.VoteSecureBlockchain.connectJoyID();

const ballot = {
  eventId: "evt_xxx",
  answers: {
    q1: ["alice", "bob"]  // Selected 2 of 3
  },
  groupingData: {
    department: "Engineering",
    location: "Berlin"
  }
  // Note: voterId and sequence auto-filled by submitBallot()
};

const receipt = await window.VoteSecureBlockchain.submitBallot(ballot, voter.address);
if (receipt.success) {
  console.log('Ballot submitted!');
  console.log('Commitment:', receipt.receipt.commitment);
  console.log('Proof URL:', receipt.receipt.proofUrl);
  console.log('TxHash:', receipt.receipt.txHash);
  // Voter saves this receipt for later verification
} else {
  console.error('Submission failed:', receipt.error);
}
```

### Step 5: Verify Inclusion
```javascript
// Voter can later verify their ballot was counted using commitment
const verification = window.VoteSecureBlockchain.verifyBallotInclusion(
  "evt_xxx",
  "0xabc123..."  // commitment from receipt
);

console.log('Verified:', verification.verified);
if (verification.verified) {
  console.log('Your ballot is in the tally at sequence:', verification.sequence);
}
```

### Step 6: Release Results
```javascript
// After results release time, organizer (or authorized party) releases
const releaseResult = await window.VoteSecureBlockchain.releaseResults(
  "evt_xxx",
  organizer.address  // confirmerId (counts as 1 of 3 required)
);

if (releaseResult.success) {
  console.log('Results released!');
  console.log('Final tally:', releaseResult.results.totals);
} else if (!releaseResult.success && releaseResult.confirmations !== undefined) {
  console.log(`${releaseResult.confirmations} of ${releaseResult.required} confirmations received`);
}
```

### Step 7: Withdraw Funds
```javascript
// After event ends, organizer can withdraw unused EventFund balance
const withdrawal = await window.VoteSecureBlockchain.withdrawEventFunds(
  "evt_xxx",
  organizer.address
);

if (withdrawal.success) {
  console.log('Withdrawn:', withdrawal.withdrawnAmount, 'CKB');
}
```

---

## Configuration Reference

### VoteSecure Lockscript (from CKBService.config)

```javascript
window.CKBService.config.VOTESECURE_CONFIG = {
  lockscript: {
    codeHash: "0x3b3f2d37f03fac4145aeb092d1e925b5624c86b2d7c9717d526be708c9efb6e1",
    hashType: "data",
    txHash: "0x0ebf65d3adbabb40bae687283b0a51b3dd0fa619e78c890fe0ba516f4eae061f",
    outPoint: {
      txHash: "0x0ebf65d3adbabb40bae687283b0a51b3dd0fa619e78c890fe0ba516f4eae061f",
      index: "0x0"
    },
    deployedAt: "2025-10-21T00:16:14.394657",
    deployedBy: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqdw2upan53dl6efk64fz6luewp8m6mjffctw548v",
    network: "testnet",
    binarySizeBytes: 3672,
    capacityShannons: 7100003672,
    capacityCkb: 71.00003672
  }
};

// Cell type identifiers
window.CKBService.config.VOTESECURE_CELL_TYPES = {
  METADATA: 0x01,
  VOTER: 0x02,
  RESULT: 0x03,
  EVENTFUND: 0x04
};

// Capacity constants (exposed via blockchain.js)
window.VoteSecureBlockchain.CAPACITY_CKB = {
  MIN_CELL: 61,
  METADATA: 150,
  RESULT: 200,
  VOTER: 70,
  EVENTFUND_BASE: 100
};
```

---

## Migration Notes

### For organizer.js:
- No changes required - calls to `window.VoteSecureBlockchain.publishEvent()` work as before
- Cost estimation now uses lockscript-aligned capacities
- Cell encoding is automatic via `CKBService`

### For voter.js (to be implemented):
- Use `window.VoteSecureBlockchain.submitBallot()` for ballot submission
- Voter receives commitment hash in receipt
- Use `verifyBallotInclusion()` to verify later
- No wallet funding needed (EventFund sponsors)

### For result aggregation:
- `window.VoteSecureBlockchain.releaseResults()` handles multisig threshold
- `computeResults()` applies k-anonymity automatically
- Results available after threshold confirmations met

---

## Deployment Flow (Production)

1. **Lockscript Deployment** (one-time):
   - Deploy Rust lockscript to CKB testnet
   - Get code hash and out_point
   - Update `VOTESECURE_CONFIG` in ckbServiceBridge.js

2. **Frontend Deployment**:
   - Deploy updated `ckbServiceBridge.js` and `blockchain.js`
   - Frontend loads both files in order
   - CKBService registers itself, blockchain.js queries config

3. **Event Creation** (per event):
   - Organizer connects JoyID
   - Creates event with EventFund
   - Blockchain.js creates EventFund, Metadata, Result cells
   - Lockscript validates all operations

4. **Voting Phase**:
   - Voters submit ballots (sponsored by EventFund)
   - Lockscript validates sequence and timing
   - EventFund capacity decreases per ballot

5. **Result Release**:
   - After timelock expires, organizer can release
   - Threshold multisig enforced by lockscript
   - Results decrypt and aggregate automatically

---

## API Summary

### CKBService (window.CKBService)

**Connection:**
- `connectJoyID()` → `{address, balance, network}`
- `waitForTransaction(txHash)` → `{status, ...}`

**Encoding:**
- `encodeEventFundData(data)` → hex string
- `encodeMetadataData(data)` → hex string
- `encodeVoterData(data)` → hex string
- `encodeResultData(data)` → hex string

**Queries:**
- `queryEventFundCells(eventId)` → Cell[]
- `queryMetadataCells(eventId)` → Cell[]
- `queryVoterCells(eventId)` → Cell[]
- `queryResultCells(eventId)` → Cell[]

**Configuration:**
- `getLockscriptConfig()` → {...}
- `getCellTypes()` → {METADATA, VOTER, RESULT, EVENTFUND}

### VoteSecureBlockchain (window.VoteSecureBlockchain)

**Core Operations:**
- `publishEvent(config, organizerAddress)` → {success, event, txHash, ...}
- `submitBallot(ballot, voterAddress)` → {success, receipt}
- `releaseResults(eventId, confirmerId)` → {success, results, ...}
- `withdrawEventFunds(eventId, organizerAddress)` → {success, withdrawnAmount}

**Queries:**
- `getEvent(eventId)` → Event
- `getEventsByOrganizer(organizerId)` → Event[]
- `verifyBallotInclusion(eventId, commitment)` → {verified, ...}
- `getLiveStatistics(eventId)` → {totalBallots, uniqueVoters, ...}

**Utilities:**
- `estimateEventCost(config)` → {totalCost, breakdown, ...}
- `generateKeyPair()` → {publicKey, privateKey}
- `encryptBallot(data, publicKey)` → encrypted
- `generateHash(data)` → hex hash
- `generateBallotCommitment(ballot)` → commitment hash
- `generateEventId()` → "evt_xxx"

---

## Testing Checklist

- [ ] ckbServiceBridge loads without errors
- [ ] `window.CKBService` available with all functions
- [ ] Lockscript config accessible via `getLockscriptConfig()`
- [ ] blockchain.js loads and detects lockscript config
- [ ] `connectJoyID()` works and returns address
- [ ] Cost estimation aligns with lockscript capacities
- [ ] `publishEvent()` creates all three cell types
- [ ] EventFund cell capacity includes funding amount
- [ ] `submitBallot()` properly encodes voter data
- [ ] Ballot submission updates EventFund capacity
- [ ] Result cell has timelock enforcement
- [ ] `releaseResults()` requires 3 confirmations
- [ ] `computeResults()` applies k-anonymity correctly
- [ ] `verifyBallotInclusion()` finds voter cells by commitment
- [ ] `withdrawEventFunds()` enforces event-ended check
- [ ] All cell queries work via indexer
- [ ] Organizer.js integration unchanged
- [ ] Voter.js can be built with new submitBallot API

---

## Next Steps

1. **voter.js Implementation**:
   - Import `window.VoteSecureBlockchain`
   - Implement ballot form UI
   - Call `submitBallot()` on submission
   - Display receipt with commitment
   - Verify inclusion after voting closes

2. **Lock script Customization** (if needed):
   - Adjust validation rules in Rust
   - Modify cell type identifiers
   - Update `VOTESECURE_CONFIG` after redeploy

3. **Production Testing**:
   - End-to-end test on testnet
   - Load testing with multiple voters
   - Security audit of cell encoding
   - Performance profiling

4. **Mainnet Preparation**:
   - Deploy lockscript to mainnet
   - Update config for mainnet RPC/indexer
   - Update JoyID endpoints
   - Prepare mainnet launch plan
