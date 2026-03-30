import * as _dep_config from './examples/config.static.js';

import { _obj, error } from './kimchi-runtime.js';

export default async function(_opts = {}) {
  const config = _dep_config;
  
  function main() {
    console.log(`App Name: ${config?.AppConfig?.name}`);
    console.log(`Version: ${config?.AppConfig?.version}`);
    console.log(`Colors: ${config?.Colors}`);
    console.log(`HTTP OK Status: ${config?.HttpStatus?.STATUS_OK}`);
    console.log(`API Endpoint: ${config?.Endpoints?.api}`);
  }
  
  main();
}
