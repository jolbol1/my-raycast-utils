import raycastConfig from "@raycast/eslint-config";

export default [
  { ignores: ["dist/**", "node_modules/**", "raycast-env.d.ts"] },
  ...raycastConfig,
];
