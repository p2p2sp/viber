/*
 * invocations.ts - the instance of the `invocations` rule over viber's skills, parts, fragments
 * and hooks.json. The switch table mirrors the keys viber/lib/switch-text.ts recognizes.
 */

import type { RuleInstance } from "../engine.ts";

const onOff = ["true", "false"];

export const rules: RuleInstance[] = [
  {
    id: "invocations/viber",
    type: "invocations",
    params: {
      plugin: "viber",
      switches: {
        "planning.adr": onOff,
        "planning.outside-plan-review": onOff,
        "build.baseline-tests": ["off", "fast", "full"],
        "build.final-review": onOff,
        "build.memory": onOff,
        "build.rules": onOff,
        "build.qa": onOff,
        "build.cleanup": onOff,
        "build.red-check": onOff,
        "github.issues": onOff,
        "branching.mode": ["off", "allowed", "required"],
        "build.extensions": ["off", "on"],
      },
    },
    why: "a script called bare needs its exec bit, a preload must survive zsh, and a switch call must find its fragment",
  },
];
