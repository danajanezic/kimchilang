import _dep_log from './stdlib/logger.km';

import { _obj, error } from './kimchi-runtime.js';

export default async function(_opts = {}) {
  const log = _opts["stdlib.logger"] || _dep_log();
  
  log?.info("Application started");
  log?.debug("Debug information", { userId: 123 });
  log?.warn("This is a warning");
  log?.error("Something went wrong", { code: "ERR_001" });
  const userLog = log?.child({ userId: 456, session: "abc123" });
  userLog.info("User logged in");
  userLog.debug("Processing request");
  function processOrder(orderId) {
    log?.info("Processing order", { orderId });
    log?.debug("Validating order");
    log?.debug("Charging payment");
    log?.info("Order completed", { orderId, status: "success" });
    return true;
  }
  
  processOrder(789);
}
