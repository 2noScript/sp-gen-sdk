import {
  definePlugin,
  defineProvider,
  pluginManifestSchema,
} from "@script-pro/generation-sdk";
import manifest from "./manifest.json";

const packageManifest = pluginManifestSchema.parse(manifest);

const provider = defineProvider({
  manifest: packageManifest.providers[0],
  async generate(_request, host) {
    host.signal.throwIfAborted();
    return {
      ok: true,
      media: {
        kind: "IMAGE",
        mimeType: "image/png",
        source: { kind: "URL", url: "https://example.com/demo.png" },
      },
    };
  },
});

export default definePlugin({
  manifest: packageManifest,
  providers: [provider],
});
