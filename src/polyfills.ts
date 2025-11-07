/*
Polyfills for browser compatibility
Required for CKB libraries that expect Node.js globals
*/

import { Buffer } from "buffer";

// Make Buffer available globally
if (typeof window !== 'undefined') {
  (window as any).Buffer = Buffer;
  (window as any).global = window;
  
  // Polyfill process.env if needed
  if (typeof (window as any).process === 'undefined') {
    (window as any).process = {
      env: {},
      version: '',
      versions: {},
    };
  }
}

// Export empty object to make this a valid module
export {};
