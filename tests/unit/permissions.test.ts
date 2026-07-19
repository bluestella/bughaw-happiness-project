import { describe, expect, it } from "vitest";
import {
  canAccessCalculators,
  canAddContributor,
  canCreateMiniProject,
  canCreateProject,
  canCreateTask,
  canDeleteProjectOrMiniProject,
  canEditOrDeleteTask,
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
  }> = [
    {
      fn: canCreateProject,
      name: "canCreateProject",
      expected: { super_admin: true, member: false, contractor: false },
    },
    {
      fn: canCreateMiniProject,
      name: "canCreateMiniProject",
      expected: { super_admin: true, member: true, contractor: false },
    },
    {
      fn: canCreateTask,
      name: "canCreateTask",
      expected: { super_admin: true, member: true, contractor: true },
    },
    {
      fn: canAddContributor,
      name: "canAddContributor",
      expected: { super_admin: true, member: true, contractor: false },
    },
    {
      fn: canRemoveContributor,
      name: "canRemoveContributor",
      expected: { super_admin: true, member: false, contractor: false },
    },
    {
      fn: canDeleteProjectOrMiniProject,
      name: "canDeleteProjectOrMiniProject",
      expected: { super_admin: true, member: false, contractor: false },
    },
    {
      fn: canAccessCalculators,
      name: "canAccessCalculators",
      expected: { super_admin: true, member: true, contractor: false },
    },
  ];

  for (const { fn, name, expected } of cases) {
    it(`${name} per role`, () => {
      for (const role of ROLES) {
        expect(fn(role), `${name}(${role})`).toBe(expected[role]);
      }
      expect(fn(null), `${name}(null)`).toBe(name === "canAccessCalculators");
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
});
