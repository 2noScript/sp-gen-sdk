import {
  definePlugin,
  defineProvider,
  pluginManifestSchema,
} from "@script-pro/generation-sdk";
import manifest from "./manifest.json";

const packageManifest = pluginManifestSchema.parse(manifest);
export default definePlugin({
  manifest: packageManifest,
  providers: packageManifest.providers.map((manifest) =>
    defineProvider({
      manifest,
      async generate(_request, host) {
        host.signal.throwIfAborted();
        const file =
          manifest.providerId === "EXAMPLE_SECOND" ? "second.png" : "demo.png";
        return {
          ok: true,
          media: {
            kind: "IMAGE",
            mimeType: "image/png",
            source: { kind: "URL", url: "https://example.com/" + file },
          },
        };
      },
    }),
  ),
});
