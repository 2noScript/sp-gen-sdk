import { z } from "zod";

export const CONTRACT_VERSION = 2;
export const providerIdSchema = z.string().regex(/^[A-Z][A-Z0-9_-]{0,63}$/);
export const versionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
export const operationSchema = z.enum([
  "IMAGE",
  "VIDEO",
  "CHARACTER",
  "PROP",
  "ENVIRONMENT",
]);
export type GenerationOperation = z.infer<typeof operationSchema>;

const httpsUrl = z.url({ protocol: /^https$/ }).refine((value) => {
  const url = new URL(value);
  return !url.username && !url.password;
});
const httpsOrigin = httpsUrl.refine((value) => new URL(value).origin === value);
const fieldId = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/);
const field = z
  .object({
    id: fieldId,
    label: z.string().min(1).max(120),
    type: z.enum(["TEXT", "NUMBER", "BOOLEAN", "SELECT", "SECRET"]),
    required: z.boolean().optional(),
    choices: z.array(z.string().min(1)).optional(),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })
  .strict()
  .superRefine((field, ctx) => {
    if (
      (field.type === "SELECT" && !field.choices?.length) ||
      (field.type !== "SELECT" && field.choices !== undefined) ||
      (field.type === "SECRET" && field.default !== undefined) ||
      (field.default !== undefined && !matchesField(field, field.default))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid field choices or default",
      });
    }
  });
export type PluginField = z.infer<typeof field>;

function matchesField(
  field: Pick<PluginField, "type" | "choices">,
  value: unknown,
): boolean {
  switch (field.type) {
    case "NUMBER":
      return typeof value === "number" && Number.isFinite(value);
    case "BOOLEAN":
      return typeof value === "boolean";
    case "SELECT":
      return typeof value === "string" && !!field.choices?.includes(value);
    default:
      return typeof value === "string";
  }
}

const operationDefinition = z
  .object({
    transport: z.enum(["HTTP", "BROWSER"]),
    models: z
      .array(
        z.object({ id: z.string().min(1), label: z.string().min(1) }).strict(),
      )
      .min(1),
    fields: z.array(field).default([]),
  })
  .strict();
const fieldsAreUnique = (fields: PluginField[]) =>
  new Set(fields.map(({ id }) => id)).size === fields.length;

export const manifestSchema = z
  .object({
    providerId: providerIdSchema,
    version: versionSchema,
    contractVersion: z.literal(CONTRACT_VERSION),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    logoUrl: httpsUrl.optional(),
    websiteUrl: httpsUrl.optional(),
    auth: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("NONE") }).strict(),
      z.object({ kind: z.literal("API_KEY") }).strict(),
      z
        .object({
          kind: z.literal("BROWSER"),
          identityProvider: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional(),
          loginUrl: httpsUrl,
          navigationOrigins: z.array(httpsOrigin).min(1),
          pageOrigins: z.array(httpsOrigin).min(1),
        })
        .strict(),
    ]),
    accountFields: z.array(field).default([]),
    operations: z.partialRecord(operationSchema, operationDefinition),
    requestOrigins: z.array(httpsOrigin),
    mediaOrigins: z.array(httpsOrigin).min(1),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const { auth, operations, accountFields } = manifest;
    const definitions = Object.values(operations);
    if (
      !definitions.length ||
      !fieldsAreUnique(accountFields) ||
      definitions.some(
        ({ fields, models, transport }) =>
          !fieldsAreUnique(fields) ||
          fields.some(({ type }) => type === "SECRET") ||
          new Set(models.map(({ id }) => id)).size !== models.length ||
          (transport === "BROWSER" && auth.kind !== "BROWSER"),
      ) ||
      (auth.kind === "API_KEY" &&
        !accountFields.some(
          ({ type, required }) => type === "SECRET" && required,
        )) ||
      (auth.kind === "BROWSER" &&
        (!auth.navigationOrigins.includes(new URL(auth.loginUrl).origin) ||
          auth.pageOrigins.some(
            (origin) => !auth.navigationOrigins.includes(origin),
          )))
    ) {
      ctx.addIssue({ code: "custom", message: "Inconsistent plugin manifest" });
    }
  });
export type PluginManifest = z.infer<typeof manifestSchema>;

export const pluginManifestSchema = z
  .object({
    pluginId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    name: z.string().min(1).max(100),
    publisher: z.string().min(1).max(100),
    version: versionSchema,
    contractVersion: z.literal(CONTRACT_VERSION),
    providers: z.array(manifestSchema).min(1),
  })
  .strict()
  .superRefine((plugin, ctx) => {
    if (
      new Set(plugin.providers.map(({ providerId }) => providerId)).size !==
        plugin.providers.length ||
      plugin.providers.some((provider) => provider.version !== plugin.version)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Plugin providers require unique IDs and the package version",
      });
    }
  });
