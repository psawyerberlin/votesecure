# Quick Start Guide - JoyID Integration

## ✅ Pre-flight Checklist

### File Structure
```
votesecure/
├─ src/
│  ├─ blockchain.js          ✅ Existing
│  └─ ckbServiceBridge.js    🆕 NEW - Create this
├─ web/
│  ├─ organizer.html         🔄 REPLACE
│  ├─ organizer.js           🔄 REPLACE
│  └─ votesecure.css         ✅ Keep as-is
└─ package.json              🔄 UPDATE
```

## 🚀 5-Minute Setup

### Step 1: Install Dependencies (2 min)

```bash
cd votesecure

# Create/update package.json
npm init -y

# Install required packages
npm install @joyid/ckb @ckb-lumos/lumos vite --save
```

### Step 2: Create Files (1 min)

**Create:** `src/ckbServiceBridge.js`
- Copy the provided `ckbServiceBridge.js` code
- Save in `src/` folder

**Replace:** `web/organizer.html`
- Replace with the improved version

**Replace:** `web/organizer.js`
- Replace with the improved version

### Step 3: Configure Network (30 sec)

Edit `src/ckbServiceBridge.js`:

```javascript
// Line 10-12
const DEBUG_LOG = true;
const USE_MAINNET = false;        // ← Keep false for testing
const USE_PRIVATE_NODE = true;    // ← true if you have a local node

// Line 24-25 (if using private node)
const RPC_URL = USE_PRIVATE_NODE
  ? 'http://192.168.178.94:8112'  // ← Update to YOUR node IP
  : 'https://testnet.ckb.dev/rpc';
```

### Step 4: Start Development Server (30 sec)

```bash
# Start Vite dev server
npx vite

# OR use Python
# python -m http.server 8080

# Server will start at http://localhost:5173
```

### Step 5: Test It! (1 min)

1. Open: `http://localhost:5173/web/organizer.html`
2. Open browser console (F12)
3. Look for: `✓ CKB Service Bridge loaded successfully`
4. Click "Connect JoyID" button
5. Complete JoyID authentication
6. See your wallet address and balance!

## 🎯 Expected Console Output

When everything works correctly:

```
VoteSecure Organizer initializing...
Waiting for CKB Service...
✓ CKB Service Bridge loaded successfully
  Network: testnet
  RPC: http://192.168.178.94:8112
  Indexer: http://192.168.178.94:8112
✓ CKB Service ready
VoteSecure Organizer loaded successfully
Debug interface available at: window.VoteSecureOrganizer

// After clicking "Connect JoyID":
Initiating JoyID connection...
JoyID connection successful: {
  address: "ckb1...",
  balance: "100.00000000",
  network: "testnet"
}
✓ Wallet connected successfully
[SUCCESS] Wallet connected successfully!
```

## 🐛 Common Issues

### "Module not found"
```bash
# Solution: Install dependencies
npm install
```

### "CKBService is not defined"
```html
<!-- Check organizer.html has: -->
<script type="module" src="../src/ckbServiceBridge.js"></script>
<!--         ^^^^^^^^^^^^ IMPORTANT -->
```

### CORS Error
```bash
# Solution: Use dev server, not file://
npx vite
# Then open http://localhost:5173/web/organizer.html
```

### JoyID popup blocked
- Check browser allows popups
- Try allowing popups for localhost

## 🧪 Quick Tests

### Test 1: Check Service
```javascript
// In browser console
console.log(window.CKBService);
// Should show object with functions
```

### Test 2: Check Organizer
```javascript
// In browser console
console.log(window.VoteSecureOrganizer);
// Should show { currentOrganizer, electionConfig, ... }
```

### Test 3: Manual Connect
```javascript
// In browser console
await window.CKBService.connectJoyID();
// Should open JoyID popup
```

## 📝 Key Points

1. **ALWAYS use `type="module"`** for ckbServiceBridge.js
2. **ALWAYS use a dev server** - never open files directly
3. **Check console** - all status messages appear there
4. **Test on testnet** - never use mainnet for testing
5. **Keep F12 open** - monitor for errors

## 🎓 Understanding the Flow

```
organizer.html loads
    ↓
ckbServiceBridge.js (ES6 module)
    ↓ imports @joyid/ckb, @ckb-lumos/lumos
    ↓ creates window.CKBService
    ↓ dispatches 'ckbServiceReady' event
    ↓
blockchain.js loads
    ↓ creates window.VoteSecureBlockchain
    ↓
organizer.js loads
    ↓ waits for window.CKBService
    ↓ enables "Connect JoyID" button
    ↓
User clicks "Connect JoyID"
    ↓
organizer.js calls window.CKBService.connectJoyID()
    ↓
ckbServiceBridge.js calls @joyid/ckb connect()
    ↓
JoyID popup appears
    ↓
User authenticates
    ↓
Wallet connected! 🎉
```

## ✨ Success Indicators

You know it's working when:

1. ✅ Console shows "CKB Service Bridge loaded"
2. ✅ Console shows "CKB Service ready"
3. ✅ Status indicator turns green
4. ✅ "Connect JoyID" button is enabled
5. ✅ Clicking button opens JoyID popup
6. ✅ After auth, wallet address appears
7. ✅ Balance shows in header

## 🚨 Stop and Debug If:

- ❌ Console has red errors
- ❌ Status indicator stays yellow/loading
- ❌ Button stays disabled after 5 seconds
- ❌ JoyID popup doesn't appear
- ❌ Balance shows 0.00000000 (might need funds)

## 📚 Next Steps

Once wallet connection works:

1. Try creating a test election
2. Add some questions
3. Review the cost estimate
4. Publish to blockchain (testnet!)
5. Check transaction in explorer

## 💡 Pro Tips

1. **Use Chrome DevTools** - Best ES6 module support
2. **Keep dependencies updated** - `npm update`
3. **Monitor network tab** - See API calls
4. **Use testnet faucet** - Get free test CKB
5. **Save wallet sessions** - Uses sessionStorage

## 🆘 Still Stuck?

Check these in order:

1. Node.js installed? `node --version`
2. Dependencies installed? `ls node_modules`
3. Dev server running? Check terminal
4. Console errors? Press F12
5. Correct URL? Should be localhost:PORT
6. Files in right place? Check paths
7. Module syntax correct? Check `type="module"`

---

**Time to success:** ~5 minutes
**Difficulty:** Easy 🟢
**Prerequisites:** Node.js, text editor, browser

**Ready?** Start with Step 1! 🚀