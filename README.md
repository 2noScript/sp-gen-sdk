# Script-Pro Generation SDK

A publisher can release several plugins. Each plugin package can contain one or more providers. Provider authentication, parameters, and accounts are independent.

Install the SDK in the plugin project, declare provider handlers with `defineProvider`, and export the package with `definePlugin`.

```sh
npm install --save-dev https://github.com/2noScript/sp-gen-sdk/releases/download/v0.1.1/script-pro-generation-sdk-0.1.1.tgz
npx script-pro-plugin-build manifest.json index.ts plugin.zip
```

The package manifest contains `pluginId`, `name`, `publisher`, `version`, `contractVersion`, and a `providers` array. Each provider declares its own `providerId`, authentication mode, account fields, operations, and approved request and media origins. All providers use the package version.

```ts
import {
  definePlugin,
  defineProvider,
  pluginManifestSchema
} from '@script-pro/generation-sdk'
import raw from './manifest.json'

const manifest = pluginManifestSchema.parse(raw)

export default definePlugin({
  manifest,
  providers: manifest.providers.map((manifest) => defineProvider({
    manifest,
    async generate(request, host) {
      const result = await host.request<{ url: string }>({
        url: 'https://your-provider.example/generate',
        method: 'POST',
        body: JSON.stringify(request.input),
        responseType: 'JSON'
      })
      return {
        ok: true,
        media: {
          kind: 'IMAGE',
          mimeType: 'image/png',
          source: { kind: 'URL', url: result.url }
        }
      }
    }
  }))
})
```

Declare the request and media origins in the manifest. Authenticated providers also implement `checkConnection(host)`. Use `host.page` for scoped WebView operations and a credential reference on `host.request` for API keys. `createTestHost` accepts mocked operations for local tests.

The app downloads the package once and dispatches requests by `providerId`. Publish `plugin.zip` on a versioned public GitHub Release, then include it in the signed Script-Pro catalog. Flow Google and Vibes are separately packaged, while the repository's `example-suite` starter demonstrates a package with two providers.

WebView authentication can declare an `identityProvider` such as `GOOGLE` or `META`. The host then offers compatible saved browser accounts or a new isolated session. The plugin still verifies its own service session; identity login does not imply service authorization. External browser OAuth callbacks are not part of contract v1.

Providers can declare `logoUrl` and `websiteUrl` using HTTPS URLs (SDK and host 0.1.1 preview or newer). Settings renders the declared logo; package download and release links come from the verified catalog.
