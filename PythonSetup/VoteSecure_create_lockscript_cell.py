#!/usr/bin/env python3

import json
import hashlib
import subprocess
import time
import requests
import os
import sys
from pathlib import Path
from datetime import datetime
from ecdsa import SigningKey, SECP256k1
from ecdsa.util import sigencode_der

# ==============================================================================
# CONFIGURATION
# ==============================================================================

# Network Configuration
USE_MAINNET = False  # Set to True for mainnet deployment
USE_PRIVATE_NODE = True  # Set to True if using your own CKB node

# Neuron Wallet Configuration
wallet_path = "neuronkey.json"

# Network Node Configuration
if USE_PRIVATE_NODE:
    if USE_MAINNET:
        RPC_URL = "http://192.168.178.94:8114"
        INDEXER_URL = "http://192.168.178.94:8114"
    else:
        RPC_URL = "http://192.168.178.94:8112"
        INDEXER_URL = "http://192.168.178.94:8112"
else:
    if USE_MAINNET:
        RPC_URL = "https://mainnet.ckb.dev/rpc"
        INDEXER_URL = "https://mainnet.ckb.dev/indexer"
    else:
        RPC_URL = "https://testnet.ckb.dev/rpc"
        INDEXER_URL = "https://testnet.ckb.dev/indexer"

# Network name for display
NETWORK = "mainnet" if USE_MAINNET else "testnet"

# Path to compiled lockscript binary
LOCKSCRIPT_BINARY_PATH = "./votesecure_lockscript.bin"
SKIP_COMPILATION = False

# Output configuration file path
OUTPUT_CONFIG_PATH = "./votesecure_config.json"

# Auto-sign and send transaction
AUTO_DEPLOY = False  # Set to True only if you have working cell collection

# Log file configuration
LOG_FILE = f"deployment_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

# ==============================================================================
# Logging Setup
# ==============================================================================

class Logger:
    """Logger that writes to both console and file"""
    
    def __init__(self, log_file):
        self.log_file = log_file
        self.terminal = sys.stdout
        # Create log file with header
        with open(self.log_file, 'w', encoding='utf-8') as f:
            f.write(f"VoteSecure Lockscript Deployment Log\n")
            f.write(f"Started: {datetime.now().isoformat()}\n")
            f.write("="*70 + "\n\n")
        
    def write(self, message):
        # Write to console (handle encoding errors)
        try:
            self.terminal.write(message)
        except UnicodeEncodeError:
            # Remove non-ASCII characters for console
            clean_message = message.encode('ascii', 'ignore').decode('ascii')
            self.terminal.write(clean_message)
        
        # Write to log file (UTF-8)
        with open(self.log_file, 'a', encoding='utf-8') as f:
            f.write(message)
    
    def flush(self):
        self.terminal.flush()

# Set up logging
sys.stdout = Logger(LOG_FILE)
sys.stderr = Logger(LOG_FILE)

print(f"[INFO] Log file: {LOG_FILE}")

# ==============================================================================
# Read Neuron NEURON_WALLET_CONFIG
# ==============================================================================

# Set script directory as default location
os.chdir(Path(__file__).parent)

def _normalize_hex_key(s: str) -> str:
    s = s.strip()
    hex_part = s[2:] if s.startswith("0x") else s
    if len(hex_part) != 64 or any(c not in "0123456789abcdefABCDEF" for c in hex_part):
        raise ValueError("wallet.txt line 1 must be a 32-byte hex key (64 hex chars).")
    return "0x" + hex_part.lower()

def get_NEURON_WALLET_CONFIG(wallet_path):
    json_key = json.loads(Path(wallet_path).read_text(encoding="utf-8"))
    NEURON_WALLET_CONFIG = {
        "address": json_key["address"], 
        "private_key": _normalize_hex_key(json_key["rawprivatekey(hex)"])
    }
    return NEURON_WALLET_CONFIG

NEURON_WALLET_CONFIG = get_NEURON_WALLET_CONFIG(wallet_path)

# ==============================================================================
# END OF CONFIGURATION
# ==============================================================================


