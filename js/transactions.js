// transactions.js
import { ethers } from "ethers";

export async function getPaginatedLogs({ provider, address, topics, fromBlock, toBlock, step = 1000 }) {
  let allLogs = [];

  for (let start = fromBlock; start <= toBlock; start += step) {
    const end = Math.min(start + step - 1, toBlock);
    console.log(`Fetching logs from block ${start} to ${end}...`);

    try {
      const logs = await provider.getLogs({
        address,
        topics,
        fromBlock: start,
        toBlock: end,
      });
      allLogs = allLogs.concat(logs);
    } catch (error) {
      console.error(`Error al obtener logs entre ${start} y ${end}:`, error);
      throw error;
    }
  }

  return allLogs;
}
