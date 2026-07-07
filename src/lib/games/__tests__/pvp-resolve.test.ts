import { describe, expect, it } from "vitest";
import { resolvePvpWinner } from "../pvp-resolve";
import type { GameId } from "../types";

const baseMeta = (gameId: GameId) => ({
  gameId,
  status: "finished",
  winnerReason: "win" as const,
});

describe("resolvePvpWinner", () => {
  it("caro: X wins → p1", () => {
    expect(
      resolvePvpWinner({
        meta: baseMeta("caro"),
        state: { status: "won", winner: "X" },
      })
    ).toBe("p1");
  });

  it("caro: draw", () => {
    expect(
      resolvePvpWinner({
        meta: baseMeta("caro"),
        state: { status: "draw" },
      })
    ).toBe("draw");
  });

  it("sliding-puzzle: winner role", () => {
    expect(
      resolvePvpWinner({
        meta: baseMeta("sliding-puzzle"),
        state: { winner: "p2" },
      })
    ).toBe("p2");
  });

  it("shell-game: first to 3", () => {
    expect(
      resolvePvpWinner({
        meta: baseMeta("shell-game"),
        state: { scores: { p1: 3, p2: 1 } },
      })
    ).toBe("p1");
  });

  it("sky-high: both done, higher score wins", () => {
    expect(
      resolvePvpWinner({
        meta: baseMeta("sky-high"),
        state: {
          p1: { score: 10, done: true },
          p2: { score: 8, done: true },
        },
      })
    ).toBe("p1");
  });

  it("sky-high: KO while opponent still playing", () => {
    expect(
      resolvePvpWinner({
        meta: baseMeta("sky-high"),
        state: {
          p1: { score: 6, done: true },
          p2: { score: 2, done: false },
        },
      })
    ).toBe("p1");
  });

  it("flappy-bird: both dead, higher score", () => {
    expect(
      resolvePvpWinner({
        meta: baseMeta("flappy-bird"),
        state: {
          p1: { score: 5, alive: false },
          p2: { score: 12, alive: false },
        },
      })
    ).toBe("p2");
  });

  it("flappy-bird: still flying → null when room not finalized", () => {
    expect(
      resolvePvpWinner({
        meta: { ...baseMeta("flappy-bird"), status: "playing" },
        state: {
          p1: { score: 5, alive: false },
          p2: { score: 12, alive: true },
        },
      })
    ).toBeNull();
  });

  it("flappy-bird: stale alive flag → trusts meta after finished", () => {
    expect(
      resolvePvpWinner({
        meta: {
          ...baseMeta("flappy-bird"),
          status: "finished",
          winnerRole: "p2",
        },
        state: {
          p1: { score: 5, alive: false },
          p2: { score: 12, alive: true },
        },
      })
    ).toBe("p2");
  });

  it("forfeit: trusts meta winnerRole", () => {
    expect(
      resolvePvpWinner({
        meta: {
          ...baseMeta("caro"),
          winnerReason: "forfeit",
          winnerRole: "p2",
        },
        state: { status: "playing" },
      })
    ).toBe("p2");
  });

  it("disconnect: trusts meta draw", () => {
    expect(
      resolvePvpWinner({
        meta: {
          ...baseMeta("caro"),
          winnerReason: "disconnect",
          winnerRole: "draw",
        },
        state: null,
      })
    ).toBe("draw");
  });
});