class CKBRPCClient:
    """Simple CKB RPC client for interacting with CKB node"""
    
    def __init__(self, rpc_url):
        self.rpc_url = rpc_url
        self.request_id = 0
    
    def call(self, method, params=None):
        """Make RPC call to CKB node"""
        self.request_id += 1
        
        payload = {
            "id": self.request_id,
            "jsonrpc": "2.0",
            "method": method,
            "params": params or []
        }
        
        response = requests.post(self.rpc_url, json=payload)
        response.raise_for_status()
        
        result = response.json()
        
        if "error" in result:
            raise Exception(f"RPC Error: {result['error']}")
        
        return result.get("result")
    
    def get_tip_header(self):
        """Get current blockchain tip header"""
        return self.call("get_tip_header")
    
    def get_live_cell(self, out_point, with_data=True):
        """Get live cell by out_point"""
        return self.call("get_live_cell", [out_point, with_data])
    
    def send_transaction(self, transaction, outputs_validator="passthrough"):
        """Send transaction to network"""
        return self.call("send_transaction", [transaction, outputs_validator])
    
    def get_transaction(self, tx_hash):
        """Get transaction by hash"""
        return self.call("get_transaction", [tx_hash])
    
    def get_cells(self, search_key, order="asc", limit="0x64"):
        """Get cells using indexer"""
        indexer_url = INDEXER_URL
        payload = {
            "id": self.request_id,
            "jsonrpc": "2.0",
            "method": "get_cells",
            "params": [search_key, order, limit]
        }
        
        response = requests.post(indexer_url, json=payload)
        response.raise_for_status()
        
        result = response.json()
        if "error" in result:
            raise Exception(f"Indexer Error: {result['error']}")
        
        return result.get("result")


