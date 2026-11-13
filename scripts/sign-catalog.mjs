import { readFile, writeFile } from "node:fs/promises";
import { createHash, createPrivateKey, sign } from "node:crypto";
import AdmZip from "adm-zip";
import { pluginManifestSchema } from "../dist/index.js";

const [output, ...entries] = process.argv.slice(2);
const pem = process.env.GENERATION_CATALOG_PRIVATE_KEY;
if (!pem || !output || !entries.length || entries.length % 2) {
  throw new Error(
    "Set GENERATION_CATALOG_PRIVATE_KEY and provide <output> <bundle.zip> <release URL> pairs",
  );
}
const key = createPrivateKey(pem.replaceAll("\\n", "\n"));
if (key.asymmetricKeyType !== "ed25519")
  throw new Error("Catalog signing requires an Ed25519 key");
const releases = [];
const identities = new Set();
for (let index = 0; index < entries.length; index += 2) {
  const bytes = await readFile(entries[index]);
  const assetUrl = new URL(entries[index + 1]);
  if (
    assetUrl.origin !== "https://github.com" ||
    assetUrl.username ||
    assetUrl.password ||
    assetUrl.search ||
    assetUrl.hash ||
    !/^\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/[^/]+\.zip$/.test(
      assetUrl.pathname,
    )
  ) {
    throw new Error(
      "Plugin assets require a versioned public GitHub Release URL",
    );
  }
  const archive = new AdmZip(bytes);
  if (archive.getEntries().length !== 2 || !archive.getEntry("plugin.js"))
    throw new Error("Invalid plugin archive");
  const manifest = pluginManifestSchema.parse(
    JSON.parse(archive.readAsText("manifest.json")),
  );
  const id = manifest.pluginId + ":" + manifest.version;
  if (identities.has(id)) throw new Error("Duplicate plugin release: " + id);
  identities.add(id);
  releases.push({
    manifest,
    assetUrl: assetUrl.href,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
const payload = Buffer.from(JSON.stringify({ version: 1, releases }));
await writeFile(
  output,
  JSON.stringify({
    payload: payload.toString("base64"),
    signature: sign(null, payload, key).toString("base64"),
  }) + "\n",
);
