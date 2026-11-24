/*
 * adapters.integration.test.ts - the node:fs and git command adapters pass the
 * port contract cases on the shared scene, the same cases the fakes pass.
 */

import { nodeFs } from "../../../viber/lib/adapters/fs.ts";
import { gitCommand } from "../../../viber/lib/adapters/git.ts";
import { fsContract, gitContract } from "../../harness/ports-contract.ts";
import { sharedScene } from "../../harness/scene.ts";

fsContract("node fs", () => ({ fs: nodeFs, root: sharedScene().root }));

gitContract("git command", () => {
  const scene = sharedScene();
  return { git: gitCommand, root: scene.root, outside: scene.outside };
});