export type PluginPackageManifest = z.infer<typeof pluginManifestSchema>;

export const generateRequestSchema = z
  .object({
    requestId: z.string().min(1),
    providerId: providerIdSchema,
    profileId: z.string().min(1).optional(),
    operation: operationSchema,
    input: z
      .object({
        prompt: z.string().trim().min(1),
        model: z.string().min(1),
        parameters: z.record(z.string(), z.json()),
      })
      .strict(),
  })
  .strict();
export type GenerateRequest = z.infer<typeof generateRequestSchema>;
export type JsonValue = z.infer<ReturnType<typeof z.json>>;

export const errorCodeSchema = z.enum([
  "AUTH_REQUIRED",
  "INVALID_INPUT",
  "UNSUPPORTED_OPERATION",
  "PROVIDER_FAILED",
  "PLUGIN_NOT_INSTALLED",
  "INVALID_RESULT",
  "CANCELLED",
]);
export type GenerationErrorCode = z.infer<typeof errorCodeSchema>;
export class GenerationPluginError extends Error {
  constructor(
    readonly code: GenerationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GenerationPluginError";
  }
}

export const generateResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      media: z
        .object({
          kind: z.enum(["IMAGE", "VIDEO"]),
          mimeType: z.string().regex(/^(image|video)\/[a-z0-9.+-]+$/),
          source: z.object({ kind: z.literal("URL"), url: httpsUrl }).strict(),
          providerRefs: z.record(z.string(), z.string()).optional(),
          metadata: z.record(z.string(), z.json()).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z
        .object({
          code: errorCodeSchema,
          message: z.string().min(1),
          retryable: z.boolean(),
        })
        .strict(),
    })
    .strict(),
]);
export type GenerateResult = z.infer<typeof generateResultSchema>;

export const connectionResultSchema = z.discriminatedUnion("status", [
  z
    .object({ status: z.literal("CONNECTED"), label: z.string().optional() })
    .strict(),
  z
    .object({ status: z.literal("AUTH_REQUIRED"), message: z.string().min(1) })
    .strict(),
]);
export type ConnectionResult = z.infer<typeof connectionResultSchema>;

