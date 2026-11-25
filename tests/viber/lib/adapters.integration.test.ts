/*
 * adapters.integration.test.ts - the node:fs, git command and system clock
 * adapters pass the port contract cases on the shared scene, the same cases the
 * fakes pass. The cases writing files do it under the scene scratch directory
 * alone, those writing through git in a throwaway repository of their own.
 */

import { systemClock } from "../../../viber/lib/adapters/clock.ts";
import { nodeFs } from "../../../viber/lib/adapters/fs.ts";
import { gitCommand } from "../../../viber/lib/adapters/git.ts";
import { clockContract, fsContract, gitContract, gitWriteContract } from "../../harness/ports-contract.ts";
import { sharedScene, throwaway } from "../../harness/scene.ts";

fsContract("node fs", () => ({ fs: nodeFs, ...sharedScene() }));

gitContract("git command", () => {
  const scene = sharedScene();
  return { git: gitCommand, root: scene.root, outside: scene.outside, history: scene.history };
});

gitWriteContract("git write command", throwaway);

clockContract("system clock", () => systemClock);
