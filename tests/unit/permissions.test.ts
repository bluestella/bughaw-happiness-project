import { describe, expect, it } from "vitest";
import {
  canAccessCalculators,
  canAccessCrm,
  canAddContributor,
  canCreateMiniProject,
  canCreateProject,
  canCreateTask,
  canDeleteLead,
  canDeleteProjectOrMiniProject,
  canEditLead,
  canEditOrDeleteTask,
  canManageAllowlist,
  canRemoveContributor,
  type Role,
} from "@/lib/permissions";
import { computeNewPosition, sortByPosition } from "@/lib/tasks";

const ROLES: Role[] = ["super_admin", "member", "contractor"];

describe("role capability matrix", () => {
  const cases: Array<{
    fn: (role: Role | null) => boolean;
    name: string;
    expected: Record<Role, boolean>;
    /** What the helper returns before the role has loaded. */
    nullExpected: boolean;
  }> = [
    {
      fn: canCreateProject,
      name: "canCreateProject",
      expected: { super_admin: true, member: false, contractor: false },
      nullExpected: false,
    },
    {
      fn: canCreateMiniProject,
      name: "canCreateMiniProject",
      expected: { super_admin: true, member: true, contractor: false },
      nullExpected: false,
    },
    {
      fn: canCreateTask,
      name: "canCreateTask",
      expected: { super_admin: true, member: true, contractor: true },
      nullExpected: false,
    },
    {
      fn: canAddContributor,
      name: "canAddContributor",
      expected: { super_admin: true, member: true, contractor: false },
      nullExpected: false,
    },
    {
      fn: canRemoveContributor,
      name: "canRemoveContributor",
      expected: { super_admin: true, member: false, contractor: false },
      nullExpected: false,
    },
    {
      fn: canDeleteProjectOrMiniProject,
      name: "canDeleteProjectOrMiniProject",
      expected: { super_admin: true, member: false, contractor: false },
      nullExpected: false,
    },
    {
      fn: canAccessCalculators,
      name: "canAccessCalculators",
      expected: { super_admin: true, member: true, contractor: false },
      nullExpected: true,
    },
    {
      fn: canAccessCrm,
      name: "canAccessCrm",
      expected: { super_admin: true, member: true, contractor: false },
      nullExpected: false,
    },
    {
      fn: canEditLead,
      name: "canEditLead",
      expected: { super_admin: true, member: true, contractor: false },
      nullExpected: false,
    },
    {
      fn: canDeleteLead,
      name: "canDeleteLead",
      expected: { super_admin: true, member: false, contractor: false },
      nullExpected: false,
    },
    {
      fn: canManageAllowlist,
      name: "canManageAllowlist",
      expected: { super_admin: true, member: false, contractor: false },
      nullExpected: false,
    },
  ];

  for (const { fn, name, expected, nullExpected } of cases) {
    it(`${name} per role`, () => {
      for (const role of ROLES) {
        expect(fn(role), `${name}(${role})`).toBe(expected[role]);
      }
      expect(fn(null), `${name}(null)`).toBe(nullExpected);
    });
  }
});

describe("canEditOrDeleteTask", () => {
  const ownTask = { created_by_email: "Contractor@Example.com" };
  const otherTask = { created_by_email: "someone@else.com" };
  const email = "contractor@example.com";

  it("super_admin and member can edit any task", () => {
    expect(canEditOrDeleteTask("super_admin", otherTask, email)).toBe(true);
    expect(canEditOrDeleteTask("member", otherTask, email)).toBe(true);
  });

  it("contractor can edit only their own tasks (case-insensitive)", () => {
    expect(canEditOrDeleteTask("contractor", ownTask, email)).toBe(true);
    expect(canEditOrDeleteTask("contractor", otherTask, email)).toBe(false);
  });

  it("null role can edit nothing", () => {
    expect(canEditOrDeleteTask(null, ownTask, email)).toBe(false);
  });
});

describe("computeNewPosition", () => {
  it("returns 0 for an empty column", () => {
    expect(computeNewPosition(null, null)).toBe(0);
  });

  it("drops before the first card", () => {
    expect(computeNewPosition(null, 3)).toBe(2);
  });

  it("drops after the last card", () => {
    expect(computeNewPosition(5, null)).toBe(6);
  });

  it("drops between two cards at their midpoint", () => {
    expect(computeNewPosition(1, 2)).toBe(1.5);
  });
});

describe("sortByPosition", () => {
  it("sorts ascending without mutating the input", () => {
    const input = [{ position: 3 }, { position: 1 }, { position: 2 }];
    const sorted = sortByPosition(input);
    expect(sorted.map((t) => t.position)).toEqual([1, 2, 3]);
    expect(input.map((t) => t.position)).toEqual([3, 1, 2]);
  });

  it("handles fractional positions and negatives", () => {
    const input = [{ position: 1.5 }, { position: -2 }, { position: 0 }];
    const sorted = sortByPosition(input);
    expect(sorted.map((t) => t.position)).toEqual([-2, 0, 1.5]);
  });

  it("handles empty array", () => {
    expect(sortByPosition([])).toEqual([]);
  });

  it("handles single element", () => {
    const input = [{ position: 5 }];
    expect(sortByPosition(input).map((t) => t.position)).toEqual([5]);
  });
});

describe("computeNewPosition edge cases", () => {
  it("handles very large numbers", () => {
    const result = computeNewPosition(1e12, 1e12 + 2);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(1e12);
    expect(result).toBeLessThan(1e12 + 2);
  });

  it("handles negative positions", () => {
    expect(computeNewPosition(-5, null)).toBe(-4);
    expect(computeNewPosition(null, -5)).toBe(-6);
    expect(computeNewPosition(-10, -2)).toBe(-6);
  });

  it("handles dense fractional ordering over many iterations", () => {
    let a = 0;
    let b = 1;
    for (let i = 0; i < 52; i++) {
      const mid = computeNewPosition(a, b);
      expect(Number.isFinite(mid)).toBe(true);
      expect(mid).toBeGreaterThan(a);
      expect(mid).toBeLessThan(b);
      a = mid;
    }
  });

  it("produces monotonically increasing positions for sequential appends", () => {
    const positions: number[] = [computeNewPosition(null, null)];
    for (let i = 0; i < 500; i++) {
      positions.push(computeNewPosition(positions[positions.length - 1], null));
    }
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
      expect(Number.isFinite(positions[i])).toBe(true);
    }
  });

  it("produces monotonically decreasing positions for sequential prepends", () => {
    const positions: number[] = [computeNewPosition(null, null)];
    for (let i = 0; i < 500; i++) {
      positions.unshift(computeNewPosition(null, positions[0]));
    }
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
      expect(Number.isFinite(positions[i])).toBe(true);
    }
  });

  it("preserves sort invariant for midpoint inserts", () => {
    const values: number[] = [0, 1];
    for (let i = 0; i < 40; i++) {
      const newVal = computeNewPosition(values[0], values[1]);
      values.splice(1, 0, newVal);
    }
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });
});