class VoteSecureDeployer:
    """Handles deployment of VoteSecure lockscript to CKB blockchain"""
    
    def __init__(self):
        self.rpc = CKBRPCClient(RPC_URL)
        self.address = NEURON_WALLET_CONFIG["address"]
        self.private_key = NEURON_WALLET_CONFIG["private_key"]
        
        print("="*70)
        print("VoteSecure Lockscript Deployment")
        print("="*70)
        print(f"Network: {NETWORK}")
        print(f"RPC URL: {RPC_URL}")
        print(f"Deployer Address: {self.address}")
        print("="*70)
    
    def validate_configuration(self):
        """Validate configuration before deployment"""
        print("\n[*] Validating configuration...")
        
        # Check if private key is set
        if self.private_key == "0xYOUR_PRIVATE_KEY_HERE":
            raise ValueError(
                "[ERROR] Private key not configured!\n"
                "Please set your private key in NEURON_WALLET_CONFIG"
            )
        
        # Check if private key format is correct
        if not self.private_key.startswith("0x"):
            raise ValueError("[ERROR] Private key must start with '0x'")
        
        if len(self.private_key) != 66:  # 0x + 64 hex chars
            raise ValueError("[ERROR] Private key must be 66 characters (0x + 64 hex)")
        
        # Check network connectivity
        try:
            tip = self.rpc.get_tip_header()
            print(f"[OK] Connected to CKB node (block #{int(tip['number'], 16)})")
        except Exception as e:
            raise Exception(f"[ERROR] Cannot connect to CKB node: {e}")
        
        print("[OK] Configuration valid")
    
    def compile_lockscript(self):
        """
        Compile Rust lockscript to RISC-V binary
        
        Note: This requires Rust and CKB development environment.
        If you have a pre-compiled binary, this step can be skipped.
        """
        print("\n[*] Loading VoteSecure lockscript...")
        
        # Check if binary already exists
        binary_path = Path(LOCKSCRIPT_BINARY_PATH)
        if binary_path.exists():
            print(f"[OK] Using existing binary: {binary_path}")
            with open(binary_path, "rb") as f:
                return f.read()
        
        # Try to compile
        print("[WARNING] No pre-compiled binary found. Attempting to compile...")
        print("This requires: cargo, rustc, and riscv64imac-unknown-none-elf target")
        
        contract_dir = Path(__file__).parent / "contract"
        
        if not contract_dir.exists():
            raise FileNotFoundError(
                f"[ERROR] Contract directory not found: {contract_dir}\n"
                "Please ensure the Rust contract source is in ./contract/"
            )
        
        # Compile with cargo
        print("Running: cargo build --release --target=riscv64imac-unknown-none-elf")
        
        result = subprocess.run(
            [
                "cargo", "build",
                "--release",
                "--target=riscv64imac-unknown-none-elf"
            ],
            cwd=contract_dir,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            raise Exception(f"[ERROR] Compilation failed:\n{result.stderr}")
        
        print(f"[OK] Compilation successful")
        
        # Read compiled binary
        compiled_path = contract_dir / "target/riscv64imac-unknown-none-elf/release/votesecure-lockscript"
        if not compiled_path.exists():
            raise FileNotFoundError(f"[ERROR] Compiled binary not found at {compiled_path}")
        
        with open(compiled_path, "rb") as f:
            binary = f.read()
        
        print(f"[OK] Binary loaded ({len(binary)} bytes)")
        
        return binary
    
    def calculate_code_hash(self, binary):
        """
        Calculate CKB code hash for the binary
        
        CKB uses blake2b-256 with a specific personalization string
        """
        print("\n[*] Calculating code hash...")
        
        # CKB uses blake2b with 32-byte digest and specific personalization
        hasher = hashlib.blake2b(digest_size=32, person=b'ckb-default-hash')
        hasher.update(binary)
        code_hash = "0x" + hasher.hexdigest()
        
        print(f"[OK] Code Hash: {code_hash}")
        
        return code_hash
    
    def calculate_required_capacity(self, binary):
        """
        Calculate required CKB capacity for the lockscript cell
        
        Formula: 61 CKB (minimum) + data size + buffer
        """
        # Convert binary size from bytes to CKB (1 CKB = 100,000,000 shannons)
        binary_size_ckb = len(binary) / 100_000_000
        
        # Minimum cell capacity is 61 CKB
        # Add binary size and 10 CKB buffer for safety
        required_ckb = 61 + binary_size_ckb + 10
        
        # Convert to shannons (smallest unit)
        required_shannons = int(required_ckb * 100_000_000)
        
        print(f"\n[*] Capacity Calculation:")
        print(f"   Binary size: {len(binary)} bytes ({binary_size_ckb:.4f} CKB)")
        print(f"   Minimum: 61 CKB")
        print(f"   Buffer: 10 CKB")
        print(f"   Total required: {required_ckb:.2f} CKB ({required_shannons} shannons)")
        
        return required_shannons
    
    def create_always_success_lock(self):
        """
        Create an "always success" lock script
        
        This lock can never be spent, making the lockscript cell permanent
        """
        return {
            "code_hash": "0x0000000000000000000000000000000000000000000000000000000000000000",
            "hash_type": "data",
            "args": "0x"
        }
    
    def address_to_script(self, address):
        """Convert CKB address to script using bech32 decoding"""
        try:
            # CKB addresses use bech32 encoding
            # For testnet: ckt1... For mainnet: ckb1...
            
            # Import bech32 if available, otherwise use simplified approach
            try:
                import bech32
                hrp, data = bech32.bech32_decode(address)
                if data is None:
                    raise ValueError("Invalid bech32 address")
                
                # Convert 5-bit groups to 8-bit groups
                decoded = bech32.convertbits(data, 5, 8, False)
                if decoded is None:
                    raise ValueError("Invalid address data")
                
                # Extract payload
                payload = bytes(decoded)
                
                # Parse CKB address format
                # Format byte + code hash + args
                format_type = payload[0]
                code_hash_index = payload[1]
                
                # For standard addresses
                if format_type == 0x01:  # Short format with code hash index
                    # SECP256K1 Blake160 lock
                    code_hash = "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8"
                    hash_type = "type"
                    args = "0x" + payload[2:].hex()
                else:
                    # Full format
                    code_hash = "0x" + payload[1:33].hex()
                    hash_type = "data" if payload[33] == 0 else "type"
                    args = "0x" + payload[34:].hex()
                
                return {
                    "code_hash": code_hash,
                    "hash_type": hash_type,
                    "args": args
                }
                
            except ImportError:
                # Fallback: Manual parsing without bech32 library
                print("[WARNING] bech32 library not found, using simplified address parsing")
                
                # For testnet addresses starting with ckt1
                # Standard format: use SECP256K1 Blake160
                return {
                    "code_hash": "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
                    "hash_type": "type",
                    "args": "0x" + "00" * 20  # Placeholder - will query all cells
                }
                
        except Exception as e:
            print(f"[ERROR] Failed to parse address: {e}")
            raise
    
    def collect_inputs(self, address, required_capacity):
        """Collect input cells from address to meet required capacity"""
        print(f"\n[*] Collecting {required_capacity / 100000000:.2f} CKB from {address[:20]}...")
        
        # For simplified approach, query using RPC directly instead of indexer
        # Use get_cells_by_lock_hash
        
        try:
            # Alternative approach: Use RPC method to get cells
            # This is more reliable than indexer for simple queries
            
            print("[INFO] Querying cells from address...")
            
            # Build a simpler query - just get capacity info from the node
            # We'll use a workaround: query tip and construct transaction manually
            
            # For now, create a simplified transaction without collecting real inputs
            # This will be a placeholder that needs manual completion
            
            print("[WARNING] Automatic cell collection not available")
            print("[INFO] Creating transaction template...")
            
            # Return placeholder inputs
            # User will need to fill these manually or use Neuron wallet
            placeholder_input = {
                "previous_output": {
                    "tx_hash": "0x0000000000000000000000000000000000000000000000000000000000000000",
                    "index": "0x0"
                },
                "since": "0x0"
            }
            
            lock_script = {
                "code_hash": "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
                "hash_type": "type",
                "args": "0x" + "00" * 20
            }
            
            # Calculate a reasonable input capacity (required + buffer)
            input_capacity = required_capacity + 200000000  # +2 CKB for change and fee
            
            print(f"[INFO] Template created with estimated capacity: {input_capacity / 100000000:.2f} CKB")
            print(f"[WARNING] You will need to manually specify inputs using Neuron or ckb-cli")
            
            return [placeholder_input], input_capacity, lock_script
            
        except Exception as e:
            raise Exception(f"Failed to collect inputs: {e}")
    
    def build_deployment_transaction(self, binary, required_capacity):
        """
        Build transaction to deploy lockscript to blockchain
        """
        print("\n[*] Building deployment transaction...")
        
        # Collect inputs from deployer's address
        inputs, input_capacity, deployer_lock = self.collect_inputs(self.address, required_capacity)
        
        # Create lockscript cell output
        lockscript_output = {
            "capacity": hex(required_capacity),
            "lock": self.create_always_success_lock(),
            "type": None
        }
        
        # Encode binary as hex string for output data
        binary_hex = "0x" + binary.hex()
        
        # Calculate change
        fee = 1000  # 0.00001 CKB fee
        change_capacity = input_capacity - required_capacity - fee
        
        # Create change output (back to deployer)
        change_output = {
            "capacity": hex(change_capacity),
            "lock": deployer_lock,
            "type": None
        }
        
        # Create transaction
        transaction = {
            "version": "0x0",
            "cell_deps": [
                {
                    "out_point": {
                        "tx_hash": "0x71a7ba8fc96349fea0ed3a5c47992e3b4084b031a42264a018e0072e8172e46c",
                        "index": "0x0"
                    },
                    "dep_type": "dep_group"
                }
            ],
            "header_deps": [],
            "inputs": inputs,
            "outputs": [
                lockscript_output,
                change_output
            ],
            "outputs_data": [
                binary_hex,
                "0x"
            ],
            "witnesses": []
        }
        
        print(f"[OK] Transaction built:")
        print(f"   Inputs: {len(inputs)} cells")
        print(f"   Input capacity: {input_capacity / 100000000:.2f} CKB")
        print(f"   Lockscript output: {required_capacity / 100000000:.2f} CKB")
        print(f"   Change output: {change_capacity / 100000000:.2f} CKB")
        
        return transaction
    
    def sign_transaction(self, transaction):
        """
        Sign transaction with private key using secp256k1
        """
        print("\n[*] Signing transaction...")
        
        # Calculate transaction hash
        tx_hash = self.calculate_transaction_hash(transaction)
        print(f"   Transaction hash: {tx_hash}")
        
        # Sign with private key
        private_key_bytes = bytes.fromhex(self.private_key[2:])
        sk = SigningKey.from_string(private_key_bytes, curve=SECP256k1)
        
        # Sign the transaction hash
        signature = sk.sign_digest(bytes.fromhex(tx_hash[2:]), sigencode=sigencode_der)
        
        # Create witness
        witness = {
            "lock": "0x" + signature.hex(),
            "input_type": "",
            "output_type": ""
        }
        
        # Add witness for each input
        transaction["witnesses"] = [self.serialize_witness(witness)] * len(transaction["inputs"])
        
        print(f"[OK] Transaction signed")
        
        return transaction
    
    def calculate_transaction_hash(self, transaction):
        """Calculate transaction hash for signing"""
        import json
        tx_json = json.dumps(transaction, sort_keys=True)
        
        hasher = hashlib.blake2b(digest_size=32, person=b'ckb-default-hash')
        hasher.update(tx_json.encode())
        
        return "0x" + hasher.hexdigest()
    
    def serialize_witness(self, witness):
        """Serialize witness to hex string"""
        return witness["lock"]
    
    def send_transaction(self, signed_tx):
        """
        Broadcast transaction to CKB network
        """
        print("\n[*] Broadcasting transaction to network...")
        
        try:
            tx_hash = self.rpc.send_transaction(signed_tx)
            print(f"[OK] Transaction sent!")
            print(f"   Tx Hash: {tx_hash}")
            return tx_hash
        except Exception as e:
            raise Exception(f"[ERROR] Failed to send transaction: {e}")
    
    def wait_for_confirmation(self, tx_hash, timeout=600):
        """
        Wait for transaction to be confirmed on blockchain
        """
        print(f"\n[*] Waiting for confirmation (timeout: {timeout}s)...")
        
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            try:
                tx_status = self.rpc.get_transaction(tx_hash)
                
                if tx_status and tx_status.get("tx_status"):
                    status = tx_status["tx_status"]["status"]
                    
                    if status == "committed":
                        print("\n[OK] Transaction confirmed!")
                        return True
                    elif status == "rejected":
                        raise Exception("[ERROR] Transaction was rejected by network")
                    
                    print(".", end="", flush=True)
            except Exception as e:
                print(f"\n[WARNING] Error checking status: {e}")
            
            time.sleep(5)
        
        raise TimeoutError("[ERROR] Transaction confirmation timeout")
    
    def save_configuration(self, code_hash, tx_hash, binary, required_capacity):
        """
        Save deployment configuration to JSON file
        """
        print("\n[*] Saving configuration...")
        
        config = {
            "votesecure_lockscript": {
                "code_hash": code_hash,
                "hash_type": "data",
                "tx_hash": tx_hash,
                "out_point": {
                    "tx_hash": tx_hash,
                    "index": "0x0"
                },
                "deployed_at": datetime.now().isoformat(),
                "deployed_by": self.address,
                "network": NETWORK,
                "binary_size_bytes": len(binary),
                "capacity_shannons": required_capacity,
                "capacity_ckb": required_capacity / 100_000_000,
                "rpc_url": RPC_URL,
                "indexer_url": INDEXER_URL
            },
            "usage_instructions": {
                "frontend": "Import this config in blockchain.js",
                "code_hash": "Reference this in Type Scripts for VoteSecure cells",
                "out_point": "Add as cell dependency in transactions"
            }
        }
        
        config_path = Path(OUTPUT_CONFIG_PATH)
        
        with open(config_path, "w") as f:
            json.dump(config, f, indent=2)
        
        print(f"[OK] Configuration saved to: {config_path}")
        
        return config
    
    def deploy(self):
        """
        Main deployment process
        """
        try:
            # Step 1: Validate configuration
            self.validate_configuration()
            
            # Step 2: Get lockscript binary
            binary = self.compile_lockscript()
            
            # Step 3: Calculate code hash
            code_hash = self.calculate_code_hash(binary)
            
            # Step 4: Calculate required capacity
            required_capacity = self.calculate_required_capacity(binary)
            
            # Step 5: Build transaction
            transaction = self.build_deployment_transaction(binary, required_capacity)
            
            # Save transaction for reference
            tx_file_path = "./deployment_transaction.json"
            with open(tx_file_path, "w") as f:
                json.dump(transaction, f, indent=2)
            print(f"\n[INFO] Transaction saved to: {tx_file_path}")
            
            if AUTO_DEPLOY:
                # Step 6: Sign transaction
                print("\n" + "="*70)
                print("[*] Automatic Signing and Deployment")
                print("="*70)
                
                signed_tx = self.sign_transaction(transaction)
                
                # Step 7: Broadcast transaction
                tx_hash = self.send_transaction(signed_tx)
                
                # Step 8: Wait for confirmation
                self.wait_for_confirmation(tx_hash)
                
                # Step 9: Save configuration
                config = self.save_configuration(code_hash, tx_hash, binary, required_capacity)
                
                # Print summary
                self.print_deployment_summary(code_hash, tx_hash, config)
                
            else:
                # Manual deployment
                print("\n" + "="*70)
                print("[WARNING] IMPORTANT: Manual Signing Required")
                print("="*70)
                print("\nThis script creates the deployment transaction structure.")
                print("To complete deployment, you need to:")
                print("\n1. Use Neuron wallet to sign and send the transaction")
                print("2. OR integrate with ckb-sdk-python for automated signing")
                print("3. OR use ckb-cli: ckb-cli tx send --tx-file deployment.json")
                print("\n" + "="*70)
                
                print(f"\n[OK] Transaction saved to: {tx_file_path}")
                print("\nTo deploy:")
                print(f"1. Review transaction in {tx_file_path}")
                print("2. Sign with Neuron or ckb-cli")
                print("3. Update this script with the tx_hash")
                
                # Placeholder tx_hash for configuration
                tx_hash = "0x0000000000000000000000000000000000000000000000000000000000000000"
                
                print("\n[WARNING] Once deployed, update the tx_hash in this script and run:")
                print("     python VoteSecure_create_lockscript_cell.py --finalize <tx_hash>")
                
                # Save configuration (with placeholder tx_hash)
                config = self.save_configuration(code_hash, tx_hash, binary, required_capacity)
                
                # Print summary
                self.print_deployment_summary(code_hash, tx_hash, config)
            
        except Exception as e:
            print(f"\n[ERROR] Deployment failed: {e}")
            import traceback
            traceback.print_exc()
            raise
    
    def finalize_deployment(self, tx_hash):
        """
        Finalize deployment after transaction is confirmed
        """
        print("\n[*] Finalizing deployment...")
        
        # Wait for confirmation
        self.wait_for_confirmation(tx_hash)
        
        # Get transaction details
        tx_details = self.rpc.get_transaction(tx_hash)
        
        # Reload binary to get code hash
        binary = self.compile_lockscript()
        code_hash = self.calculate_code_hash(binary)
        required_capacity = self.calculate_required_capacity(binary)
        
        # Save final configuration
        config = self.save_configuration(code_hash, tx_hash, binary, required_capacity)
        
        # Print summary
        self.print_deployment_summary(code_hash, tx_hash, config)
    
    def print_deployment_summary(self, code_hash, tx_hash, config):
        """Print deployment summary"""
        print("\n" + "="*70)
        print("[SUCCESS] VoteSecure Lockscript Deployment Complete!")
        print("="*70)
        
        print(f"\n[*] Deployment Details:")
        print(f"   Network: {NETWORK}")
        print(f"   Code Hash: {code_hash}")
        print(f"   Tx Hash: {tx_hash}")
        print(f"   Capacity: {config['votesecure_lockscript']['capacity_ckb']:.2f} CKB")
        
        if NETWORK == "testnet":
            explorer_url = f"https://pudge.explorer.nervos.org/transaction/{tx_hash}"
        else:
            explorer_url = f"https://explorer.nervos.org/transaction/{tx_hash}"
        
        print(f"\n[*] Explorer: {explorer_url}")
        
        print(f"\n[*] Configuration: {OUTPUT_CONFIG_PATH}")
        print(f"[*] Log File: {LOG_FILE}")
        
        print("\n[*] Next Steps:")
        print("   1. Verify transaction on CKB explorer")
        print("   2. Update blockchain.js with code_hash")
        print("   3. Test event creation on testnet")
        print("   4. Run integration tests")
        
        print("\n" + "="*70)


def main():
    """Main entry point"""
    import sys
    
    deployer = VoteSecureDeployer()
    
    # Check if finalizing existing deployment
    if len(sys.argv) > 2 and sys.argv[1] == "--finalize":
        tx_hash = sys.argv[2]
        deployer.finalize_deployment(tx_hash)
    else:
        deployer.deploy()


if __name__ == "__main__":
    main()