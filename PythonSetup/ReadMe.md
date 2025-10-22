VoteSecure Lockscript Deployment Script
========================================

This script deploys the VoteSecure lockscript to the CKB blockchain.
The lockscript contains all the validation logic for VoteSecure operations.

Prerequisites:
--------------
pip install ckb-py-integration-test   
    how to install (cannot be installed with pip install):
        in Powershell
        cd C:\python
        C:\python\> git clone https://github.com/cryptape/ckb-py-integration-test.git
        C:\python\> cd ckb-py-integration-test        
        C:\python\ckb-py-integration-test> C:\Python\Python312\python.exe -m venv .venv312             ( Create a venv with your 3.12 interpreter)
        # If activation is blocked, allow local scripts once:
        C:\python\ckb-py-integration-test> C:\python\>Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
        # 3) Activate it
        (.venv312) PS C:\python\ckb-py-integration-test> python -m pip install -U pip wheel setuptools
        (.venv312) PS C:\python\ckb-py-integration-test> pytest

pip install requests
pip install blake2b

A Get the Neuron Wallet details
------------------------------------------------------------------------

    step1: go in neuron and export you wallet. You get a .json file (CKB_TestNet.json)
    step2: go to the the folder on your node where the ckb-cli.exe is located.
    step3: c:\node> ckb-cli account import-keystore --path "C:\temp\CKB_TestNet_PS2.json"
            The first password is the password of the neuron wallet. The second is a password you set (note it down)
            Note in the output the lock_arg: ae570....724a7
    step4: c:\node> ckb-cli account export --lock-arg ae570....724a7 --extended-privkey-path C:\temp\wallet.txt
            # The file has two lines: line 1 = raw private key (hex), line 2 = chain code. Node the first line
    step5: c:\node> ckb-cli account export --lock-arg ae5703d9d22dfeb29b6aa916bfccb827deb724a7 --extended-privkey-path NUL
            #this Delete the private from the keystore
			Also deliete the keystore file in: C:\Users\Patrick Sawyer\.ckb-cli\keystore
    step6: Create the file neuronkey.json with the noted address and raw private key (hex)
            {"address":"ckt...tw548v",
             "rawprivatekey(hex)":"1234....6789"}
    step7: put it in the file "neuronkey.json" in the same folder (do not share online)

B- Adjust the lockscript and Compile it 
------------------------------------------------------------------
	Step 1: Adjsut lockscript in the main.rs files. 
		required files: 
			PythonSetup\contract\Cargo.toml
			PythonSetup\contract\src\main.rs
	step2: Clean the previous build
			PS C:\...\PythonSetup\contract> cargo clean
				you should get: Removed 85 files, 26.7MiB total
	step3: Build the new 'votesecure-lockscript'
			PS C:..\PythonSetup\contract> cargo build --release --target=riscv64imac-unknown-none-elf
				you should get: Compiling votesecure-lockscript v0.9.0 (C:\01_PSLaptopData\04_java\votesecure_v0.9\PythonSetup\contract)
				                Finished `release` profile [optimized] target(s) in 3.14s
	step4: Copy the 'votesecure-lockscript' to 'PythonSetup\votesecure_lockscript.bin'
			PS C:\...\PythonSetup> copy contract\target\riscv64imac-unknown-none-elf\release\votesecure-lockscript votesecure_lockscript.bin
			you should see the file 'C:\...\PythonSetup\votesecure_lockscript.bin'
	step5: 