export const httpRequestSchema = z
  .object({
    url: httpsUrl,
    transport: z.enum(["HTTP", "BROWSER"]).default("HTTP"),
    proxy: z.string().min(1).optional(),
    method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).default("GET"),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.string().optional(),
    responseType: z.enum(["TEXT", "JSON"]).default("JSON"),
    credential: z
      .object({
        field: fieldId,
        header: z.string().regex(/^[\w-]+$/),
        prefix: z.string().max(32).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type PluginHttpRequest = z.input<typeof httpRequestSchema>;

export interface PluginHost {
  readonly signal: AbortSignal;
  readonly account: {
    id?: string;
    fields: Readonly<Record<string, JsonValue>>;
  };
  request<T = JsonValue>(request: PluginHttpRequest): Promise<T>;
  page<T = JsonValue>(script: string): Promise<T>;
  /** Generic browser resources, scoped to the signed provider page origins. */
  session<T = JsonValue>(operation: "browser.cookies" | "browser.navigate", args?: JsonValue[]): Promise<T>;
}

export interface GenerationProviderPlugin {
  manifest: PluginManifest;
  generate(request: GenerateRequest, host: PluginHost): Promise<GenerateResult>;
  checkConnection?(host: PluginHost): Promise<ConnectionResult>;
}

export function defineProvider(
  plugin: GenerationProviderPlugin,
): GenerationProviderPlugin {
  const manifest = manifestSchema.parse(plugin.manifest);
  if (
    typeof plugin.generate !== "function" ||
    (manifest.auth.kind !== "NONE" &&
      typeof plugin.checkConnection !== "function")
  ) {
    throw new Error(
      "Plugin handlers do not match its authentication or operation contract",
    );
  }
  return { ...plugin, manifest };
}

export interface GenerationPlugin {
  manifest: PluginPackageManifest;
  providers: GenerationProviderPlugin[];
}

export function definePlugin(plugin: GenerationPlugin): GenerationPlugin {
  const manifest = pluginManifestSchema.parse(plugin.manifest);
  const providers = plugin.providers.map(defineProvider);
  if (
    providers.length !== manifest.providers.length ||
    new Set(providers.map(({ manifest }) => manifest.providerId)).size !==
      providers.length ||
    providers.some((provider) => {
      const declared = manifest.providers.find(
        ({ providerId }) => providerId === provider.manifest.providerId,
      );
      return (
        !declared ||
        JSON.stringify(declared) !== JSON.stringify(provider.manifest)
      );
    })
  ) {
    throw new Error("Plugin handlers do not match the declared providers");
  }
  return { manifest, providers };
}

export function normalizeFields(
  fields: PluginField[],
  values: Record<string, JsonValue>,
  options: { allowExtra?: boolean; partial?: boolean } = {},
): Record<string, JsonValue> {
  const result = options.allowExtra
    ? { ...values }
    : Object.fromEntries(
        Object.entries(values).filter(([id]) =>
          fields.some((field) => field.id === id),
        ),
      );
  if (
    !options.allowExtra &&
    Object.keys(result).length !== Object.keys(values).length
  ) {
    throw new GenerationPluginError(
      "INVALID_INPUT",
      "Unknown configuration field",
    );
  }
  for (const field of fields) {
    const value = Object.hasOwn(values, field.id)
      ? values[field.id]
      : field.default;
    if (value === undefined || value === "") {
      if (field.required && !options.partial) {
        throw new GenerationPluginError(
          "INVALID_INPUT",
          `${field.label} is required`,
        );
      }
      if (value === "") delete result[field.id];
    } else if (!matchesField(field, value)) {
      throw new GenerationPluginError(
        "INVALID_INPUT",
        `Invalid value for ${field.label}`,
      );
    } else {
      Object.defineProperty(result, field.id, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  return result;
}

export function normalizeRequest(
  manifest: PluginManifest,
  input: unknown,
): GenerateRequest {
  const parsed = generateRequestSchema.safeParse(input);
  if (!parsed.success)
    throw new GenerationPluginError(
      "INVALID_INPUT",
      "Invalid generation request",
    );
  const request = parsed.data;
  if (request.providerId !== manifest.providerId) {
    throw new GenerationPluginError(
      "INVALID_INPUT",
      "Request provider does not match plugin",
    );
  }
  const operation = manifest.operations[request.operation];
  if (!operation) {
    throw new GenerationPluginError(
      "UNSUPPORTED_OPERATION",
      `${manifest.name} does not support ${request.operation}`,
    );
  }
  if (!operation.models.some(({ id }) => id === request.input.model)) {
    throw new GenerationPluginError(
      "INVALID_INPUT",
      "Model is unavailable for this operation",
    );
  }
  const common = new Set([
    "ratio",
    "seed",
    "duration",
    "resolution",
    "name",
    "options",
    "proxy",
    "refId",
    "refIds",
    "sourceMediaId",
    "imageUrl",
    "startFrameUrl",
    "endFrameUrl",
    "entities",
  ]);
  const declared = new Set(operation.fields.map(({ id }) => id));
  if (
    Object.keys(request.input.parameters).some(
      (id) => !common.has(id) && !declared.has(id),
    )
  ) {
    throw new GenerationPluginError(
      "INVALID_INPUT",
      "Generation parameter is not declared by the plugin",
    );
  }
  request.input.parameters = normalizeFields(
    operation.fields,
    request.input.parameters,
    {
      allowExtra: true,
    },
  );
  return request;
}

export function validateResult(
  manifest: PluginManifest,
  operation: GenerationOperation,
  input: unknown,
): GenerateResult {
  const parsed = generateResultSchema.safeParse(input);
  if (!parsed.success)
    throw new GenerationPluginError(
      "INVALID_RESULT",
      "Plugin returned an invalid result",
    );
  const result = parsed.data;
  if (result.ok) {
    const kind = operation === "VIDEO" ? "VIDEO" : "IMAGE";
    if (
      result.media.kind !== kind ||
      !result.media.mimeType.startsWith(kind.toLowerCase() + "/") ||
      !manifest.mediaOrigins.includes(new URL(result.media.source.url).origin)
    ) {
      throw new GenerationPluginError(
        "INVALID_RESULT",
        "Plugin returned an undeclared media type or origin",
      );
    }
  }
  return result;
}

export function createTestHost(
  overrides: Partial<PluginHost> = {},
): PluginHost {
  const unavailable = async (): Promise<never> => {
    throw new Error("Host operation was not mocked");
  };
  return {
    signal: new AbortController().signal,
    account: { fields: {} },
    request: unavailable,
    page: unavailable,
    session: unavailable,
    ...overrides,
  };
}
