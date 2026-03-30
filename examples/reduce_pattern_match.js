import { _obj, error } from './kimchi-runtime.js';

export default async function(_opts = {}) {
  const transactions = [{ type: "credit", amount: 100 }, { type: "debit", amount: 50 }, { type: "credit", amount: 200 }, { type: "debit", amount: 75 }, { type: "refund", amount: 25 }];
  function transactionReducer(acc, tx) {
    if ((tx?.type === "credit")) {
      return (acc + tx?.amount);
      return;
    } else if ((tx?.type === "debit")) {
      return (acc - tx?.amount);
      return;
    } else if ((tx?.type === "refund")) {
      return (acc + tx?.amount);
      return;
    } else if (true) {
      return acc;
      return;
    }
  }
  
  const balance = transactions.reduce(transactionReducer, 0);
  console.log(`Final balance: $${balance}`);
  const items = [{ name: "apple", category: "fruit" }, { name: "carrot", category: "vegetable" }, { name: "banana", category: "fruit" }, { name: "broccoli", category: "vegetable" }, { name: "orange", category: "fruit" }];
  function groupReducer(acc, item) {
    if ((item?.category === "fruit")) {
      return { fruits: [...acc?.fruits, item?.name], vegetables: acc?.vegetables };
      return;
    } else if ((item?.category === "vegetable")) {
      return { fruits: acc?.fruits, vegetables: [...acc?.vegetables, item?.name] };
      return;
    } else if (true) {
      return acc;
      return;
    }
  }
  
  const grouped = items.reduce(groupReducer, { fruits: [], vegetables: [] });
  console.log("\nGrouped items:");
  console.log(`Fruits: ${grouped.fruits?.join(", ")}`);
  console.log(`Vegetables: ${grouped.vegetables?.join(", ")}`);
  const events = ["start", "pause", "resume", "stop", "start"];
  const finalState = events.reduce((state, event) => {
    if ((event === "start")) {
      return "running";
      return;
    } else if (((event === "pause") && (state === "running"))) {
      return "paused";
      return;
    } else if (((event === "resume") && (state === "paused"))) {
      return "running";
      return;
    } else if ((event === "stop")) {
      return "stopped";
      return;
    } else if (true) {
      return state;
      return;
    }
  }, "idle");
  console.log(`
Final state: ${finalState}`);
}