D- Create Lockscript cell on the blockchain (using file votesecure_lockscript.bin)
=============================================================================================

    step1: go in neuron and export you wallet. You get a .json file (CKB_TestNet.json)
    step2: go to the the folder on your node where the ckb-cli.exe is located.
	step3: get the file from 'B- Adjust the lockscript and Compile it'
			   c:\node>votesecure_lockscript.bin
	step4: c:\node> ckb-cli account import-keystore --path "C:\temp\CKB_TestNet_PS2.json"
				The first password is the password of the neuron wallet. The second is a password you set (note it down)
				Note in the output the lock_arg needed for next step!
	step5: Create a deployment_config.toml file with this content
				[[cells]]
				name = "votesecure_lockscript"
				enable_type_id = false
				location = { file = "votesecure_lockscript.bin" }

				[lock]
				code_hash = "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8"
				args = "<lock_arg>"
				hash_type = "type"
	step6: c:\node> ckb-cli --url http://192.168.178.94:8112
			Result: enter the CKB>    
	step7: check that the address is listed
			c:\node> account list
			Result: 				
				- "#": 0
				  address:
					mainnet: ckb1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqdw2upan53dl6efk64fz6luewp8m6mjffc9ul6d5
					testnet: ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqdw2upan53dl6efk64fz6luewp8m6mjffctw548v
				  address(deprecated):
					mainnet: ckb1qyq2u4crm8fzml4jnd42j94lejuz0h4hyjns0uj6he
					testnet: ckt1qyq2u4crm8fzml4jnd42j94lejuz0h4hyjnsjev9m9
				  has_ckb_pubkey_derivation_root_path: true
				  lock_arg: 0xae5703d9d22dfeb29b6aa916bfccb827deb724a7
				  lock_hash: 0xc4f90434abc1c4a4830062c3c2d70272d76b9d1e91c4e71ab4cf4f4438d51f87
				  source: Local File System
			
			Note: Neuron “Backup current wallet” (for an HD wallet) gives you the root/keystore of the wallet (or the mnemonic).
				  ckb-cli accounts are single-key wallets. When you import that backup into ckb-cli, 
				  it treats it as one raw private key and shows one address derived from that key, 
				  which is not one of the HD child addresses Neuron is watching 
				  (Neuron monitors the BIP44 paths like m/44'/309'/0'/0/x for receive and .../1/x for change).
				  Therefore you have have to send CKB to this address. And send the balance back later with ckb-cli.
	

	
	step8: Deploy the transactions which create the file deployment_info.json
				CKB> deploy gen-txs --from-address ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqdw2upan53dl6efk64fz6luewp8m6mjffctw548v --fee-rate 1000 --deployment-config deployment_config.toml --info-file deployment_info.json --migration-dir
				Result:
				CKB> deploy gen-txs --from-address ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqdw2upan53dl6efk64fz6luewp8m
					6mjffctw548v --fee-rate 1000 --deployment-config deployment_config.toml --info-file deployment_info.json --migration-dir
					 .
					==== Cell transaction ====
					[cell] NewAdded , name: votesecure_lockscript, old-capacity: 0.0, new-capacity: 3733.0
					> old total capacity: 0.0 (CKB) (removed items not included)
					> new total capacity: 3733.0 (CKB)
					[transaction fee]: 0.0000424
					==== DepGroup transaction ====
					> old total capacity: 0.0 (CKB) (removed items not included)
					> new total capacity: 0.0 (CKB)
					status: success
	
	
	step9: Sign	the file deployment_info.json created in the step erlier	
			CKB> deploy sign-txs --info-file deployment_info.json --from-account 0xae5703d9d22dfeb29b6aa916bfccb827deb724a7 --add-signatures
				Password:
			Result: 
				cell_tx_signatures:
				  0xae5703d9d22dfeb29b6aa916bfccb827deb724a7: 0xcc0c16dbeacc745ad277e3c98c26e0efb570b58b6ca67d63b911b5f6691b8d7850701955fc42692682699032af8f47ad70543cc2da22bdd01b332e58b72d556000
		  
	step10: Broadcast
			CKB> deploy apply-txs --info-file deployment_info.json --migration-dir .
			Result:				
				> [send cell transaction]: 0x0ebf65d3adbabb40bae687283b0a51b3dd0fa619e78c890fe0ba516f4eae061f
				cell_tx: 0x0ebf65d3adbabb40bae687283b0a51b3dd0fa619e78c890fe0ba516f4eae061f
				dep_group_tx: ~
				
	step 11: check on https://testnet.explorer.nervos.org/transaction/0x0ebf65d3adbabb40bae687283b0a51b3dd0fa619e78c890fe0ba516f4eae061f
				It should be listed! 
				
				
E: Finalize on Windows PC
Once you have the TX hash, run on your Windows PC:	
=======================================================================

Step 1) python VoteSecure_create_lockscript_cell.py --finalize 0xYOUR_TX_HASH_HERE
	C:\Python\Python312\python.exe VoteSecure_create_lockscript_cell.py --finalize 0x0ebf65d3adbabb40bae687283b0a51b3dd0fa619e78c890fe0ba516f4eae061f


	Result:exit

		PS C:\01_PSLaptopData\04_java\votesecure_v0.9\PythonSetup> C:\Python\Python312\python.exe VoteSecure_create_lockscript_cell.py --finalize 0x0ebf65d3adbabb40bae687283b0a51b3dd0fa619e78c890fe0ba516f4eae061f
		[INFO] Log file: deployment_log_20251021_001614.log
		======================================================================
		VoteSecure Lockscript Deployment
		======================================================================
		Network: testnet
		RPC URL: http://192.168.178.94:8112
		Deployer Address: ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqdw2upan53dl6efk64fz6luewp8m6mjffctw548v
		======================================================================

		[*] Finalizing deployment...

		[*] Waiting for confirmation (timeout: 600s)...

		[OK] Transaction confirmed!

		[*] Loading VoteSecure lockscript...
		[OK] Using existing binary: votesecure_lockscript.bin

		[*] Calculating code hash...
		[OK] Code Hash: 0x3b3f2d37f03fac4145aeb092d1e925b5624c86b2d7c9717d526be708c9efb6e1

		[*] Capacity Calculation:
		   Binary size: 3672 bytes (0.0000 CKB)
		   Minimum: 61 CKB
		   Buffer: 10 CKB
		   Total required: 71.00 CKB (7100003672 shannons)

		[*] Saving configuration...
		[OK] Configuration saved to: votesecure_config.json

		======================================================================
		[SUCCESS] VoteSecure Lockscript Deployment Complete!
		======================================================================

		[*] Deployment Details:
		   Network: testnet
		   Code Hash: 0x3b3f2d37f03fac4145aeb092d1e925b5624c86b2d7c9717d526be708c9efb6e1
		   Tx Hash: 0x0ebf65d3adbabb40bae687283b0a51b3dd0fa619e78c890fe0ba516f4eae061f
		   Capacity: 71.00 CKB

		[*] Explorer: https://pudge.explorer.nervos.org/transaction/0x0ebf65d3adbabb40bae687283b0a51b3dd0fa619e78c890fe0ba516f4eae061f

		[*] Configuration: ./votesecure_config.json
		[*] Log File: deployment_log_20251021_001614.log

		[*] Next Steps:
		   1. Verify transaction on CKB explorer
		   2. Update blockchain.js with code_hash
		   3. Test event creation on testnet
		   4. Run integration tests

		======================================================================
		
Step2)
	Copy the file votesecure_config.json in the "\src" folder 