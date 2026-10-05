import type { Isolation } from "@plimsollmark/client";

export type Floor = Exclude<Isolation, "none" | "process">;

// The weakest isolation tier a sandbox run accepts: kernel unless PLIMSOLL_FLOOR names
// container or vm. The daemon refuses a run below it before any code starts, and the
// client checks the tier the answer reports. Set container only for a daemon you know
// runs under runc, and only for code you would run on that host yourself.
export function plimsollFloor(): Floor {
  const floor = process.env.PLIMSOLL_FLOOR ?? "kernel";
  if (floor === "container" || floor === "kernel" || floor === "vm") return floor;
  throw new Error(`PLIMSOLL_FLOOR must be container, kernel or vm, not ${JSON.stringify(floor)}`);
}
