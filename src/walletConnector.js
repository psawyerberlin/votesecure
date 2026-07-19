/**
 * CCC Wallet Connector Component
 * Provides React-based CCC wallet connector for vanilla JavaScript applications
 * 
 * This component bridges the gap between React-based @ckb-ccc/connector-react
 * and vanilla JavaScript applications like organizer.html
 * 
 * Uses global React from UMD build (window.React)
 */

// Import CCC from ES module
import { ccc } from '@ckb-ccc/connector-react';

// Use global React from UMD build
const React = window.React;
const ReactDOM = window.ReactDOM;

// Network configuration
const USE_MAINNET = false;

// Create the connector component
function WalletConnectorApp() {
  const signer = ccc.useSigner();
  const { client, open, close, disconnect } = ccc.useCcc();
  
  // Sync signer with CKBService when it changes
  React.useEffect(() => {
    if (signer && window.CKBService) {
      window.CKBService.setSigner(signer);
      
      // Get wallet info and dispatch event
      (async () => {
        try {
          const addresses = await signer.getAddresses();
          const address = addresses[0];
          
          // Get balance
          const balanceShannons = await window.CKBService.getSpendableCapacityShannons(address);
          const balanceCKB = window.CKBService.shannons2CKB(balanceShannons);
          
          // Dispatch connected event
          window.dispatchEvent(new CustomEvent('walletConnected', {
            detail: {
              address,
              balance: balanceCKB,
              network: USE_MAINNET ? 'mainnet' : 'testnet'
            }
          }));
        } catch (error) {
          console.error('Failed to get wallet info:', error);
        }
      })();
    } else if (!signer) {
      // Dispatch disconnected event
      window.dispatchEvent(new CustomEvent('walletDisconnected'));
    }
  }, [signer]);
  
  // Expose connector methods globally
  React.useEffect(() => {
    window.CCCConnector = {
      open,
      close,
      disconnect,
      signer,
      client
    };
    
    return () => {
      delete window.CCCConnector;
    };
  }, [open, close, disconnect, signer, client]);
  
  // This component doesn't render anything visible
  return null;
}

// Initialize the connector
function initializeConnector() {
  console.log('Initializing CCC Wallet Connector...');
  
  // Wait for DOM and React to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initializeConnector());
    return;
  }
  
  if (!window.React || !window.ReactDOM) {
    console.error('React is not loaded. Please include React UMD build before this script.');
    return;
  }
  
  // Wait for CKBService to be ready
  const waitForCKBService = () => {
    if (!window.CKBService) {
      console.log('Waiting for CKBService...');
      setTimeout(waitForCKBService, 100);
      return;
    }
    
    console.log('CKBService ready, mounting connector...');
    
    // Create or find the connector mount point
    let mountPoint = document.getElementById('ccc-connector-mount');
    if (!mountPoint) {
      mountPoint = document.createElement('div');
      mountPoint.id = 'ccc-connector-mount';
      mountPoint.style.display = 'none'; // Hidden, only provides functionality
      document.body.appendChild(mountPoint);
    }
    
    // Create the client
    const defaultClient = USE_MAINNET 
      ? new ccc.ClientPublicMainnet()
      : new ccc.ClientPublicTestnet();
    
    // Create React root and render the app with CCC Provider
    const root = ReactDOM.createRoot(mountPoint);
    root.render(
      React.createElement(
        ccc.Provider,
        {
          defaultClient: defaultClient,
          name: 'VoteSecure',
          icon: window.location.origin + '/logo.png'
        },
        React.createElement(WalletConnectorApp)
      )
    );
    
    console.log('✓ CCC Wallet Connector initialized');
    console.log('  Network:', USE_MAINNET ? 'mainnet' : 'testnet');
    console.log('  Access via: window.CCCConnector');
  };
  
  waitForCKBService();
}

// Auto-initialize when loaded as a module
initializeConnector();

export { initializeConnector, WalletConnectorApp };
