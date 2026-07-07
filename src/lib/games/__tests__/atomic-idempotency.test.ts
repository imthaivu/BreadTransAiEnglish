import { describe, expect, it } from "vitest";

/**
 * Mô phỏng exactly-once settle: nhiều caller song song chỉ ghi currency một lần.
 * Pattern giống settleBattle / finishRankedPlay (đọc status → no-op nếu settled).
 */
type EscrowDoc = { status: "escrowed" | "settled"; payout: number };

function createSettleSimulator() {
  let doc: EscrowDoc = { status: "escrowed", payout: 0 };
  let currencyDelta = 0;
  let mutex = Promise.resolve();

  const runTransaction = async (
    fn: (current: EscrowDoc) => EscrowDoc | "noop"
  ): Promise<void> => {
    const run = async () => {
      const snapshot = { ...doc };
      const next = fn(snapshot);
      if (next === "noop") return;
      doc = next;
    };
    const prev = mutex;
    let release!: () => void;
    mutex = new Promise<void>((r) => {
      release = r;
    });
    await prev;
    try {
      await run();
    } finally {
      release();
    }
  };

  const settleOnce = async (): Promise<number> => {
    let reward = 0;
    await runTransaction((current) => {
      if (current.status === "settled") {
        reward = current.payout;
        return "noop";
      }
      if (current.status !== "escrowed") {
        throw new Error("BATTLE_NOT_ESCROWED");
      }
      currencyDelta += 35;
      reward = 35;
      return { status: "settled", payout: 35 };
    });
    return reward;
  };

  return {
    settleOnce,
    getCurrencyDelta: () => currencyDelta,
    getDoc: () => doc,
  };
}

describe("atomic idempotency (simulated settle)", () => {
  it("10 concurrent settles credit exactly once", async () => {
    const sim = createSettleSimulator();
    const rewards = await Promise.all(
      Array.from({ length: 10 }, () => sim.settleOnce())
    );
    expect(sim.getCurrencyDelta()).toBe(35);
    expect(sim.getDoc().status).toBe("settled");
    expect(rewards.every((r) => r === 35)).toBe(true);
  });
});

type PlayDoc = { status: "active" | "finished"; reward: number };

function createFinishPlaySimulator() {
  let play: PlayDoc = { status: "active", reward: 0 };
  let currencyDelta = 0;
  let mutex = Promise.resolve();

  const runTransaction = async (
    fn: (current: PlayDoc) => PlayDoc | "noop"
  ): Promise<void> => {
    const run = async () => {
      const snapshot = { ...play };
      const next = fn(snapshot);
      if (next === "noop") return;
      play = next;
    };
    const prev = mutex;
    let release!: () => void;
    mutex = new Promise<void>((r) => {
      release = r;
    });
    await prev;
    try {
      await run();
    } finally {
      release();
    }
  };

  const finishOnce = async (): Promise<number> => {
    let reward = 0;
    await runTransaction((current) => {
      if (current.status === "finished") {
        reward = current.reward;
        return "noop";
      }
      currencyDelta += 10;
      reward = 10;
      return { status: "finished", reward: 10 };
    });
    return reward;
  };

  return {
    finishOnce,
    getCurrencyDelta: () => currencyDelta,
  };
}

describe("atomic idempotency (simulated ranked finish)", () => {
  it("2 concurrent finishes award exactly once", async () => {
    const sim = createFinishPlaySimulator();
    const [r1, r2] = await Promise.all([sim.finishOnce(), sim.finishOnce()]);
    expect(sim.getCurrencyDelta()).toBe(10);
    expect(r1).toBe(10);
    expect(r2).toBe(10);
  });
});
