#!/usr/bin/env node
import { build } from "esbuild";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import AdmZip from "adm-zip";
import { pluginManifestSchema, definePlugin } from "../dist/index.js";

const [manifestPath, entry, output] = process.argv.slice(2);
if (!manifestPath || !entry || !output) {
  throw new Error(
    "Usage: script-pro-plugin-build <manifest.json> <entry.ts> <plugin.zip>",
  );
}

const manifest = pluginManifestSchema.parse(
  JSON.parse(await readFile(manifestPath, "utf8")),
);
const { outputFiles } = await build({
  entryPoints: [resolve(entry)],
  bundle: true,
  format: "iife",
  globalName: "ScriptProGenerationPlugin",
  platform: "browser",
  target: "chrome132",
  write: false,
  minify: true,
});

const bundle = outputFiles[0].text;
const sandbox = Object.assign(Object.create(null), { URL });
const inspect = `
  (() => {
    const plugin = ScriptProGenerationPlugin.default;
    return JSON.stringify({
      manifest: plugin.manifest,
      providers: plugin.providers.map(provider => ({
        manifest: provider.manifest,
        generate: typeof provider.generate,
        checkConnection: typeof provider.checkConnection
      }))
    });
  })()
`;
try {
  const exported = JSON.parse(
    runInNewContext(bundle + "\n" + inspect, sandbox, {
      timeout: 1000,
      codeGeneration: { strings: false, wasm: false },
    }),
  );
  definePlugin({
    manifest: exported.manifest,
    providers: exported.providers.map((provider) => ({
      manifest: provider.manifest,
      generate:
        provider.generate === "function"
          ? async () => {
              throw new Error("Validation only");
            }
          : undefined,
      checkConnection:
        provider.checkConnection === "function"
          ? async () => {
              throw new Error("Validation only");
            }
          : undefined,
    })),
  });
  if (
    JSON.stringify(pluginManifestSchema.parse(exported.manifest)) !==
    JSON.stringify(manifest)
  ) {
    throw new Error("Built plugin entry point does not match the manifest");
  }
} catch (error) {
  throw new Error("Plugin initialization failed: " + error.message);
}

const zip = new AdmZip();
zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest)));
zip.addFile("plugin.js", Buffer.from(bundle));
const bytes = zip.toBuffer();
await mkdir(dirname(resolve(output)), { recursive: true });
await writeFile(output, bytes);
console.log(
  JSON.stringify({
    pluginId: manifest.pluginId,
    providers: manifest.providers.map(({ providerId }) => providerId),
    version: manifest.version,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }),
);
