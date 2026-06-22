#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/citty/dist/_chunks/libs/scule.mjs
function isUppercase(char = "") {
  if (NUMBER_CHAR_RE.test(char)) return;
  return char !== char.toLowerCase();
}
function splitByCase(str, separators) {
  const splitters = separators ?? STR_SPLITTERS;
  const parts = [];
  if (!str || typeof str !== "string") return parts;
  let buff = "";
  let previousUpper;
  let previousSplitter;
  for (const char of str) {
    const isSplitter = splitters.includes(char);
    if (isSplitter === true) {
      parts.push(buff);
      buff = "";
      previousUpper = void 0;
      continue;
    }
    const isUpper = isUppercase(char);
    if (previousSplitter === false) {
      if (previousUpper === false && isUpper === true) {
        parts.push(buff);
        buff = char;
        previousUpper = isUpper;
        continue;
      }
      if (previousUpper === true && isUpper === false && buff.length > 1) {
        const lastChar = buff.at(-1);
        parts.push(buff.slice(0, Math.max(0, buff.length - 1)));
        buff = lastChar + char;
        previousUpper = isUpper;
        continue;
      }
    }
    buff += char;
    previousUpper = isUpper;
    previousSplitter = isSplitter;
  }
  parts.push(buff);
  return parts;
}
function upperFirst(str) {
  return str ? str[0].toUpperCase() + str.slice(1) : "";
}
function lowerFirst(str) {
  return str ? str[0].toLowerCase() + str.slice(1) : "";
}
function pascalCase(str, opts) {
  return str ? (Array.isArray(str) ? str : splitByCase(str)).map((p) => upperFirst(opts?.normalize ? p.toLowerCase() : p)).join("") : "";
}
function camelCase(str, opts) {
  return lowerFirst(pascalCase(str || "", opts));
}
function kebabCase(str, joiner) {
  return str ? (Array.isArray(str) ? str : splitByCase(str)).map((p) => p.toLowerCase()).join(joiner ?? "-") : "";
}
function snakeCase(str) {
  return kebabCase(str || "", "_");
}
var NUMBER_CHAR_RE, STR_SPLITTERS;
var init_scule = __esm({
  "node_modules/citty/dist/_chunks/libs/scule.mjs"() {
    NUMBER_CHAR_RE = /\d/;
    STR_SPLITTERS = [
      "-",
      "_",
      "/",
      "."
    ];
  }
});

// node_modules/citty/dist/index.mjs
import { parseArgs as parseArgs$1 } from "node:util";
function toArray(val) {
  if (Array.isArray(val)) return val;
  return val === void 0 ? [] : [val];
}
function formatLineColumns(lines, linePrefix = "") {
  const maxLength = [];
  for (const line of lines) for (const [i, element] of line.entries()) maxLength[i] = Math.max(maxLength[i] || 0, element.length);
  return lines.map((l) => l.map((c, i) => linePrefix + c[i === 0 ? "padStart" : "padEnd"](maxLength[i])).join("  ")).join("\n");
}
function resolveValue(input) {
  return typeof input === "function" ? input() : input;
}
function parseRawArgs(args = [], opts = {}) {
  const booleans = new Set(opts.boolean || []);
  const strings = new Set(opts.string || []);
  const aliasMap = opts.alias || {};
  const defaults = opts.default || {};
  const aliasToMain = /* @__PURE__ */ new Map();
  const mainToAliases = /* @__PURE__ */ new Map();
  for (const [key, value] of Object.entries(aliasMap)) {
    const targets = value;
    for (const target of targets) {
      aliasToMain.set(key, target);
      if (!mainToAliases.has(target)) mainToAliases.set(target, []);
      mainToAliases.get(target).push(key);
      aliasToMain.set(target, key);
      if (!mainToAliases.has(key)) mainToAliases.set(key, []);
      mainToAliases.get(key).push(target);
    }
  }
  const options = {};
  function getType(name) {
    if (booleans.has(name)) return "boolean";
    const aliases = mainToAliases.get(name) || [];
    for (const alias of aliases) if (booleans.has(alias)) return "boolean";
    return "string";
  }
  function isStringType(name) {
    if (strings.has(name)) return true;
    const aliases = mainToAliases.get(name) || [];
    for (const alias of aliases) if (strings.has(alias)) return true;
    return false;
  }
  const allOptions = /* @__PURE__ */ new Set([
    ...booleans,
    ...strings,
    ...Object.keys(aliasMap),
    ...Object.values(aliasMap).flat(),
    ...Object.keys(defaults)
  ]);
  for (const name of allOptions) if (!options[name]) options[name] = {
    type: getType(name),
    default: defaults[name]
  };
  for (const [alias, main] of aliasToMain.entries()) if (alias.length === 1 && options[main] && !options[main].short) options[main].short = alias;
  const processedArgs = [];
  const negatedFlags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      processedArgs.push(...args.slice(i));
      break;
    }
    if (arg.startsWith("--no-")) {
      const flagName = arg.slice(5);
      negatedFlags[flagName] = true;
      continue;
    }
    processedArgs.push(arg);
  }
  let parsed;
  try {
    parsed = parseArgs$1({
      args: processedArgs,
      options: Object.keys(options).length > 0 ? options : void 0,
      allowPositionals: true,
      strict: false
    });
  } catch {
    parsed = {
      values: {},
      positionals: processedArgs
    };
  }
  const out = { _: [] };
  out._ = parsed.positionals;
  for (const [key, value] of Object.entries(parsed.values)) {
    let coerced = value;
    if (getType(key) === "boolean" && typeof value === "string") coerced = value !== "false";
    else if (isStringType(key) && typeof value === "boolean") coerced = "";
    out[key] = coerced;
  }
  for (const [name] of Object.entries(negatedFlags)) {
    out[name] = false;
    const mainName = aliasToMain.get(name);
    if (mainName) out[mainName] = false;
    const aliases = mainToAliases.get(name);
    if (aliases) for (const alias of aliases) out[alias] = false;
  }
  for (const [alias, main] of aliasToMain.entries()) {
    if (out[alias] !== void 0 && out[main] === void 0) out[main] = out[alias];
    if (out[main] !== void 0 && out[alias] === void 0) out[alias] = out[main];
    if (out[alias] !== out[main] && defaults[main] === out[main]) out[main] = out[alias];
  }
  return out;
}
function parseArgs(rawArgs, argsDef) {
  const parseOptions = {
    boolean: [],
    string: [],
    alias: {},
    default: {}
  };
  const args = resolveArgs(argsDef);
  for (const arg of args) {
    if (arg.type === "positional") continue;
    if (arg.type === "string" || arg.type === "enum") parseOptions.string.push(arg.name);
    else if (arg.type === "boolean") parseOptions.boolean.push(arg.name);
    if (arg.default !== void 0) parseOptions.default[arg.name] = arg.default;
    if (arg.alias) parseOptions.alias[arg.name] = arg.alias;
    const camelName = camelCase(arg.name);
    const kebabName = kebabCase(arg.name);
    if (camelName !== arg.name || kebabName !== arg.name) {
      const existingAliases = toArray(parseOptions.alias[arg.name] || []);
      if (camelName !== arg.name && !existingAliases.includes(camelName)) existingAliases.push(camelName);
      if (kebabName !== arg.name && !existingAliases.includes(kebabName)) existingAliases.push(kebabName);
      if (existingAliases.length > 0) parseOptions.alias[arg.name] = existingAliases;
    }
  }
  const parsed = parseRawArgs(rawArgs, parseOptions);
  const [...positionalArguments] = parsed._;
  const parsedArgsProxy = new Proxy(parsed, { get(target, prop) {
    return target[prop] ?? target[camelCase(prop)] ?? target[kebabCase(prop)];
  } });
  for (const [, arg] of args.entries()) if (arg.type === "positional") {
    const nextPositionalArgument = positionalArguments.shift();
    if (nextPositionalArgument !== void 0) parsedArgsProxy[arg.name] = nextPositionalArgument;
    else if (arg.default === void 0 && arg.required !== false) throw new CLIError(`Missing required positional argument: ${arg.name.toUpperCase()}`, "EARG");
    else parsedArgsProxy[arg.name] = arg.default;
  } else if (arg.type === "enum") {
    const argument = parsedArgsProxy[arg.name];
    const options = arg.options || [];
    if (argument !== void 0 && options.length > 0 && !options.includes(argument)) throw new CLIError(`Invalid value for argument: ${cyan(`--${arg.name}`)} (${cyan(argument)}). Expected one of: ${options.map((o) => cyan(o)).join(", ")}.`, "EARG");
  } else if (arg.required && parsedArgsProxy[arg.name] === void 0) throw new CLIError(`Missing required argument: --${arg.name}`, "EARG");
  return parsedArgsProxy;
}
function resolveArgs(argsDef) {
  const args = [];
  for (const [name, argDef] of Object.entries(argsDef || {})) args.push({
    ...argDef,
    name,
    alias: toArray(argDef.alias)
  });
  return args;
}
async function resolvePlugins(plugins) {
  return Promise.all(plugins.map((p) => resolveValue(p)));
}
function defineCommand(def) {
  return def;
}
async function runCommand(cmd, opts) {
  const cmdArgs = await resolveValue(cmd.args || {});
  const parsedArgs = parseArgs(opts.rawArgs, cmdArgs);
  const context = {
    rawArgs: opts.rawArgs,
    args: parsedArgs,
    data: opts.data,
    cmd
  };
  const plugins = await resolvePlugins(cmd.plugins ?? []);
  let result;
  let runError;
  try {
    for (const plugin of plugins) await plugin.setup?.(context);
    if (typeof cmd.setup === "function") await cmd.setup(context);
    const subCommands = await resolveValue(cmd.subCommands);
    if (subCommands && Object.keys(subCommands).length > 0) {
      const subCommandArgIndex = findSubCommandIndex(opts.rawArgs, cmdArgs);
      const explicitName = opts.rawArgs[subCommandArgIndex];
      if (explicitName) {
        const subCommand = await _findSubCommand(subCommands, explicitName);
        if (!subCommand) throw new CLIError(`Unknown command ${cyan(explicitName)}`, "E_UNKNOWN_COMMAND");
        await runCommand(subCommand, { rawArgs: opts.rawArgs.slice(subCommandArgIndex + 1) });
      } else {
        const defaultSubCommand = await resolveValue(cmd.default);
        if (defaultSubCommand) {
          if (cmd.run) throw new CLIError(`Cannot specify both 'run' and 'default' on the same command.`, "E_DEFAULT_CONFLICT");
          const subCommand = await _findSubCommand(subCommands, defaultSubCommand);
          if (!subCommand) throw new CLIError(`Default sub command ${cyan(defaultSubCommand)} not found in subCommands.`, "E_UNKNOWN_COMMAND");
          await runCommand(subCommand, { rawArgs: opts.rawArgs });
        } else if (!cmd.run) throw new CLIError(`No command specified.`, "E_NO_COMMAND");
      }
    }
    if (typeof cmd.run === "function") result = await cmd.run(context);
  } catch (error) {
    runError = error;
  }
  const cleanupErrors = [];
  if (typeof cmd.cleanup === "function") try {
    await cmd.cleanup(context);
  } catch (error) {
    cleanupErrors.push(error);
  }
  for (const plugin of [...plugins].reverse()) try {
    await plugin.cleanup?.(context);
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (runError) throw runError;
  if (cleanupErrors.length === 1) throw cleanupErrors[0];
  if (cleanupErrors.length > 1) throw new Error("Multiple cleanup errors", { cause: cleanupErrors });
  return { result };
}
async function _findSubCommand(subCommands, name) {
  if (name in subCommands) return resolveValue(subCommands[name]);
  for (const sub of Object.values(subCommands)) {
    const resolved = await resolveValue(sub);
    const meta = await resolveValue(resolved?.meta);
    if (meta?.alias) {
      if (toArray(meta.alias).includes(name)) return resolved;
    }
  }
}
function findSubCommandIndex(rawArgs, argsDef) {
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "--") return -1;
    if (arg.startsWith("-")) {
      if (!arg.includes("=") && _isValueFlag(arg, argsDef)) i++;
      continue;
    }
    return i;
  }
  return -1;
}
function _isValueFlag(flag, argsDef) {
  const name = flag.replace(/^-{1,2}/, "");
  const normalized = camelCase(name);
  for (const [key, def] of Object.entries(argsDef)) {
    if (def.type !== "string" && def.type !== "enum") continue;
    if (normalized === camelCase(key)) return true;
    if ((Array.isArray(def.alias) ? def.alias : def.alias ? [def.alias] : []).includes(name)) return true;
  }
  return false;
}
async function renderUsage(cmd, parent) {
  const cmdMeta = await resolveValue(cmd.meta || {});
  const cmdArgs = resolveArgs(await resolveValue(cmd.args || {}));
  const parentMeta = await resolveValue(parent?.meta || {});
  const commandName2 = `${parentMeta.name ? `${parentMeta.name} ` : ""}` + (cmdMeta.name || process.argv[1]);
  const argLines = [];
  const posLines = [];
  const commandsLines = [];
  const usageLine = [];
  for (const arg of cmdArgs) if (arg.type === "positional") {
    const name = arg.name.toUpperCase();
    const isRequired = arg.required !== false && arg.default === void 0;
    posLines.push([cyan(name + renderValueHint(arg)), renderDescription(arg, isRequired)]);
    usageLine.push(isRequired ? `<${name}>` : `[${name}]`);
  } else {
    const isRequired = arg.required === true && arg.default === void 0;
    const argStr = [...(arg.alias || []).map((a) => `-${a}`), `--${arg.name}`].join(", ") + renderValueHint(arg);
    argLines.push([cyan(argStr), renderDescription(arg, isRequired)]);
    if (arg.type === "boolean" && (arg.default === true || arg.negativeDescription) && !negativePrefixRe.test(arg.name)) {
      const negativeArgStr = [...(arg.alias || []).map((a) => `--no-${a}`), `--no-${arg.name}`].join(", ");
      argLines.push([cyan(negativeArgStr), [arg.negativeDescription, isRequired ? gray("(Required)") : ""].filter(Boolean).join(" ")]);
    }
    if (isRequired) usageLine.push(`--${arg.name}` + renderValueHint(arg));
  }
  if (cmd.subCommands) {
    const commandNames = [];
    const subCommands = await resolveValue(cmd.subCommands);
    for (const [name, sub] of Object.entries(subCommands)) {
      const meta = await resolveValue((await resolveValue(sub))?.meta);
      if (meta?.hidden) continue;
      const aliases = toArray(meta?.alias);
      const label = [name, ...aliases].join(", ");
      commandsLines.push([cyan(label), meta?.description || ""]);
      commandNames.push(name, ...aliases);
    }
    usageLine.push(commandNames.join("|"));
  }
  const usageLines = [];
  const version = cmdMeta.version || parentMeta.version;
  usageLines.push(gray(`${cmdMeta.description} (${commandName2 + (version ? ` v${version}` : "")})`), "");
  const hasOptions = argLines.length > 0 || posLines.length > 0;
  usageLines.push(`${underline(bold("USAGE"))} ${cyan(`${commandName2}${hasOptions ? " [OPTIONS]" : ""} ${usageLine.join(" ")}`)}`, "");
  if (posLines.length > 0) {
    usageLines.push(underline(bold("ARGUMENTS")), "");
    usageLines.push(formatLineColumns(posLines, "  "));
    usageLines.push("");
  }
  if (argLines.length > 0) {
    usageLines.push(underline(bold("OPTIONS")), "");
    usageLines.push(formatLineColumns(argLines, "  "));
    usageLines.push("");
  }
  if (commandsLines.length > 0) {
    usageLines.push(underline(bold("COMMANDS")), "");
    usageLines.push(formatLineColumns(commandsLines, "  "));
    usageLines.push("", `Use ${cyan(`${commandName2} <command> --help`)} for more information about a command.`);
  }
  return usageLines.filter((l) => typeof l === "string").join("\n");
}
function renderValueHint(arg) {
  const valueHint = arg.valueHint ? `=<${arg.valueHint}>` : "";
  const fallbackValueHint = valueHint || `=<${snakeCase(arg.name)}>`;
  if (!arg.type || arg.type === "positional" || arg.type === "boolean") return valueHint;
  if (arg.type === "enum" && arg.options?.length) return `=<${arg.options.join("|")}>`;
  return fallbackValueHint;
}
function renderDescription(arg, required) {
  const requiredHint = required ? gray("(Required)") : "";
  const defaultHint = arg.default === void 0 ? "" : gray(`(Default: ${arg.default})`);
  return [
    arg.description,
    requiredHint,
    defaultHint
  ].filter(Boolean).join(" ");
}
var CLIError, noColor, _c, bold, cyan, gray, underline, negativePrefixRe;
var init_dist = __esm({
  "node_modules/citty/dist/index.mjs"() {
    init_scule();
    CLIError = class extends Error {
      code;
      constructor(message2, code) {
        super(message2);
        this.name = "CLIError";
        this.code = code;
      }
    };
    noColor = /* @__PURE__ */ (() => {
      const env = globalThis.process?.env ?? {};
      return env.NO_COLOR === "1" || env.TERM === "dumb" || env.TEST || env.CI;
    })();
    _c = (c, r = 39) => (t) => noColor ? t : `\x1B[${c}m${t}\x1B[${r}m`;
    bold = /* @__PURE__ */ _c(1, 22);
    cyan = /* @__PURE__ */ _c(36);
    gray = /* @__PURE__ */ _c(90);
    underline = /* @__PURE__ */ _c(4, 24);
    negativePrefixRe = /^no[-A-Z]/;
  }
});

// dist/errors.js
var AscError, AscCredentialError, AscAuthenticationError, AscPermissionError, AscNotFoundError, AscInvalidParameterError, AscRateLimitError, AscRateLimitFloorError, AscUpstreamError, AscNetworkError, AscFileProcessingError;
var init_errors = __esm({
  "dist/errors.js"() {
    "use strict";
    AscError = class extends Error {
      /** Raw JSON:API `errors` array, verbatim. Empty when no body was available. */
      apiErrors;
      rateLimit;
      request;
      /** Set when the failure happened during a multi-page read. */
      pagination;
      constructor(message2, options = {}) {
        super(message2, options.cause !== void 0 ? { cause: options.cause } : void 0);
        this.name = new.target.name;
        this.apiErrors = options.apiErrors ?? [];
        if (options.rateLimit !== void 0) {
          this.rateLimit = options.rateLimit;
        }
        if (options.request !== void 0) {
          this.request = options.request;
        }
        if (options.pagination !== void 0) {
          this.pagination = options.pagination;
        }
      }
    };
    AscCredentialError = class extends AscError {
      category = "credential";
      reason;
      constructor(message2, reason, options) {
        super(message2, options);
        this.reason = reason;
      }
    };
    AscAuthenticationError = class extends AscError {
      category = "authentication";
    };
    AscPermissionError = class extends AscError {
      category = "permission";
    };
    AscNotFoundError = class extends AscError {
      category = "not-found";
    };
    AscInvalidParameterError = class extends AscError {
      category = "invalid-parameter";
    };
    AscRateLimitError = class extends AscError {
      category = "rate-limit";
    };
    AscRateLimitFloorError = class extends AscRateLimitError {
      /** The floor (remaining-requests threshold) that triggered the stop. */
      floor;
      constructor(message2, floor, options) {
        super(message2, options);
        this.floor = floor;
      }
    };
    AscUpstreamError = class extends AscError {
      category = "upstream";
    };
    AscNetworkError = class extends AscError {
      category = "network";
      /** Total attempts made, including the first. */
      attempts;
      constructor(message2, attempts, options) {
        super(message2, options);
        this.attempts = attempts;
      }
    };
    AscFileProcessingError = class extends AscError {
      category = "file-processing";
      stage;
      /** Local path or external URL involved. Never carries credentials. */
      target;
      constructor(message2, stage, options = {}) {
        const { target, ...errorOptions } = options;
        super(message2, errorOptions);
        this.stage = stage;
        if (target !== void 0) {
          this.target = target;
        }
      }
    };
  }
});

// node_modules/jose/dist/webapi/lib/buffer_utils.js
function concat(...buffers) {
  const size = buffers.reduce((acc, { length }) => acc + length, 0);
  const buf = new Uint8Array(size);
  let i = 0;
  for (const buffer of buffers) {
    buf.set(buffer, i);
    i += buffer.length;
  }
  return buf;
}
function encode(string) {
  const bytes = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i++) {
    const code = string.charCodeAt(i);
    if (code > 127) {
      throw new TypeError("non-ASCII string encountered in encode()");
    }
    bytes[i] = code;
  }
  return bytes;
}
var encoder, decoder, MAX_INT32;
var init_buffer_utils = __esm({
  "node_modules/jose/dist/webapi/lib/buffer_utils.js"() {
    encoder = new TextEncoder();
    decoder = new TextDecoder();
    MAX_INT32 = 2 ** 32;
  }
});

// node_modules/jose/dist/webapi/lib/base64.js
function encodeBase64(input) {
  if (Uint8Array.prototype.toBase64) {
    return input.toBase64();
  }
  const CHUNK_SIZE = 32768;
  const arr = [];
  for (let i = 0; i < input.length; i += CHUNK_SIZE) {
    arr.push(String.fromCharCode.apply(null, input.subarray(i, i + CHUNK_SIZE)));
  }
  return btoa(arr.join(""));
}
function decodeBase64(encoded) {
  if (Uint8Array.fromBase64) {
    return Uint8Array.fromBase64(encoded);
  }
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
var init_base64 = __esm({
  "node_modules/jose/dist/webapi/lib/base64.js"() {
  }
});

// node_modules/jose/dist/webapi/util/base64url.js
function decode(input) {
  if (Uint8Array.fromBase64) {
    return Uint8Array.fromBase64(typeof input === "string" ? input : decoder.decode(input), {
      alphabet: "base64url"
    });
  }
  let encoded = input;
  if (encoded instanceof Uint8Array) {
    encoded = decoder.decode(encoded);
  }
  encoded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return decodeBase64(encoded);
  } catch {
    throw new TypeError("The input to be decoded is not correctly encoded.");
  }
}
function encode2(input) {
  let unencoded = input;
  if (typeof unencoded === "string") {
    unencoded = encoder.encode(unencoded);
  }
  if (Uint8Array.prototype.toBase64) {
    return unencoded.toBase64({ alphabet: "base64url", omitPadding: true });
  }
  return encodeBase64(unencoded).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
var init_base64url = __esm({
  "node_modules/jose/dist/webapi/util/base64url.js"() {
    init_buffer_utils();
    init_base64();
  }
});

// node_modules/jose/dist/webapi/lib/crypto_key.js
function getHashLength(hash) {
  return parseInt(hash.name.slice(4), 10);
}
function checkHashLength(algorithm, expected) {
  const actual = getHashLength(algorithm.hash);
  if (actual !== expected)
    throw unusable(`SHA-${expected}`, "algorithm.hash");
}
function getNamedCurve(alg) {
  switch (alg) {
    case "ES256":
      return "P-256";
    case "ES384":
      return "P-384";
    case "ES512":
      return "P-521";
    default:
      throw new Error("unreachable");
  }
}
function checkUsage(key, usage) {
  if (usage && !key.usages.includes(usage)) {
    throw new TypeError(`CryptoKey does not support this operation, its usages must include ${usage}.`);
  }
}
function checkSigCryptoKey(key, alg, usage) {
  switch (alg) {
    case "HS256":
    case "HS384":
    case "HS512": {
      if (!isAlgorithm(key.algorithm, "HMAC"))
        throw unusable("HMAC");
      checkHashLength(key.algorithm, parseInt(alg.slice(2), 10));
      break;
    }
    case "RS256":
    case "RS384":
    case "RS512": {
      if (!isAlgorithm(key.algorithm, "RSASSA-PKCS1-v1_5"))
        throw unusable("RSASSA-PKCS1-v1_5");
      checkHashLength(key.algorithm, parseInt(alg.slice(2), 10));
      break;
    }
    case "PS256":
    case "PS384":
    case "PS512": {
      if (!isAlgorithm(key.algorithm, "RSA-PSS"))
        throw unusable("RSA-PSS");
      checkHashLength(key.algorithm, parseInt(alg.slice(2), 10));
      break;
    }
    case "Ed25519":
    case "EdDSA": {
      if (!isAlgorithm(key.algorithm, "Ed25519"))
        throw unusable("Ed25519");
      break;
    }
    case "ML-DSA-44":
    case "ML-DSA-65":
    case "ML-DSA-87": {
      if (!isAlgorithm(key.algorithm, alg))
        throw unusable(alg);
      break;
    }
    case "ES256":
    case "ES384":
    case "ES512": {
      if (!isAlgorithm(key.algorithm, "ECDSA"))
        throw unusable("ECDSA");
      const expected = getNamedCurve(alg);
      const actual = key.algorithm.namedCurve;
      if (actual !== expected)
        throw unusable(expected, "algorithm.namedCurve");
      break;
    }
    default:
      throw new TypeError("CryptoKey does not support this operation");
  }
  checkUsage(key, usage);
}
var unusable, isAlgorithm;
var init_crypto_key = __esm({
  "node_modules/jose/dist/webapi/lib/crypto_key.js"() {
    unusable = (name, prop = "algorithm.name") => new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`);
    isAlgorithm = (algorithm, name) => algorithm.name === name;
  }
});

// node_modules/jose/dist/webapi/lib/invalid_key_input.js
function message(msg, actual, ...types) {
  types = types.filter(Boolean);
  if (types.length > 2) {
    const last = types.pop();
    msg += `one of type ${types.join(", ")}, or ${last}.`;
  } else if (types.length === 2) {
    msg += `one of type ${types[0]} or ${types[1]}.`;
  } else {
    msg += `of type ${types[0]}.`;
  }
  if (actual == null) {
    msg += ` Received ${actual}`;
  } else if (typeof actual === "function" && actual.name) {
    msg += ` Received function ${actual.name}`;
  } else if (typeof actual === "object" && actual != null) {
    if (actual.constructor?.name) {
      msg += ` Received an instance of ${actual.constructor.name}`;
    }
  }
  return msg;
}
var invalidKeyInput, withAlg;
var init_invalid_key_input = __esm({
  "node_modules/jose/dist/webapi/lib/invalid_key_input.js"() {
    invalidKeyInput = (actual, ...types) => message("Key must be ", actual, ...types);
    withAlg = (alg, actual, ...types) => message(`Key for the ${alg} algorithm must be `, actual, ...types);
  }
});

// node_modules/jose/dist/webapi/util/errors.js
var JOSEError, JOSENotSupported, JWSInvalid, JWTInvalid;
var init_errors2 = __esm({
  "node_modules/jose/dist/webapi/util/errors.js"() {
    JOSEError = class extends Error {
      static code = "ERR_JOSE_GENERIC";
      code = "ERR_JOSE_GENERIC";
      constructor(message2, options) {
        super(message2, options);
        this.name = this.constructor.name;
        Error.captureStackTrace?.(this, this.constructor);
      }
    };
    JOSENotSupported = class extends JOSEError {
      static code = "ERR_JOSE_NOT_SUPPORTED";
      code = "ERR_JOSE_NOT_SUPPORTED";
    };
    JWSInvalid = class extends JOSEError {
      static code = "ERR_JWS_INVALID";
      code = "ERR_JWS_INVALID";
    };
    JWTInvalid = class extends JOSEError {
      static code = "ERR_JWT_INVALID";
      code = "ERR_JWT_INVALID";
    };
  }
});

// node_modules/jose/dist/webapi/lib/is_key_like.js
var isCryptoKey, isKeyObject, isKeyLike;
var init_is_key_like = __esm({
  "node_modules/jose/dist/webapi/lib/is_key_like.js"() {
    isCryptoKey = (key) => {
      if (key?.[Symbol.toStringTag] === "CryptoKey")
        return true;
      try {
        return key instanceof CryptoKey;
      } catch {
        return false;
      }
    };
    isKeyObject = (key) => key?.[Symbol.toStringTag] === "KeyObject";
    isKeyLike = (key) => isCryptoKey(key) || isKeyObject(key);
  }
});

// node_modules/jose/dist/webapi/lib/helpers.js
function assertNotSet(value, name) {
  if (value) {
    throw new TypeError(`${name} can only be called once`);
  }
}
var init_helpers = __esm({
  "node_modules/jose/dist/webapi/lib/helpers.js"() {
  }
});

// node_modules/jose/dist/webapi/lib/type_checks.js
function isObject(input) {
  if (!isObjectLike(input) || Object.prototype.toString.call(input) !== "[object Object]") {
    return false;
  }
  if (Object.getPrototypeOf(input) === null) {
    return true;
  }
  let proto = input;
  while (Object.getPrototypeOf(proto) !== null) {
    proto = Object.getPrototypeOf(proto);
  }
  return Object.getPrototypeOf(input) === proto;
}
function isDisjoint(...headers) {
  const sources = headers.filter(Boolean);
  if (sources.length === 0 || sources.length === 1) {
    return true;
  }
  let acc;
  for (const header of sources) {
    const parameters = Object.keys(header);
    if (!acc || acc.size === 0) {
      acc = new Set(parameters);
      continue;
    }
    for (const parameter of parameters) {
      if (acc.has(parameter)) {
        return false;
      }
      acc.add(parameter);
    }
  }
  return true;
}
var isObjectLike, isJWK, isPrivateJWK, isPublicJWK, isSecretJWK;
var init_type_checks = __esm({
  "node_modules/jose/dist/webapi/lib/type_checks.js"() {
    isObjectLike = (value) => typeof value === "object" && value !== null;
    isJWK = (key) => isObject(key) && typeof key.kty === "string";
    isPrivateJWK = (key) => key.kty !== "oct" && (key.kty === "AKP" && typeof key.priv === "string" || typeof key.d === "string");
    isPublicJWK = (key) => key.kty !== "oct" && key.d === void 0 && key.priv === void 0;
    isSecretJWK = (key) => key.kty === "oct" && typeof key.k === "string";
  }
});

// node_modules/jose/dist/webapi/lib/signing.js
function checkKeyLength(alg, key) {
  if (alg.startsWith("RS") || alg.startsWith("PS")) {
    const { modulusLength } = key.algorithm;
    if (typeof modulusLength !== "number" || modulusLength < 2048) {
      throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
    }
  }
}
function subtleAlgorithm(alg, algorithm) {
  const hash = `SHA-${alg.slice(-3)}`;
  switch (alg) {
    case "HS256":
    case "HS384":
    case "HS512":
      return { hash, name: "HMAC" };
    case "PS256":
    case "PS384":
    case "PS512":
      return { hash, name: "RSA-PSS", saltLength: parseInt(alg.slice(-3), 10) >> 3 };
    case "RS256":
    case "RS384":
    case "RS512":
      return { hash, name: "RSASSA-PKCS1-v1_5" };
    case "ES256":
    case "ES384":
    case "ES512":
      return { hash, name: "ECDSA", namedCurve: algorithm.namedCurve };
    case "Ed25519":
    case "EdDSA":
      return { name: "Ed25519" };
    case "ML-DSA-44":
    case "ML-DSA-65":
    case "ML-DSA-87":
      return { name: alg };
    default:
      throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
  }
}
async function getSigKey(alg, key, usage) {
  if (key instanceof Uint8Array) {
    if (!alg.startsWith("HS")) {
      throw new TypeError(invalidKeyInput(key, "CryptoKey", "KeyObject", "JSON Web Key"));
    }
    return crypto.subtle.importKey("raw", key, { hash: `SHA-${alg.slice(-3)}`, name: "HMAC" }, false, [usage]);
  }
  checkSigCryptoKey(key, alg, usage);
  return key;
}
async function sign(alg, key, data) {
  const cryptoKey = await getSigKey(alg, key, "sign");
  checkKeyLength(alg, cryptoKey);
  const signature = await crypto.subtle.sign(subtleAlgorithm(alg, cryptoKey.algorithm), cryptoKey, data);
  return new Uint8Array(signature);
}
var init_signing = __esm({
  "node_modules/jose/dist/webapi/lib/signing.js"() {
    init_errors2();
    init_crypto_key();
    init_invalid_key_input();
  }
});

// node_modules/jose/dist/webapi/lib/jwk_to_key.js
function subtleMapping(jwk) {
  let algorithm;
  let keyUsages;
  switch (jwk.kty) {
    case "AKP": {
      switch (jwk.alg) {
        case "ML-DSA-44":
        case "ML-DSA-65":
        case "ML-DSA-87":
          algorithm = { name: jwk.alg };
          keyUsages = jwk.priv ? ["sign"] : ["verify"];
          break;
        default:
          throw new JOSENotSupported(unsupportedAlg);
      }
      break;
    }
    case "RSA": {
      switch (jwk.alg) {
        case "PS256":
        case "PS384":
        case "PS512":
          algorithm = { name: "RSA-PSS", hash: `SHA-${jwk.alg.slice(-3)}` };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "RS256":
        case "RS384":
        case "RS512":
          algorithm = { name: "RSASSA-PKCS1-v1_5", hash: `SHA-${jwk.alg.slice(-3)}` };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "RSA-OAEP":
        case "RSA-OAEP-256":
        case "RSA-OAEP-384":
        case "RSA-OAEP-512":
          algorithm = {
            name: "RSA-OAEP",
            hash: `SHA-${parseInt(jwk.alg.slice(-3), 10) || 1}`
          };
          keyUsages = jwk.d ? ["decrypt", "unwrapKey"] : ["encrypt", "wrapKey"];
          break;
        default:
          throw new JOSENotSupported(unsupportedAlg);
      }
      break;
    }
    case "EC": {
      switch (jwk.alg) {
        case "ES256":
        case "ES384":
        case "ES512":
          algorithm = {
            name: "ECDSA",
            namedCurve: { ES256: "P-256", ES384: "P-384", ES512: "P-521" }[jwk.alg]
          };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "ECDH-ES":
        case "ECDH-ES+A128KW":
        case "ECDH-ES+A192KW":
        case "ECDH-ES+A256KW":
          algorithm = { name: "ECDH", namedCurve: jwk.crv };
          keyUsages = jwk.d ? ["deriveBits"] : [];
          break;
        default:
          throw new JOSENotSupported(unsupportedAlg);
      }
      break;
    }
    case "OKP": {
      switch (jwk.alg) {
        case "Ed25519":
        case "EdDSA":
          algorithm = { name: "Ed25519" };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "ECDH-ES":
        case "ECDH-ES+A128KW":
        case "ECDH-ES+A192KW":
        case "ECDH-ES+A256KW":
          algorithm = { name: jwk.crv };
          keyUsages = jwk.d ? ["deriveBits"] : [];
          break;
        default:
          throw new JOSENotSupported(unsupportedAlg);
      }
      break;
    }
    default:
      throw new JOSENotSupported('Invalid or unsupported JWK "kty" (Key Type) Parameter value');
  }
  return { algorithm, keyUsages };
}
async function jwkToKey(jwk) {
  if (!jwk.alg) {
    throw new TypeError('"alg" argument is required when "jwk.alg" is not present');
  }
  const { algorithm, keyUsages } = subtleMapping(jwk);
  const keyData = { ...jwk };
  if (keyData.kty !== "AKP") {
    delete keyData.alg;
  }
  delete keyData.use;
  return crypto.subtle.importKey("jwk", keyData, algorithm, jwk.ext ?? (jwk.d || jwk.priv ? false : true), jwk.key_ops ?? keyUsages);
}
var unsupportedAlg;
var init_jwk_to_key = __esm({
  "node_modules/jose/dist/webapi/lib/jwk_to_key.js"() {
    init_errors2();
    unsupportedAlg = 'Invalid or unsupported JWK "alg" (Algorithm) Parameter value';
  }
});

// node_modules/jose/dist/webapi/lib/normalize_key.js
async function normalizeKey(key, alg) {
  if (key instanceof Uint8Array) {
    return key;
  }
  if (isCryptoKey(key)) {
    return key;
  }
  if (isKeyObject(key)) {
    if (key.type === "secret") {
      return key.export();
    }
    if ("toCryptoKey" in key && typeof key.toCryptoKey === "function") {
      try {
        return handleKeyObject(key, alg);
      } catch (err) {
        if (err instanceof TypeError) {
          throw err;
        }
      }
    }
    let jwk = key.export({ format: "jwk" });
    return handleJWK(key, jwk, alg);
  }
  if (isJWK(key)) {
    if (key.k) {
      return decode(key.k);
    }
    return handleJWK(key, key, alg, true);
  }
  throw new Error("unreachable");
}
var unusableForAlg, cache, handleJWK, handleKeyObject;
var init_normalize_key = __esm({
  "node_modules/jose/dist/webapi/lib/normalize_key.js"() {
    init_type_checks();
    init_base64url();
    init_jwk_to_key();
    init_is_key_like();
    unusableForAlg = "given KeyObject instance cannot be used for this algorithm";
    handleJWK = async (key, jwk, alg, freeze = false) => {
      cache ||= /* @__PURE__ */ new WeakMap();
      let cached = cache.get(key);
      if (cached?.[alg]) {
        return cached[alg];
      }
      const cryptoKey = await jwkToKey({ ...jwk, alg });
      if (freeze)
        Object.freeze(key);
      if (!cached) {
        cache.set(key, { [alg]: cryptoKey });
      } else {
        cached[alg] = cryptoKey;
      }
      return cryptoKey;
    };
    handleKeyObject = (keyObject, alg) => {
      cache ||= /* @__PURE__ */ new WeakMap();
      let cached = cache.get(keyObject);
      if (cached?.[alg]) {
        return cached[alg];
      }
      const isPublic = keyObject.type === "public";
      const extractable = isPublic ? true : false;
      let cryptoKey;
      if (keyObject.asymmetricKeyType === "x25519") {
        switch (alg) {
          case "ECDH-ES":
          case "ECDH-ES+A128KW":
          case "ECDH-ES+A192KW":
          case "ECDH-ES+A256KW":
            break;
          default:
            throw new TypeError(unusableForAlg);
        }
        cryptoKey = keyObject.toCryptoKey(keyObject.asymmetricKeyType, extractable, isPublic ? [] : ["deriveBits"]);
      }
      if (keyObject.asymmetricKeyType === "ed25519") {
        if (alg !== "EdDSA" && alg !== "Ed25519") {
          throw new TypeError(unusableForAlg);
        }
        cryptoKey = keyObject.toCryptoKey(keyObject.asymmetricKeyType, extractable, [
          isPublic ? "verify" : "sign"
        ]);
      }
      switch (keyObject.asymmetricKeyType) {
        case "ml-dsa-44":
        case "ml-dsa-65":
        case "ml-dsa-87": {
          if (alg !== keyObject.asymmetricKeyType.toUpperCase()) {
            throw new TypeError(unusableForAlg);
          }
          cryptoKey = keyObject.toCryptoKey(keyObject.asymmetricKeyType, extractable, [
            isPublic ? "verify" : "sign"
          ]);
        }
      }
      if (keyObject.asymmetricKeyType === "rsa") {
        let hash;
        switch (alg) {
          case "RSA-OAEP":
            hash = "SHA-1";
            break;
          case "RS256":
          case "PS256":
          case "RSA-OAEP-256":
            hash = "SHA-256";
            break;
          case "RS384":
          case "PS384":
          case "RSA-OAEP-384":
            hash = "SHA-384";
            break;
          case "RS512":
          case "PS512":
          case "RSA-OAEP-512":
            hash = "SHA-512";
            break;
          default:
            throw new TypeError(unusableForAlg);
        }
        if (alg.startsWith("RSA-OAEP")) {
          return keyObject.toCryptoKey({
            name: "RSA-OAEP",
            hash
          }, extractable, isPublic ? ["encrypt"] : ["decrypt"]);
        }
        cryptoKey = keyObject.toCryptoKey({
          name: alg.startsWith("PS") ? "RSA-PSS" : "RSASSA-PKCS1-v1_5",
          hash
        }, extractable, [isPublic ? "verify" : "sign"]);
      }
      if (keyObject.asymmetricKeyType === "ec") {
        const nist = /* @__PURE__ */ new Map([
          ["prime256v1", "P-256"],
          ["secp384r1", "P-384"],
          ["secp521r1", "P-521"]
        ]);
        const namedCurve = nist.get(keyObject.asymmetricKeyDetails?.namedCurve);
        if (!namedCurve) {
          throw new TypeError(unusableForAlg);
        }
        const expectedCurve = { ES256: "P-256", ES384: "P-384", ES512: "P-521" };
        if (expectedCurve[alg] && namedCurve === expectedCurve[alg]) {
          cryptoKey = keyObject.toCryptoKey({
            name: "ECDSA",
            namedCurve
          }, extractable, [isPublic ? "verify" : "sign"]);
        }
        if (alg.startsWith("ECDH-ES")) {
          cryptoKey = keyObject.toCryptoKey({
            name: "ECDH",
            namedCurve
          }, extractable, isPublic ? [] : ["deriveBits"]);
        }
      }
      if (!cryptoKey) {
        throw new TypeError(unusableForAlg);
      }
      if (!cached) {
        cache.set(keyObject, { [alg]: cryptoKey });
      } else {
        cached[alg] = cryptoKey;
      }
      return cryptoKey;
    };
  }
});

// node_modules/jose/dist/webapi/lib/asn1.js
function parsePKCS8Header(state) {
  expectTag(state, 48, "Invalid PKCS#8 structure");
  parseLength(state);
  expectTag(state, 2, "Expected version field");
  const verLen = parseLength(state);
  state.pos += verLen;
  expectTag(state, 48, "Expected algorithm identifier");
  const algIdLen = parseLength(state);
  const algIdStart = state.pos;
  return { algIdStart, algIdLength: algIdLen };
}
var bytesEqual, createASN1State, parseLength, expectTag, getSubarray, parseAlgorithmOID, parseECAlgorithmIdentifier, genericImport, processPEMData, fromPKCS8;
var init_asn1 = __esm({
  "node_modules/jose/dist/webapi/lib/asn1.js"() {
    init_base64();
    init_errors2();
    bytesEqual = (a, b) => {
      if (a.byteLength !== b.length)
        return false;
      for (let i = 0; i < a.byteLength; i++) {
        if (a[i] !== b[i])
          return false;
      }
      return true;
    };
    createASN1State = (data) => ({ data, pos: 0 });
    parseLength = (state) => {
      const first = state.data[state.pos++];
      if (first & 128) {
        const lengthOfLen = first & 127;
        let length = 0;
        for (let i = 0; i < lengthOfLen; i++) {
          length = length << 8 | state.data[state.pos++];
        }
        return length;
      }
      return first;
    };
    expectTag = (state, expectedTag, errorMessage) => {
      if (state.data[state.pos++] !== expectedTag) {
        throw new Error(errorMessage);
      }
    };
    getSubarray = (state, length) => {
      const result = state.data.subarray(state.pos, state.pos + length);
      state.pos += length;
      return result;
    };
    parseAlgorithmOID = (state) => {
      expectTag(state, 6, "Expected algorithm OID");
      const oidLen = parseLength(state);
      return getSubarray(state, oidLen);
    };
    parseECAlgorithmIdentifier = (state) => {
      const algOid = parseAlgorithmOID(state);
      if (bytesEqual(algOid, [43, 101, 110])) {
        return "X25519";
      }
      if (!bytesEqual(algOid, [42, 134, 72, 206, 61, 2, 1])) {
        throw new Error("Unsupported key algorithm");
      }
      expectTag(state, 6, "Expected curve OID");
      const curveOidLen = parseLength(state);
      const curveOid = getSubarray(state, curveOidLen);
      for (const { name, oid } of [
        { name: "P-256", oid: [42, 134, 72, 206, 61, 3, 1, 7] },
        { name: "P-384", oid: [43, 129, 4, 0, 34] },
        { name: "P-521", oid: [43, 129, 4, 0, 35] }
      ]) {
        if (bytesEqual(curveOid, oid)) {
          return name;
        }
      }
      throw new Error("Unsupported named curve");
    };
    genericImport = async (keyFormat, keyData, alg, options) => {
      let algorithm;
      let keyUsages;
      const isPublic = keyFormat === "spki";
      const getSigUsages = () => isPublic ? ["verify"] : ["sign"];
      const getEncUsages = () => isPublic ? ["encrypt", "wrapKey"] : ["decrypt", "unwrapKey"];
      switch (alg) {
        case "PS256":
        case "PS384":
        case "PS512":
          algorithm = { name: "RSA-PSS", hash: `SHA-${alg.slice(-3)}` };
          keyUsages = getSigUsages();
          break;
        case "RS256":
        case "RS384":
        case "RS512":
          algorithm = { name: "RSASSA-PKCS1-v1_5", hash: `SHA-${alg.slice(-3)}` };
          keyUsages = getSigUsages();
          break;
        case "RSA-OAEP":
        case "RSA-OAEP-256":
        case "RSA-OAEP-384":
        case "RSA-OAEP-512":
          algorithm = {
            name: "RSA-OAEP",
            hash: `SHA-${parseInt(alg.slice(-3), 10) || 1}`
          };
          keyUsages = getEncUsages();
          break;
        case "ES256":
        case "ES384":
        case "ES512": {
          const curveMap = { ES256: "P-256", ES384: "P-384", ES512: "P-521" };
          algorithm = { name: "ECDSA", namedCurve: curveMap[alg] };
          keyUsages = getSigUsages();
          break;
        }
        case "ECDH-ES":
        case "ECDH-ES+A128KW":
        case "ECDH-ES+A192KW":
        case "ECDH-ES+A256KW": {
          try {
            const namedCurve = options.getNamedCurve(keyData);
            algorithm = namedCurve === "X25519" ? { name: "X25519" } : { name: "ECDH", namedCurve };
          } catch (cause) {
            throw new JOSENotSupported("Invalid or unsupported key format");
          }
          keyUsages = isPublic ? [] : ["deriveBits"];
          break;
        }
        case "Ed25519":
        case "EdDSA":
          algorithm = { name: "Ed25519" };
          keyUsages = getSigUsages();
          break;
        case "ML-DSA-44":
        case "ML-DSA-65":
        case "ML-DSA-87":
          algorithm = { name: alg };
          keyUsages = getSigUsages();
          break;
        default:
          throw new JOSENotSupported('Invalid or unsupported "alg" (Algorithm) value');
      }
      return crypto.subtle.importKey(keyFormat, keyData, algorithm, options?.extractable ?? (isPublic ? true : false), keyUsages);
    };
    processPEMData = (pem, pattern) => {
      return decodeBase64(pem.replace(pattern, ""));
    };
    fromPKCS8 = (pem, alg, options) => {
      const keyData = processPEMData(pem, /(?:-----(?:BEGIN|END) PRIVATE KEY-----|\s)/g);
      let opts = options;
      if (alg?.startsWith?.("ECDH-ES")) {
        opts ||= {};
        opts.getNamedCurve = (keyData2) => {
          const state = createASN1State(keyData2);
          parsePKCS8Header(state);
          return parseECAlgorithmIdentifier(state);
        };
      }
      return genericImport("pkcs8", keyData, alg, opts);
    };
  }
});

// node_modules/jose/dist/webapi/key/import.js
async function importPKCS8(pkcs8, alg, options) {
  if (typeof pkcs8 !== "string" || pkcs8.indexOf("-----BEGIN PRIVATE KEY-----") !== 0) {
    throw new TypeError('"pkcs8" must be PKCS#8 formatted string');
  }
  return fromPKCS8(pkcs8, alg, options);
}
var init_import = __esm({
  "node_modules/jose/dist/webapi/key/import.js"() {
    init_asn1();
  }
});

// node_modules/jose/dist/webapi/lib/validate_crit.js
function validateCrit(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
  if (joseHeader.crit !== void 0 && protectedHeader?.crit === void 0) {
    throw new Err('"crit" (Critical) Header Parameter MUST be integrity protected');
  }
  if (!protectedHeader || protectedHeader.crit === void 0) {
    return /* @__PURE__ */ new Set();
  }
  if (!Array.isArray(protectedHeader.crit) || protectedHeader.crit.length === 0 || protectedHeader.crit.some((input) => typeof input !== "string" || input.length === 0)) {
    throw new Err('"crit" (Critical) Header Parameter MUST be an array of non-empty strings when present');
  }
  let recognized;
  if (recognizedOption !== void 0) {
    recognized = new Map([...Object.entries(recognizedOption), ...recognizedDefault.entries()]);
  } else {
    recognized = recognizedDefault;
  }
  for (const parameter of protectedHeader.crit) {
    if (!recognized.has(parameter)) {
      throw new JOSENotSupported(`Extension Header Parameter "${parameter}" is not recognized`);
    }
    if (joseHeader[parameter] === void 0) {
      throw new Err(`Extension Header Parameter "${parameter}" is missing`);
    }
    if (recognized.get(parameter) && protectedHeader[parameter] === void 0) {
      throw new Err(`Extension Header Parameter "${parameter}" MUST be integrity protected`);
    }
  }
  return new Set(protectedHeader.crit);
}
var init_validate_crit = __esm({
  "node_modules/jose/dist/webapi/lib/validate_crit.js"() {
    init_errors2();
  }
});

// node_modules/jose/dist/webapi/lib/check_key_type.js
function checkKeyType(alg, key, usage) {
  switch (alg.substring(0, 2)) {
    case "A1":
    case "A2":
    case "di":
    case "HS":
    case "PB":
      symmetricTypeCheck(alg, key, usage);
      break;
    default:
      asymmetricTypeCheck(alg, key, usage);
  }
}
var tag, jwkMatchesOp, symmetricTypeCheck, asymmetricTypeCheck;
var init_check_key_type = __esm({
  "node_modules/jose/dist/webapi/lib/check_key_type.js"() {
    init_invalid_key_input();
    init_is_key_like();
    init_type_checks();
    tag = (key) => key?.[Symbol.toStringTag];
    jwkMatchesOp = (alg, key, usage) => {
      if (key.use !== void 0) {
        let expected;
        switch (usage) {
          case "sign":
          case "verify":
            expected = "sig";
            break;
          case "encrypt":
          case "decrypt":
            expected = "enc";
            break;
        }
        if (key.use !== expected) {
          throw new TypeError(`Invalid key for this operation, its "use" must be "${expected}" when present`);
        }
      }
      if (key.alg !== void 0 && key.alg !== alg) {
        throw new TypeError(`Invalid key for this operation, its "alg" must be "${alg}" when present`);
      }
      if (Array.isArray(key.key_ops)) {
        let expectedKeyOp;
        switch (true) {
          case (usage === "sign" || usage === "verify"):
          case alg === "dir":
          case alg.includes("CBC-HS"):
            expectedKeyOp = usage;
            break;
          case alg.startsWith("PBES2"):
            expectedKeyOp = "deriveBits";
            break;
          case /^A\d{3}(?:GCM)?(?:KW)?$/.test(alg):
            if (!alg.includes("GCM") && alg.endsWith("KW")) {
              expectedKeyOp = usage === "encrypt" ? "wrapKey" : "unwrapKey";
            } else {
              expectedKeyOp = usage;
            }
            break;
          case (usage === "encrypt" && alg.startsWith("RSA")):
            expectedKeyOp = "wrapKey";
            break;
          case usage === "decrypt":
            expectedKeyOp = alg.startsWith("RSA") ? "unwrapKey" : "deriveBits";
            break;
        }
        if (expectedKeyOp && key.key_ops?.includes?.(expectedKeyOp) === false) {
          throw new TypeError(`Invalid key for this operation, its "key_ops" must include "${expectedKeyOp}" when present`);
        }
      }
      return true;
    };
    symmetricTypeCheck = (alg, key, usage) => {
      if (key instanceof Uint8Array)
        return;
      if (isJWK(key)) {
        if (isSecretJWK(key) && jwkMatchesOp(alg, key, usage))
          return;
        throw new TypeError(`JSON Web Key for symmetric algorithms must have JWK "kty" (Key Type) equal to "oct" and the JWK "k" (Key Value) present`);
      }
      if (!isKeyLike(key)) {
        throw new TypeError(withAlg(alg, key, "CryptoKey", "KeyObject", "JSON Web Key", "Uint8Array"));
      }
      if (key.type !== "secret") {
        throw new TypeError(`${tag(key)} instances for symmetric algorithms must be of type "secret"`);
      }
    };
    asymmetricTypeCheck = (alg, key, usage) => {
      if (isJWK(key)) {
        switch (usage) {
          case "decrypt":
          case "sign":
            if (isPrivateJWK(key) && jwkMatchesOp(alg, key, usage))
              return;
            throw new TypeError(`JSON Web Key for this operation must be a private JWK`);
          case "encrypt":
          case "verify":
            if (isPublicJWK(key) && jwkMatchesOp(alg, key, usage))
              return;
            throw new TypeError(`JSON Web Key for this operation must be a public JWK`);
        }
      }
      if (!isKeyLike(key)) {
        throw new TypeError(withAlg(alg, key, "CryptoKey", "KeyObject", "JSON Web Key"));
      }
      if (key.type === "secret") {
        throw new TypeError(`${tag(key)} instances for asymmetric algorithms must not be of type "secret"`);
      }
      if (key.type === "public") {
        switch (usage) {
          case "sign":
            throw new TypeError(`${tag(key)} instances for asymmetric algorithm signing must be of type "private"`);
          case "decrypt":
            throw new TypeError(`${tag(key)} instances for asymmetric algorithm decryption must be of type "private"`);
        }
      }
      if (key.type === "private") {
        switch (usage) {
          case "verify":
            throw new TypeError(`${tag(key)} instances for asymmetric algorithm verifying must be of type "public"`);
          case "encrypt":
            throw new TypeError(`${tag(key)} instances for asymmetric algorithm encryption must be of type "public"`);
        }
      }
    };
  }
});

// node_modules/jose/dist/webapi/lib/jwt_claims_set.js
function secs(str) {
  const matched = REGEX.exec(str);
  if (!matched || matched[4] && matched[1]) {
    throw new TypeError("Invalid time period format");
  }
  const value = parseFloat(matched[2]);
  const unit = matched[3].toLowerCase();
  let numericDate;
  switch (unit) {
    case "sec":
    case "secs":
    case "second":
    case "seconds":
    case "s":
      numericDate = Math.round(value);
      break;
    case "minute":
    case "minutes":
    case "min":
    case "mins":
    case "m":
      numericDate = Math.round(value * minute);
      break;
    case "hour":
    case "hours":
    case "hr":
    case "hrs":
    case "h":
      numericDate = Math.round(value * hour);
      break;
    case "day":
    case "days":
    case "d":
      numericDate = Math.round(value * day);
      break;
    case "week":
    case "weeks":
    case "w":
      numericDate = Math.round(value * week);
      break;
    default:
      numericDate = Math.round(value * year);
      break;
  }
  if (matched[1] === "-" || matched[4] === "ago") {
    return -numericDate;
  }
  return numericDate;
}
function validateInput(label, input) {
  if (!Number.isFinite(input)) {
    throw new TypeError(`Invalid ${label} input`);
  }
  return input;
}
var epoch, minute, hour, day, week, year, REGEX, JWTClaimsBuilder;
var init_jwt_claims_set = __esm({
  "node_modules/jose/dist/webapi/lib/jwt_claims_set.js"() {
    init_buffer_utils();
    init_type_checks();
    epoch = (date) => Math.floor(date.getTime() / 1e3);
    minute = 60;
    hour = minute * 60;
    day = hour * 24;
    week = day * 7;
    year = day * 365.25;
    REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
    JWTClaimsBuilder = class {
      #payload;
      constructor(payload) {
        if (!isObject(payload)) {
          throw new TypeError("JWT Claims Set MUST be an object");
        }
        this.#payload = structuredClone(payload);
      }
      data() {
        return encoder.encode(JSON.stringify(this.#payload));
      }
      get iss() {
        return this.#payload.iss;
      }
      set iss(value) {
        this.#payload.iss = value;
      }
      get sub() {
        return this.#payload.sub;
      }
      set sub(value) {
        this.#payload.sub = value;
      }
      get aud() {
        return this.#payload.aud;
      }
      set aud(value) {
        this.#payload.aud = value;
      }
      set jti(value) {
        this.#payload.jti = value;
      }
      set nbf(value) {
        if (typeof value === "number") {
          this.#payload.nbf = validateInput("setNotBefore", value);
        } else if (value instanceof Date) {
          this.#payload.nbf = validateInput("setNotBefore", epoch(value));
        } else {
          this.#payload.nbf = epoch(/* @__PURE__ */ new Date()) + secs(value);
        }
      }
      set exp(value) {
        if (typeof value === "number") {
          this.#payload.exp = validateInput("setExpirationTime", value);
        } else if (value instanceof Date) {
          this.#payload.exp = validateInput("setExpirationTime", epoch(value));
        } else {
          this.#payload.exp = epoch(/* @__PURE__ */ new Date()) + secs(value);
        }
      }
      set iat(value) {
        if (value === void 0) {
          this.#payload.iat = epoch(/* @__PURE__ */ new Date());
        } else if (value instanceof Date) {
          this.#payload.iat = validateInput("setIssuedAt", epoch(value));
        } else if (typeof value === "string") {
          this.#payload.iat = validateInput("setIssuedAt", epoch(/* @__PURE__ */ new Date()) + secs(value));
        } else {
          this.#payload.iat = validateInput("setIssuedAt", value);
        }
      }
    };
  }
});

// node_modules/jose/dist/webapi/jws/flattened/sign.js
var FlattenedSign;
var init_sign = __esm({
  "node_modules/jose/dist/webapi/jws/flattened/sign.js"() {
    init_base64url();
    init_signing();
    init_type_checks();
    init_errors2();
    init_buffer_utils();
    init_check_key_type();
    init_validate_crit();
    init_normalize_key();
    init_helpers();
    FlattenedSign = class {
      #payload;
      #protectedHeader;
      #unprotectedHeader;
      constructor(payload) {
        if (!(payload instanceof Uint8Array)) {
          throw new TypeError("payload must be an instance of Uint8Array");
        }
        this.#payload = payload;
      }
      setProtectedHeader(protectedHeader) {
        assertNotSet(this.#protectedHeader, "setProtectedHeader");
        this.#protectedHeader = protectedHeader;
        return this;
      }
      setUnprotectedHeader(unprotectedHeader) {
        assertNotSet(this.#unprotectedHeader, "setUnprotectedHeader");
        this.#unprotectedHeader = unprotectedHeader;
        return this;
      }
      async sign(key, options) {
        if (!this.#protectedHeader && !this.#unprotectedHeader) {
          throw new JWSInvalid("either setProtectedHeader or setUnprotectedHeader must be called before #sign()");
        }
        if (!isDisjoint(this.#protectedHeader, this.#unprotectedHeader)) {
          throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
        }
        const joseHeader = {
          ...this.#protectedHeader,
          ...this.#unprotectedHeader
        };
        const extensions = validateCrit(JWSInvalid, /* @__PURE__ */ new Map([["b64", true]]), options?.crit, this.#protectedHeader, joseHeader);
        let b64 = true;
        if (extensions.has("b64")) {
          b64 = this.#protectedHeader.b64;
          if (typeof b64 !== "boolean") {
            throw new JWSInvalid('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
          }
        }
        const { alg } = joseHeader;
        if (typeof alg !== "string" || !alg) {
          throw new JWSInvalid('JWS "alg" (Algorithm) Header Parameter missing or invalid');
        }
        checkKeyType(alg, key, "sign");
        let payloadS;
        let payloadB;
        if (b64) {
          payloadS = encode2(this.#payload);
          payloadB = encode(payloadS);
        } else {
          payloadB = this.#payload;
          payloadS = "";
        }
        let protectedHeaderString;
        let protectedHeaderBytes;
        if (this.#protectedHeader) {
          protectedHeaderString = encode2(JSON.stringify(this.#protectedHeader));
          protectedHeaderBytes = encode(protectedHeaderString);
        } else {
          protectedHeaderString = "";
          protectedHeaderBytes = new Uint8Array();
        }
        const data = concat(protectedHeaderBytes, encode("."), payloadB);
        const k = await normalizeKey(key, alg);
        const signature = await sign(alg, k, data);
        const jws = {
          signature: encode2(signature),
          payload: payloadS
        };
        if (this.#unprotectedHeader) {
          jws.header = this.#unprotectedHeader;
        }
        if (this.#protectedHeader) {
          jws.protected = protectedHeaderString;
        }
        return jws;
      }
    };
  }
});

// node_modules/jose/dist/webapi/jws/compact/sign.js
var CompactSign;
var init_sign2 = __esm({
  "node_modules/jose/dist/webapi/jws/compact/sign.js"() {
    init_sign();
    CompactSign = class {
      #flattened;
      constructor(payload) {
        this.#flattened = new FlattenedSign(payload);
      }
      setProtectedHeader(protectedHeader) {
        this.#flattened.setProtectedHeader(protectedHeader);
        return this;
      }
      async sign(key, options) {
        const jws = await this.#flattened.sign(key, options);
        if (jws.payload === void 0) {
          throw new TypeError("use the flattened module for creating JWS with b64: false");
        }
        return `${jws.protected}.${jws.payload}.${jws.signature}`;
      }
    };
  }
});

// node_modules/jose/dist/webapi/jwt/sign.js
var SignJWT;
var init_sign3 = __esm({
  "node_modules/jose/dist/webapi/jwt/sign.js"() {
    init_sign2();
    init_errors2();
    init_jwt_claims_set();
    SignJWT = class {
      #protectedHeader;
      #jwt;
      constructor(payload = {}) {
        this.#jwt = new JWTClaimsBuilder(payload);
      }
      setIssuer(issuer) {
        this.#jwt.iss = issuer;
        return this;
      }
      setSubject(subject) {
        this.#jwt.sub = subject;
        return this;
      }
      setAudience(audience) {
        this.#jwt.aud = audience;
        return this;
      }
      setJti(jwtId) {
        this.#jwt.jti = jwtId;
        return this;
      }
      setNotBefore(input) {
        this.#jwt.nbf = input;
        return this;
      }
      setExpirationTime(input) {
        this.#jwt.exp = input;
        return this;
      }
      setIssuedAt(input) {
        this.#jwt.iat = input;
        return this;
      }
      setProtectedHeader(protectedHeader) {
        this.#protectedHeader = protectedHeader;
        return this;
      }
      async sign(key, options) {
        const sig = new CompactSign(this.#jwt.data());
        sig.setProtectedHeader(this.#protectedHeader);
        if (Array.isArray(this.#protectedHeader?.crit) && this.#protectedHeader.crit.includes("b64") && this.#protectedHeader.b64 === false) {
          throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
        }
        return sig.sign(key, options);
      }
    };
  }
});

// node_modules/jose/dist/webapi/index.js
var init_webapi = __esm({
  "node_modules/jose/dist/webapi/index.js"() {
    init_sign3();
    init_import();
  }
});

// dist/auth/credentials.js
import { readFile } from "node:fs/promises";
async function loadAscCredentialsFromEnv(env = process.env) {
  const keyId = env[ASC_ENV_VARS.keyId]?.trim();
  if (keyId === void 0 || keyId === "") {
    throw new AscCredentialError(`${ASC_ENV_VARS.keyId} is not set; it must hold the App Store Connect API key ID`, "missing-key-id");
  }
  const privateKey = await importPrivateKey(await loadPrivateKeyPem(env));
  const issuerId = env[ASC_ENV_VARS.issuerId]?.trim();
  if (issuerId !== void 0 && issuerId !== "") {
    return { keyForm: "team", keyId, issuerId, privateKey };
  }
  return { keyForm: "individual", keyId, privateKey };
}
async function loadPrivateKeyPem(env) {
  const inline = env[ASC_ENV_VARS.privateKey]?.trim();
  const path = env[ASC_ENV_VARS.privateKeyPath]?.trim();
  const hasInline = inline !== void 0 && inline !== "";
  const hasPath = path !== void 0 && path !== "";
  if (hasInline && hasPath) {
    throw new AscCredentialError(`Both ${ASC_ENV_VARS.privateKey} and ${ASC_ENV_VARS.privateKeyPath} are set; configure exactly one private key source`, "conflicting-private-key-sources");
  }
  if (hasInline) {
    return inline;
  }
  if (!hasPath) {
    throw new AscCredentialError(`No private key configured; set ${ASC_ENV_VARS.privateKey} (inline PEM content) or ${ASC_ENV_VARS.privateKeyPath} (path to the .p8 file)`, "missing-private-key");
  }
  try {
    return await readFile(path, "utf8");
  } catch (cause) {
    throw new AscCredentialError(`Cannot read the private key file at "${path}" (from ${ASC_ENV_VARS.privateKeyPath})`, "unreadable-private-key-file", { cause });
  }
}
async function importPrivateKey(pem) {
  const normalized = pem.replaceAll("\\n", "\n").trim();
  try {
    return await importPKCS8(normalized, "ES256");
  } catch (cause) {
    throw new AscCredentialError("The configured private key is not a valid PKCS#8 EC P-256 (.p8) PEM", "invalid-private-key", { cause });
  }
}
var ASC_ENV_VARS;
var init_credentials = __esm({
  "dist/auth/credentials.js"() {
    "use strict";
    init_webapi();
    init_errors();
    ASC_ENV_VARS = {
      keyId: "ASC_KEY_ID",
      issuerId: "ASC_ISSUER_ID",
      privateKey: "ASC_PRIVATE_KEY",
      privateKeyPath: "ASC_PRIVATE_KEY_PATH"
    };
  }
});

// node_modules/openapi-fetch/dist/index.mjs
function randomID() {
  return Math.random().toString(36).slice(2, 11);
}
function createClient(clientOptions) {
  let {
    baseUrl = "",
    Request: CustomRequest = globalThis.Request,
    fetch: baseFetch = globalThis.fetch,
    querySerializer: globalQuerySerializer,
    bodySerializer: globalBodySerializer,
    pathSerializer: globalPathSerializer,
    headers: baseHeaders,
    requestInitExt = void 0,
    ...baseOptions
  } = { ...clientOptions };
  requestInitExt = supportsRequestInitExt() ? requestInitExt : void 0;
  baseUrl = removeTrailingSlash(baseUrl);
  const globalMiddlewares = [];
  async function coreFetch(schemaPath, fetchOptions) {
    const {
      baseUrl: localBaseUrl,
      fetch = baseFetch,
      Request: Request2 = CustomRequest,
      headers,
      params = {},
      parseAs = "json",
      querySerializer: requestQuerySerializer,
      bodySerializer = globalBodySerializer ?? defaultBodySerializer,
      pathSerializer: requestPathSerializer,
      body,
      middleware: requestMiddlewares = [],
      ...init
    } = fetchOptions || {};
    let finalBaseUrl = baseUrl;
    if (localBaseUrl) {
      finalBaseUrl = removeTrailingSlash(localBaseUrl) ?? baseUrl;
    }
    let querySerializer = typeof globalQuerySerializer === "function" ? globalQuerySerializer : createQuerySerializer(globalQuerySerializer);
    if (requestQuerySerializer) {
      querySerializer = typeof requestQuerySerializer === "function" ? requestQuerySerializer : createQuerySerializer({
        ...typeof globalQuerySerializer === "object" ? globalQuerySerializer : {},
        ...requestQuerySerializer
      });
    }
    const pathSerializer = requestPathSerializer || globalPathSerializer || defaultPathSerializer;
    const serializedBody = body === void 0 ? void 0 : bodySerializer(
      body,
      // Note: we declare mergeHeaders() both here and below because it’s a bit of a chicken-or-egg situation:
      // bodySerializer() needs all headers so we aren’t dropping ones set by the user, however,
      // the result of this ALSO sets the lowest-priority content-type header. So we re-merge below,
      // setting the content-type at the very beginning to be overwritten.
      // Lastly, based on the way headers work, it’s not a simple “present-or-not” check becauase null intentionally un-sets headers.
      mergeHeaders(baseHeaders, headers, params.header)
    );
    const finalHeaders = mergeHeaders(
      // with no body, we should not to set Content-Type
      serializedBody === void 0 || // if serialized body is FormData; browser will correctly set Content-Type & boundary expression
      serializedBody instanceof FormData ? {} : {
        "Content-Type": "application/json"
      },
      baseHeaders,
      headers,
      params.header
    );
    const finalMiddlewares = [...globalMiddlewares, ...requestMiddlewares];
    const requestInit = {
      redirect: "follow",
      ...baseOptions,
      ...init,
      body: serializedBody,
      headers: finalHeaders
    };
    let id;
    let options;
    let request = new Request2(
      createFinalURL(schemaPath, { baseUrl: finalBaseUrl, params, querySerializer, pathSerializer }),
      requestInit
    );
    let response;
    for (const key in init) {
      if (!(key in request)) {
        request[key] = init[key];
      }
    }
    if (finalMiddlewares.length) {
      id = randomID();
      options = Object.freeze({
        baseUrl: finalBaseUrl,
        fetch,
        parseAs,
        querySerializer,
        bodySerializer,
        pathSerializer
      });
      for (const m of finalMiddlewares) {
        if (m && typeof m === "object" && typeof m.onRequest === "function") {
          const result = await m.onRequest({
            request,
            schemaPath,
            params,
            options,
            id
          });
          if (result) {
            if (result instanceof Request2) {
              request = result;
            } else if (result instanceof Response) {
              response = result;
              break;
            } else {
              throw new Error("onRequest: must return new Request() or Response() when modifying the request");
            }
          }
        }
      }
    }
    if (!response) {
      try {
        response = await fetch(request, requestInitExt);
      } catch (error2) {
        let errorAfterMiddleware = error2;
        if (finalMiddlewares.length) {
          for (let i = finalMiddlewares.length - 1; i >= 0; i--) {
            const m = finalMiddlewares[i];
            if (m && typeof m === "object" && typeof m.onError === "function") {
              const result = await m.onError({
                request,
                error: errorAfterMiddleware,
                schemaPath,
                params,
                options,
                id
              });
              if (result) {
                if (result instanceof Response) {
                  errorAfterMiddleware = void 0;
                  response = result;
                  break;
                }
                if (result instanceof Error) {
                  errorAfterMiddleware = result;
                  continue;
                }
                throw new Error("onError: must return new Response() or instance of Error");
              }
            }
          }
        }
        if (errorAfterMiddleware) {
          throw errorAfterMiddleware;
        }
      }
      if (finalMiddlewares.length) {
        for (let i = finalMiddlewares.length - 1; i >= 0; i--) {
          const m = finalMiddlewares[i];
          if (m && typeof m === "object" && typeof m.onResponse === "function") {
            const result = await m.onResponse({
              request,
              response,
              schemaPath,
              params,
              options,
              id
            });
            if (result) {
              if (!(result instanceof Response)) {
                throw new Error("onResponse: must return new Response() when modifying the response");
              }
              response = result;
            }
          }
        }
      }
    }
    const contentLength = response.headers.get("Content-Length");
    if (response.status === 204 || request.method === "HEAD" || contentLength === "0" && !response.headers.get("Transfer-Encoding")?.includes("chunked")) {
      return response.ok ? { data: void 0, response } : { error: void 0, response };
    }
    if (response.ok) {
      const getResponseData = async () => {
        if (parseAs === "stream") {
          return response.body;
        }
        if (parseAs === "json" && !contentLength) {
          const raw = await response.text();
          return raw ? JSON.parse(raw) : void 0;
        }
        return await response[parseAs]();
      };
      return { data: await getResponseData(), response };
    }
    let error = await response.text();
    try {
      error = JSON.parse(error);
    } catch {
    }
    return { error, response };
  }
  return {
    request(method, url, init) {
      return coreFetch(url, { ...init, method: method.toUpperCase() });
    },
    /** Call a GET endpoint */
    GET(url, init) {
      return coreFetch(url, { ...init, method: "GET" });
    },
    /** Call a PUT endpoint */
    PUT(url, init) {
      return coreFetch(url, { ...init, method: "PUT" });
    },
    /** Call a POST endpoint */
    POST(url, init) {
      return coreFetch(url, { ...init, method: "POST" });
    },
    /** Call a DELETE endpoint */
    DELETE(url, init) {
      return coreFetch(url, { ...init, method: "DELETE" });
    },
    /** Call a OPTIONS endpoint */
    OPTIONS(url, init) {
      return coreFetch(url, { ...init, method: "OPTIONS" });
    },
    /** Call a HEAD endpoint */
    HEAD(url, init) {
      return coreFetch(url, { ...init, method: "HEAD" });
    },
    /** Call a PATCH endpoint */
    PATCH(url, init) {
      return coreFetch(url, { ...init, method: "PATCH" });
    },
    /** Call a TRACE endpoint */
    TRACE(url, init) {
      return coreFetch(url, { ...init, method: "TRACE" });
    },
    /** Register middleware */
    use(...middleware) {
      for (const m of middleware) {
        if (!m) {
          continue;
        }
        if (typeof m !== "object" || !("onRequest" in m || "onResponse" in m || "onError" in m)) {
          throw new Error("Middleware must be an object with one of `onRequest()`, `onResponse() or `onError()`");
        }
        globalMiddlewares.push(m);
      }
    },
    /** Unregister middleware */
    eject(...middleware) {
      for (const m of middleware) {
        const i = globalMiddlewares.indexOf(m);
        if (i !== -1) {
          globalMiddlewares.splice(i, 1);
        }
      }
    }
  };
}
function serializePrimitiveParam(name, value, options) {
  if (value === void 0 || value === null) {
    return "";
  }
  if (typeof value === "object") {
    throw new Error(
      "Deeply-nested arrays/objects aren\u2019t supported. Provide your own `querySerializer()` to handle these."
    );
  }
  return `${name}=${options?.allowReserved === true ? value : encodeURIComponent(value)}`;
}
function serializeObjectParam(name, value, options) {
  if (!value || typeof value !== "object") {
    return "";
  }
  const values = [];
  const joiner = {
    simple: ",",
    label: ".",
    matrix: ";"
  }[options.style] || "&";
  if (options.style !== "deepObject" && options.explode === false) {
    for (const k in value) {
      values.push(k, options.allowReserved === true ? value[k] : encodeURIComponent(value[k]));
    }
    const final2 = values.join(",");
    switch (options.style) {
      case "form": {
        return `${name}=${final2}`;
      }
      case "label": {
        return `.${final2}`;
      }
      case "matrix": {
        return `;${name}=${final2}`;
      }
      default: {
        return final2;
      }
    }
  }
  for (const k in value) {
    const finalName = options.style === "deepObject" ? `${name}[${k}]` : k;
    values.push(serializePrimitiveParam(finalName, value[k], options));
  }
  const final = values.join(joiner);
  return options.style === "label" || options.style === "matrix" ? `${joiner}${final}` : final;
}
function serializeArrayParam(name, value, options) {
  if (!Array.isArray(value)) {
    return "";
  }
  if (options.explode === false) {
    const joiner2 = { form: ",", spaceDelimited: "%20", pipeDelimited: "|" }[options.style] || ",";
    const final = (options.allowReserved === true ? value : value.map((v) => encodeURIComponent(v))).join(joiner2);
    switch (options.style) {
      case "simple": {
        return final;
      }
      case "label": {
        return `.${final}`;
      }
      case "matrix": {
        return `;${name}=${final}`;
      }
      // case "spaceDelimited":
      // case "pipeDelimited":
      default: {
        return `${name}=${final}`;
      }
    }
  }
  const joiner = { simple: ",", label: ".", matrix: ";" }[options.style] || "&";
  const values = [];
  for (const v of value) {
    if (options.style === "simple" || options.style === "label") {
      values.push(options.allowReserved === true ? v : encodeURIComponent(v));
    } else {
      values.push(serializePrimitiveParam(name, v, options));
    }
  }
  return options.style === "label" || options.style === "matrix" ? `${joiner}${values.join(joiner)}` : values.join(joiner);
}
function createQuerySerializer(options) {
  return function querySerializer(queryParams) {
    const search = [];
    if (queryParams && typeof queryParams === "object") {
      for (const name in queryParams) {
        const value = queryParams[name];
        if (value === void 0 || value === null) {
          continue;
        }
        if (Array.isArray(value)) {
          if (value.length === 0) {
            continue;
          }
          search.push(
            serializeArrayParam(name, value, {
              style: "form",
              explode: true,
              ...options?.array,
              allowReserved: options?.allowReserved || false
            })
          );
          continue;
        }
        if (typeof value === "object") {
          search.push(
            serializeObjectParam(name, value, {
              style: "deepObject",
              explode: true,
              ...options?.object,
              allowReserved: options?.allowReserved || false
            })
          );
          continue;
        }
        search.push(serializePrimitiveParam(name, value, options));
      }
    }
    return search.join("&");
  };
}
function defaultPathSerializer(pathname, pathParams) {
  let nextURL = pathname;
  for (const match of pathname.match(PATH_PARAM_RE) ?? []) {
    let name = match.substring(1, match.length - 1);
    let explode = false;
    let style = "simple";
    if (name.endsWith("*")) {
      explode = true;
      name = name.substring(0, name.length - 1);
    }
    if (name.startsWith(".")) {
      style = "label";
      name = name.substring(1);
    } else if (name.startsWith(";")) {
      style = "matrix";
      name = name.substring(1);
    }
    if (!pathParams || pathParams[name] === void 0 || pathParams[name] === null) {
      continue;
    }
    const value = pathParams[name];
    if (Array.isArray(value)) {
      nextURL = nextURL.replace(match, serializeArrayParam(name, value, { style, explode }));
      continue;
    }
    if (typeof value === "object") {
      nextURL = nextURL.replace(match, serializeObjectParam(name, value, { style, explode }));
      continue;
    }
    if (style === "matrix") {
      nextURL = nextURL.replace(match, `;${serializePrimitiveParam(name, value)}`);
      continue;
    }
    nextURL = nextURL.replace(match, style === "label" ? `.${encodeURIComponent(value)}` : encodeURIComponent(value));
  }
  return nextURL;
}
function defaultBodySerializer(body, headers) {
  if (body instanceof FormData) {
    return body;
  }
  if (headers) {
    const contentType = headers.get instanceof Function ? headers.get("Content-Type") ?? headers.get("content-type") : headers["Content-Type"] ?? headers["content-type"];
    if (contentType === "application/x-www-form-urlencoded") {
      return new URLSearchParams(body).toString();
    }
  }
  return JSON.stringify(body);
}
function createFinalURL(pathname, options) {
  let finalURL = `${options.baseUrl}${pathname}`;
  if (options.params?.path) {
    finalURL = options.pathSerializer(finalURL, options.params.path);
  }
  let search = options.querySerializer(options.params.query ?? {});
  if (search.startsWith("?")) {
    search = search.substring(1);
  }
  if (search) {
    finalURL += `?${search}`;
  }
  return finalURL;
}
function mergeHeaders(...allHeaders) {
  const finalHeaders = new Headers();
  for (const h of allHeaders) {
    if (!h || typeof h !== "object") {
      continue;
    }
    const iterator = h instanceof Headers ? h.entries() : Object.entries(h);
    for (const [k, v] of iterator) {
      if (v === null) {
        finalHeaders.delete(k);
      } else if (Array.isArray(v)) {
        for (const v2 of v) {
          finalHeaders.append(k, v2);
        }
      } else if (v !== void 0) {
        finalHeaders.set(k, v);
      }
    }
  }
  return finalHeaders;
}
function removeTrailingSlash(url) {
  if (url.endsWith("/")) {
    return url.substring(0, url.length - 1);
  }
  return url;
}
var PATH_PARAM_RE, supportsRequestInitExt;
var init_dist2 = __esm({
  "node_modules/openapi-fetch/dist/index.mjs"() {
    PATH_PARAM_RE = /\{[^{}]+\}/g;
    supportsRequestInitExt = () => {
      return typeof process === "object" && Number.parseInt(process?.versions?.node?.substring(0, 2)) >= 18 && process.versions.undici;
    };
  }
});

// dist/auth/token.js
var ASC_TOKEN_AUDIENCE, TOKEN_LIFETIME_SECONDS, IAT_BACKDATE_SECONDS, REFRESH_SAFETY_MARGIN_SECONDS, signAscToken, AscTokenProvider;
var init_token = __esm({
  "dist/auth/token.js"() {
    "use strict";
    init_webapi();
    ASC_TOKEN_AUDIENCE = "appstoreconnect-v1";
    TOKEN_LIFETIME_SECONDS = 15 * 60;
    IAT_BACKDATE_SECONDS = 10;
    REFRESH_SAFETY_MARGIN_SECONDS = 60;
    signAscToken = async (credentials, nowMs) => {
      const issuedAt = Math.floor(nowMs / 1e3) - IAT_BACKDATE_SECONDS;
      const expiresAt = issuedAt + TOKEN_LIFETIME_SECONDS;
      let jwt = new SignJWT(credentials.keyForm === "individual" ? { sub: "user" } : {}).setProtectedHeader({ alg: "ES256", kid: credentials.keyId, typ: "JWT" }).setIssuedAt(issuedAt).setExpirationTime(expiresAt).setAudience(ASC_TOKEN_AUDIENCE);
      if (credentials.keyForm === "team") {
        jwt = jwt.setIssuer(credentials.issuerId);
      }
      return {
        token: await jwt.sign(credentials.privateKey),
        expiresAtMs: expiresAt * 1e3
      };
    };
    AscTokenProvider = class {
      #credentials;
      #clock;
      #sign;
      #current = null;
      #inflight = null;
      #forced = null;
      constructor(credentials, options = {}) {
        this.#credentials = credentials;
        this.#clock = options.clock ?? Date.now;
        this.#sign = options.sign ?? signAscToken;
      }
      /** Returns a token with at least `REFRESH_SAFETY_MARGIN_SECONDS` remaining. */
      async getToken() {
        if (this.#current !== null && this.#hasSafeLifetime(this.#current)) {
          return this.#current.token;
        }
        const signed = await (this.#inflight ?? this.#startSigning());
        return signed.token;
      }
      /**
       * Forced re-sign after ASC rejected `staleToken` with a 401. If the current
       * token already differs, the rejection was raced by a refresh and the
       * current token is returned without signing — re-signing here would discard
       * a perfectly fresh token and invite a second spurious 401 round.
       */
      async invalidate(staleToken) {
        if (this.#current !== null && this.#current.token !== staleToken) {
          return this.#current.token;
        }
        if (this.#forced !== null && this.#forced.staleToken === staleToken) {
          return (await this.#forced.promise).token;
        }
        this.#current = null;
        const promise = this.#inflight ?? this.#startSigning();
        this.#forced = { staleToken, promise };
        try {
          return (await promise).token;
        } finally {
          if (this.#forced.promise === promise) {
            this.#forced = null;
          }
        }
      }
      #hasSafeLifetime(signed) {
        return signed.expiresAtMs - this.#clock() > REFRESH_SAFETY_MARGIN_SECONDS * 1e3;
      }
      #startSigning() {
        const promise = this.#sign(this.#credentials, this.#clock()).then((signed) => {
          this.#current = signed;
          return signed;
        }).finally(() => {
          if (this.#inflight === promise) {
            this.#inflight = null;
          }
        });
        this.#inflight = promise;
        return promise;
      }
    };
  }
});

// dist/http/rate-limit.js
function parseRateLimitHeader(headerValue) {
  if (headerValue === null || headerValue.trim() === "") {
    return void 0;
  }
  let hourlyLimit;
  let remaining;
  for (const segment of headerValue.split(";")) {
    const separator = segment.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const name = segment.slice(0, separator).trim();
    const value = Number.parseInt(segment.slice(separator + 1).trim(), 10);
    if (Number.isNaN(value)) {
      continue;
    }
    if (name === "user-hour-lim") {
      hourlyLimit = value;
    } else if (name === "user-hour-rem") {
      remaining = value;
    }
  }
  return Object.freeze({
    raw: headerValue,
    ...hourlyLimit !== void 0 && { hourlyLimit },
    ...remaining !== void 0 && { remaining }
  });
}
var init_rate_limit = __esm({
  "dist/http/rate-limit.js"() {
    "use strict";
  }
});

// dist/http/normalize.js
async function ascErrorFromResponse(response, context) {
  const apiErrors = await readApiErrors(response);
  const rateLimit = parseRateLimitHeader(response.headers.get("x-rate-limit"));
  const options = {
    apiErrors,
    ...rateLimit !== void 0 && { rateLimit },
    request: {
      method: context.request.method,
      url: context.request.url,
      status: response.status
    }
  };
  const summary = summarize(apiErrors, response);
  switch (response.status) {
    case 401:
      return new AscAuthenticationError(`${summary}. ${keyFormHint(context.keyForm)}`, options);
    case 403:
      return new AscPermissionError(`${summary}. The API key's role does not grant this operation; a broader ASC role may be required.${context.keyForm === "individual" ? " Individual keys cannot access provisioning or sales/finance report endpoints; a team key may be needed." : ""}`, options);
    case 404:
      return new AscNotFoundError(summary, options);
    case 400:
    case 409:
    case 422:
      return new AscInvalidParameterError(`${summary}${describeSources(apiErrors)}`, options);
    case 429:
      return new AscRateLimitError(`${summary}. ASC rate limit exhausted${rateLimit?.remaining !== void 0 ? ` (remaining: ${String(rateLimit.remaining)}${rateLimit.hourlyLimit !== void 0 ? ` of ${String(rateLimit.hourlyLimit)}/hour` : ""})` : ""}; the quota refills over a rolling hour.`, options);
    default:
      return new AscUpstreamError(summary, options);
  }
}
async function readApiErrors(response) {
  try {
    const body = await response.json();
    if (typeof body === "object" && body !== null && "errors" in body && Array.isArray(body.errors)) {
      return body.errors;
    }
  } catch {
  }
  return [];
}
function summarize(apiErrors, response) {
  const first = apiErrors[0];
  if (first === void 0) {
    return `ASC responded ${String(response.status)}${response.statusText === "" ? "" : ` ${response.statusText}`}`;
  }
  const more = apiErrors.length > 1 ? ` (+${String(apiErrors.length - 1)} more)` : "";
  return `${first.code}: ${first.title} \u2014 ${first.detail}${more}`;
}
function keyFormHint(keyForm) {
  return keyForm === "team" ? `Credentials were inferred as a team key because ${ASC_ENV_VARS.issuerId} is set; verify the Issuer ID, Key ID, and private key belong together, or unset ${ASC_ENV_VARS.issuerId} for an individual key.` : `Credentials were inferred as an individual key because ${ASC_ENV_VARS.issuerId} is not set; if this is a team key, set ${ASC_ENV_VARS.issuerId} to its Issuer ID.`;
}
function describeSources(apiErrors) {
  const sources = apiErrors.map((item) => item.source).filter((source) => source !== void 0).map((source) => "pointer" in source ? source.pointer : `parameter "${source.parameter}"`);
  return sources.length === 0 ? "" : ` [source: ${sources.join(", ")}]`;
}
var init_normalize = __esm({
  "dist/http/normalize.js"() {
    "use strict";
    init_credentials();
    init_errors();
    init_rate_limit();
  }
});

// dist/http/middleware.js
function createAscAuthMiddleware(options) {
  const { tokenProvider, keyForm, fetch: transportFetch } = options;
  return {
    async onRequest({ request }) {
      const token = await tokenProvider.getToken();
      request.headers.set("authorization", `${BEARER_PREFIX}${token}`);
      return request;
    },
    async onResponse({ request, response }) {
      if (response.ok) {
        return void 0;
      }
      if (response.status !== 401) {
        throw await ascErrorFromResponse(response, { request, keyForm });
      }
      const authorization = request.headers.get("authorization") ?? "";
      const staleToken = authorization.startsWith(BEARER_PREFIX) ? authorization.slice(BEARER_PREFIX.length) : "";
      const freshToken = await tokenProvider.invalidate(staleToken);
      let replay;
      try {
        replay = request.clone();
      } catch (cause) {
        throw new AscAuthenticationError("ASC rejected the token, and the request could not be cloned for a replay because its body was already consumed", {
          cause,
          request: { method: request.method, url: request.url, status: 401 }
        });
      }
      replay.headers.set("authorization", `${BEARER_PREFIX}${freshToken}`);
      const replayResponse = await transportFetch(replay);
      if (replayResponse.ok) {
        return replayResponse;
      }
      const normalized = await ascErrorFromResponse(replayResponse, {
        request,
        keyForm
      });
      if (replayResponse.status === 401) {
        throw new AscAuthenticationError(`Authentication failed again after one forced re-sign; not retrying further. ${normalized.message}`, {
          apiErrors: normalized.apiErrors,
          ...normalized.rateLimit !== void 0 && {
            rateLimit: normalized.rateLimit
          },
          ...normalized.request !== void 0 && {
            request: normalized.request
          }
        });
      }
      throw normalized;
    }
  };
}
var BEARER_PREFIX;
var init_middleware = __esm({
  "dist/http/middleware.js"() {
    "use strict";
    init_errors();
    init_normalize();
    BEARER_PREFIX = "Bearer ";
  }
});

// dist/http/transport.js
import { setTimeout as delay } from "node:timers/promises";
function isAbortError(error) {
  return error instanceof Error && error.name === "AbortError";
}
async function defaultSleep(ms, signal) {
  await delay(ms, void 0, signal === void 0 ? void 0 : { signal });
}
function createRetryingFetch(options = {}) {
  const baseFetch = options.fetch ?? ((request) => globalThis.fetch(request));
  const maxAttempts = options.retry?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.retry?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.retry?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const sleep = options.retry?.sleep ?? defaultSleep;
  const random = options.retry?.random ?? Math.random;
  const onRateLimit = options.onRateLimit;
  const backoffDelayMs = (attempt) => random() * Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  const notifyRateLimit = (request, response) => {
    if (onRateLimit === void 0) {
      return;
    }
    const snapshot = parseRateLimitHeader(response.headers.get("x-rate-limit"));
    if (snapshot === void 0) {
      return;
    }
    try {
      onRateLimit(snapshot, {
        method: request.method,
        url: request.url,
        status: response.status
      });
    } catch {
    }
  };
  return async (request) => {
    for (let attempt = 1; ; attempt += 1) {
      request.signal.throwIfAborted();
      let response;
      try {
        response = await baseFetch(request.clone());
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        if (attempt >= maxAttempts) {
          throw new AscNetworkError(`${request.method} ${request.url} failed at the network level after ${String(attempt)} attempt(s)`, attempt, {
            cause: error,
            request: { method: request.method, url: request.url }
          });
        }
        await sleep(backoffDelayMs(attempt), request.signal);
        continue;
      }
      notifyRateLimit(request, response);
      if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
        await sleep(backoffDelayMs(attempt), request.signal);
        continue;
      }
      return response;
    }
  };
}
var DEFAULT_MAX_ATTEMPTS, DEFAULT_BASE_DELAY_MS, DEFAULT_MAX_DELAY_MS;
var init_transport = __esm({
  "dist/http/transport.js"() {
    "use strict";
    init_errors();
    init_rate_limit();
    DEFAULT_MAX_ATTEMPTS = 4;
    DEFAULT_BASE_DELAY_MS = 250;
    DEFAULT_MAX_DELAY_MS = 4e3;
  }
});

// dist/http/client.js
function createAscClient(config) {
  const tokenProvider = config.tokenProvider ?? new AscTokenProvider(config.credentials);
  const transport = createRetryingFetch({
    ...config.retry !== void 0 && { retry: config.retry },
    ...config.onRateLimit !== void 0 && {
      onRateLimit: config.onRateLimit
    },
    ...config.fetch !== void 0 && { fetch: config.fetch }
  });
  const client = createClient({
    baseUrl: config.baseUrl ?? ASC_API_BASE_URL,
    fetch: transport,
    // ASC's JSON:API list params (fields, filter, ...) are comma-joined per
    // Apple's spec; openapi-fetch's exploded default would emit repeated
    // parameter names instead.
    querySerializer: { array: { style: "form", explode: false } }
  });
  client.use(createAscAuthMiddleware({
    tokenProvider,
    keyForm: config.credentials.keyForm,
    fetch: transport
  }));
  return client;
}
var ASC_API_BASE_URL;
var init_client = __esm({
  "dist/http/client.js"() {
    "use strict";
    init_dist2();
    init_token();
    init_middleware();
    init_transport();
    ASC_API_BASE_URL = "https://api.appstoreconnect.apple.com";
  }
});

// dist/cli/context.js
function createCliContext(io, env) {
  let credentialsPromise;
  let clientPromise;
  let lastSnapshot;
  const credentials = () => credentialsPromise ??= loadAscCredentialsFromEnv(env);
  return {
    io,
    env,
    credentials,
    client: () => {
      clientPromise ??= credentials().then((loaded) => createAscClient({
        credentials: loaded,
        onRateLimit: (snapshot) => {
          lastSnapshot = snapshot;
        }
      }));
      return clientPromise;
    },
    lastRateLimit: () => lastSnapshot
  };
}
function cliContextOf(data) {
  return data;
}
var init_context = __esm({
  "dist/cli/context.js"() {
    "use strict";
    init_credentials();
    init_client();
  }
});

// dist/cli/exit-codes.js
function mapAscErrorToExit(category) {
  switch (category) {
    case "credential":
      return EXIT.configuration;
    case "rate-limit":
      return EXIT.rateLimit;
    case "authentication":
    case "permission":
    case "not-found":
    case "invalid-parameter":
    case "upstream":
    case "network":
    case "file-processing":
      return EXIT.ascRequest;
  }
}
function isCittyUsageError(error) {
  return error instanceof Error && error.name === "CLIError" && typeof error.code === "string";
}
var EXIT, CliUsageError, NotImplementedError, UnsupportedByApiError;
var init_exit_codes = __esm({
  "dist/cli/exit-codes.js"() {
    "use strict";
    EXIT = {
      success: 0,
      unexpected: 1,
      configuration: 2,
      ascRequest: 3,
      rateLimit: 4,
      notImplemented: 5,
      unsupportedByApi: 6,
      usage: 64
    };
    CliUsageError = class extends Error {
      constructor(message2) {
        super(message2);
        this.name = "CliUsageError";
      }
    };
    NotImplementedError = class extends Error {
      milestone;
      constructor(domain, milestone) {
        super(`'${domain}' is not implemented in this project yet; it is planned for milestone ${milestone}.`);
        this.name = "NotImplementedError";
        this.milestone = milestone;
      }
    };
    UnsupportedByApiError = class extends Error {
      guidance;
      constructor(task, guidance) {
        super(`Apple's App Store Connect API does not support: ${task}.`);
        this.name = "UnsupportedByApiError";
        this.guidance = guidance;
      }
    };
  }
});

// dist/cli/output.js
function emitResult(io, envelope) {
  io.out(JSON.stringify(envelope, null, 2));
}
function listEnvelope(command, read, scope, resolved) {
  return {
    ok: true,
    command,
    data: read.items,
    pagination: {
      pagesRead: read.pagesRead,
      ...read.total !== void 0 && { total: read.total },
      truncated: read.truncated,
      scope
    },
    ...read.rateLimit !== void 0 && { rateLimit: read.rateLimit },
    ...resolved !== void 0 && { resolved }
  };
}
function documentEnvelope(command, document, options = {}) {
  return {
    ok: true,
    command,
    data: document.data,
    ...document.included !== void 0 && { included: document.included },
    ...options.rateLimit !== void 0 && { rateLimit: options.rateLimit },
    ...options.resolved !== void 0 && { resolved: options.resolved }
  };
}
function renderAscError(io, error) {
  io.err(`error[${error.category}]: ${error.message}`);
  if (error instanceof AscFileProcessingError) {
    io.err(`stage: ${error.stage}${error.target === void 0 ? "" : ` (${error.target})`}`);
  }
  io.err(`hint: ${hintFor(error)}`);
  if (error.apiErrors.length > 0) {
    io.err(`api-errors: ${error.apiErrors.map((item) => `${item.code} \u2014 ${item.title}`).join("; ")}`);
  }
  if (error.pagination !== void 0) {
    io.err(`progress: ${String(error.pagination.pagesRead)} page(s), ${String(error.pagination.itemsRead)} item(s) read before the failure`);
  }
  if (error.rateLimit !== void 0) {
    io.err(`rate-limit: ${String(error.rateLimit.remaining ?? "?")} of ${String(error.rateLimit.hourlyLimit ?? "?")} hourly requests remaining`);
  }
}
function hintFor(error) {
  if (error instanceof AscCredentialError) {
    return CREDENTIAL_HINTS[error.reason];
  }
  if (error instanceof AscFileProcessingError) {
    return FILE_PROCESSING_HINTS[error.stage];
  }
  switch (error.category) {
    case "credential":
      return CREDENTIAL_HINTS["missing-key-id"];
    case "authentication":
      return "Verify the key ID, issuer ID, and private key belong to the same App Store Connect API key, and that the key has not been revoked. If they are correct, check your computer's clock \u2014 a clock off by more than a few minutes makes Apple reject the signed token.";
    case "permission":
      return "The API key's role does not cover this operation. Ask the account holder to grant a broader role, or use a different key.";
    case "not-found":
      return "Check the resource id \u2014 ids come from the corresponding list command. The message above distinguishes a wrong id from a resource that simply does not exist yet (e.g. no data for that date, no response, or no report instances).";
    case "invalid-parameter":
      return "ASC rejected the request shape; the [source: ...] pointer in the message locates the offending input. For metadata writes, a STATE_ERROR usually means the target version or app info is not in an editable state.";
    case "rate-limit":
      return "The hourly request quota is exhausted or near the safety floor. Wait for the rolling window to refill, or narrow the read with --max-items.";
    case "upstream":
      return "ASC-side failure. Retry later; if it persists, check Apple's system status page.";
    case "network":
      return "No response from api.appstoreconnect.apple.com. Check connectivity, proxy, and firewall settings.";
    case "file-processing":
      return FILE_PROCESSING_HINTS.download;
  }
}
var CREDENTIAL_HINTS, FILE_PROCESSING_HINTS;
var init_output = __esm({
  "dist/cli/output.js"() {
    "use strict";
    init_errors();
    init_credentials();
    CREDENTIAL_HINTS = {
      "missing-key-id": `Set ${ASC_ENV_VARS.keyId} to the App Store Connect API key ID. Keys live in App Store Connect \u2192 Users and Access \u2192 Integrations.`,
      "missing-private-key": `Set ${ASC_ENV_VARS.privateKey} (inline PEM content) or ${ASC_ENV_VARS.privateKeyPath} (path to the .p8 file) \u2014 exactly one of the two.`,
      "conflicting-private-key-sources": `Unset one of ${ASC_ENV_VARS.privateKey} / ${ASC_ENV_VARS.privateKeyPath}; exactly one private key source must be configured.`,
      "unreadable-private-key-file": `Check that the path in ${ASC_ENV_VARS.privateKeyPath} exists and is readable from this shell.`,
      "invalid-private-key": `The private key must be the unmodified .p8 file content downloaded from App Store Connect (PKCS#8 EC P-256).`
    };
    FILE_PROCESSING_HINTS = {
      download: "The file transfer failed mid-stream. Re-run the command; analytics segment URLs are short-lived, so a fresh run fetches fresh URLs.",
      decompress: "The downloaded file is not valid gzip \u2014 likely corrupted in transit. Re-run the command; if it persists, the report for this date may be malformed on Apple's side.",
      parse: "The report landed on disk but could not be parsed for the summary or JSON conversion. The raw file is intact at the reported path; inspect it manually.",
      checksum: "The downloaded bytes do not match Apple's checksum. The corrupt file was kept with a .corrupt suffix for inspection; re-run to download again.",
      write: "Writing to disk failed. Check the --output path, directory permissions, and free space.",
      "transfer-read": "Could not read the local image/video file. Check the --file path exists, is readable, and did not change during the upload.",
      transfer: "Uploading the bytes to Apple's upload URL failed. Upload URLs are short-lived \u2014 re-run the command to reserve fresh upload operations. A dangling reserved asset can be removed with the matching delete command.",
      commit: "Apple rejected the upload commit, usually a checksum mismatch (the file changed during upload, or the wrong file was sent). Re-run the upload.",
      processing: "The bytes uploaded but Apple's asset processing reported FAILED \u2014 typically wrong dimensions, an unsupported format, or a bad video. The state errors above carry Apple's reason; fix the asset and re-run. The reserved asset can be removed with the matching delete command."
    };
  }
});

// dist/capabilities/internal.js
function expectDocument(data) {
  if (data === void 0) {
    throw new AscUpstreamError("ASC returned a success status without a response document.");
  }
  return data;
}
var init_internal = __esm({
  "dist/capabilities/internal.js"() {
    "use strict";
    init_errors();
  }
});

// dist/pagination/next-link.js
function nextPageQuery(nextLink) {
  let url;
  try {
    url = new URL(nextLink);
  } catch (cause) {
    throw new AscUpstreamError("ASC returned an unparseable links.next URL.", {
      cause
    });
  }
  if (url.search === "") {
    throw new AscUpstreamError("ASC returned a links.next URL without a query string; refusing to follow it.");
  }
  return url.search;
}
var init_next_link = __esm({
  "dist/pagination/next-link.js"() {
    "use strict";
    init_errors();
  }
});

// dist/pagination/paginate.js
function assertPagedDocument(payload, url) {
  const candidate = payload;
  if (typeof candidate === "object" && candidate !== null && Array.isArray(candidate.data) && typeof candidate.links === "object" && candidate.links !== null) {
    return payload;
  }
  throw new AscUpstreamError(`Expected a paged collection document from ${url}, but the response does not match the contract envelope.`);
}
function rethrowWithProgress(error, progress) {
  if (error instanceof AscError && error.pagination === void 0) {
    error.pagination = progress;
  }
  throw error;
}
async function* paginate(client, path, init, options = {}) {
  const floor = options.rateLimitFloor ?? DEFAULT_RATE_LIMIT_FLOOR;
  const get = client.GET;
  const progress = { pagesRead: 0, itemsRead: 0 };
  let queryOverride;
  for (; ; ) {
    let document;
    let response;
    try {
      const currentQuery = queryOverride;
      const result = await get(path, {
        ...init,
        ...currentQuery !== void 0 && {
          querySerializer: () => currentQuery
        }
      });
      response = result.response;
      document = assertPagedDocument(result.data, response.url);
    } catch (error) {
      rethrowWithProgress(error, { ...progress });
    }
    const rateLimit = parseRateLimitHeader(response.headers.get("x-rate-limit"));
    yield {
      document,
      ...rateLimit !== void 0 && { rateLimit }
    };
    progress.pagesRead += 1;
    progress.itemsRead += document.data.length;
    const next = document.links.next;
    if (next === void 0) {
      return;
    }
    if (floor > 0 && rateLimit?.remaining !== void 0 && rateLimit.remaining < floor) {
      throw new AscRateLimitFloorError(`Stopped a multi-page read after ${String(progress.pagesRead)} page(s) / ${String(progress.itemsRead)} item(s): ${String(rateLimit.remaining)} requests remain this hour, below the configured floor of ${String(floor)}. Retry once the quota window rolls over, or pass rateLimitFloor: 0 to disable the guard.`, floor, { rateLimit, pagination: { ...progress } });
    }
    let nextQuery;
    try {
      nextQuery = nextPageQuery(next);
    } catch (error) {
      rethrowWithProgress(error, { ...progress });
    }
    if (nextQuery === queryOverride) {
      rethrowWithProgress(new AscUpstreamError("ASC returned a links.next identical to the page just fetched; refusing to loop."), { ...progress });
    }
    queryOverride = nextQuery;
  }
}
async function readPaged(client, path, init, scope, options) {
  const maxItems = typeof scope === "object" ? scope.maxItems : void 0;
  if (maxItems !== void 0 && (!Number.isInteger(maxItems) || maxItems < 1)) {
    throw new RangeError(`maxItems must be a positive integer; got ${String(maxItems)}.`);
  }
  const items = [];
  let pagesRead = 0;
  let total;
  let rateLimit;
  let truncated = false;
  for await (const page of paginate(client, path, init, options)) {
    pagesRead += 1;
    if (page.rateLimit !== void 0) {
      rateLimit = page.rateLimit;
    }
    const document = page.document;
    total = document.meta?.paging?.total ?? total;
    const hasNext = document.links.next !== void 0;
    if (maxItems !== void 0) {
      const room = maxItems - items.length;
      if (document.data.length > room) {
        items.push(...document.data.slice(0, room));
        truncated = true;
        break;
      }
      items.push(...document.data);
      if (items.length === maxItems) {
        truncated = hasNext;
        break;
      }
    } else {
      items.push(...document.data);
    }
    if (scope === "single-page") {
      truncated = hasNext;
      break;
    }
  }
  return {
    items,
    pagesRead,
    truncated,
    ...total !== void 0 && { total },
    ...rateLimit !== void 0 && { rateLimit }
  };
}
var DEFAULT_RATE_LIMIT_FLOOR;
var init_paginate = __esm({
  "dist/pagination/paginate.js"() {
    "use strict";
    init_errors();
    init_rate_limit();
    init_next_link();
    DEFAULT_RATE_LIMIT_FLOOR = 100;
  }
});

// dist/capabilities/apps.js
function listApps(client, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.bundleId !== void 0 && {
      "filter[bundleId]": options.bundleId
    },
    ...options.name !== void 0 && { "filter[name]": options.name },
    ...options.sku !== void 0 && { "filter[sku]": options.sku },
    ...options.fields !== void 0 && { "fields[apps]": options.fields },
    ...options.sort !== void 0 && { sort: options.sort }
  };
  return readPaged(client, "/v1/apps", { params: { query } }, options.scope, options.pagination);
}
async function getApp(client, appId, options = {}) {
  const query = {
    ...options.fields !== void 0 && { "fields[apps]": options.fields }
  };
  const { data } = await client.GET("/v1/apps/{id}", {
    params: { path: { id: appId }, query }
  });
  return expectDocument(data);
}
var init_apps = __esm({
  "dist/capabilities/apps.js"() {
    "use strict";
    init_internal();
    init_paginate();
  }
});

// dist/cli/read-scope.js
function resolveReadScope(flags) {
  const maxItems = flags["max-items"];
  if (flags.all === true && maxItems !== void 0) {
    throw new CliUsageError("--all and --max-items are mutually exclusive; pick one read scope.");
  }
  if (flags.all === true) {
    return "all-pages";
  }
  if (maxItems !== void 0) {
    return { maxItems: parsePositiveInt(maxItems, "--max-items") };
  }
  return "single-page";
}
function resolvePageLimit(flags) {
  const raw = flags["page-limit"];
  return raw === void 0 ? void 0 : parsePositiveInt(raw, "--page-limit");
}
function parsePositiveInt(raw, flag) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new CliUsageError(`${flag} expects a positive integer, got "${raw}".`);
  }
  return value;
}
function csvList(raw) {
  if (raw === void 0) {
    return void 0;
  }
  const values = raw.split(",").map((value) => value.trim()).filter((value) => value !== "");
  return values.length === 0 ? void 0 : values;
}
var readScopeArgs;
var init_read_scope = __esm({
  "dist/cli/read-scope.js"() {
    "use strict";
    init_exit_codes();
    readScopeArgs = {
      all: {
        type: "boolean",
        description: "Read every page (stops early near the rate-limit safety floor)"
      },
      "max-items": {
        type: "string",
        valueHint: "N",
        description: "Read at most N items across pages"
      },
      "page-limit": {
        type: "string",
        valueHint: "N",
        description: "Page size sent to ASC (server cap 200)"
      }
    };
  }
});

// dist/cli/commands/apps.js
var listCommand, getCommand, appsCommand;
var init_apps2 = __esm({
  "dist/cli/commands/apps.js"() {
    "use strict";
    init_dist();
    init_apps();
    init_context();
    init_output();
    init_read_scope();
    listCommand = defineCommand({
      meta: {
        name: "list",
        description: "List the apps visible to the API key"
      },
      args: {
        "bundle-id": {
          type: "string",
          valueHint: "id1,id2",
          description: "Filter by bundle id (comma-separated)"
        },
        name: {
          type: "string",
          description: "Filter by app name (comma-separated)"
        },
        sku: { type: "string", description: "Filter by SKU (comma-separated)" },
        fields: {
          type: "string",
          valueHint: "name,bundleId",
          description: "Sparse field selection for apps (comma-separated)"
        },
        sort: {
          type: "string",
          valueHint: "name",
          description: "Sort expression, e.g. name or -name"
        },
        ...readScopeArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const bundleId = csvList(ctx.args["bundle-id"]);
        const name = csvList(ctx.args.name);
        const sku = csvList(ctx.args.sku);
        const fields = csvList(ctx.args.fields);
        const sort = csvList(ctx.args.sort);
        const read = await listApps(await cli.client(), {
          scope,
          ...pageLimit !== void 0 && { pageLimit },
          ...bundleId !== void 0 && { bundleId },
          ...name !== void 0 && { name },
          ...sku !== void 0 && { sku },
          ...fields !== void 0 && { fields },
          ...sort !== void 0 && { sort }
        });
        emitResult(cli.io, listEnvelope("apps list", read, scope));
      }
    });
    getCommand = defineCommand({
      meta: {
        name: "get",
        description: "Read one app by its ASC id"
      },
      args: {
        appId: {
          type: "positional",
          required: true,
          description: "The app's ASC id (from 'asc apps list')"
        },
        fields: {
          type: "string",
          valueHint: "name,bundleId",
          description: "Sparse field selection for the app (comma-separated)"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const fields = csvList(ctx.args.fields);
        const document = await getApp(await cli.client(), ctx.args.appId, {
          ...fields !== void 0 && { fields }
        });
        const rateLimit = cli.lastRateLimit();
        emitResult(cli.io, documentEnvelope("apps get", document, {
          ...rateLimit !== void 0 && { rateLimit }
        }));
      }
    });
    appsCommand = defineCommand({
      meta: {
        name: "apps",
        description: "List apps and read app details"
      },
      subCommands: {
        list: listCommand,
        get: getCommand
      }
    });
  }
});

// dist/cli/commands/auth.js
var checkCommand, authCommand;
var init_auth = __esm({
  "dist/cli/commands/auth.js"() {
    "use strict";
    init_dist();
    init_apps();
    init_context();
    init_output();
    checkCommand = defineCommand({
      meta: {
        name: "check",
        description: "Verify credentials against the live ASC API with one harmless read (the online counterpart to doctor)"
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const credentials = await cli.credentials();
        const read = await listApps(await cli.client(), {
          scope: "single-page",
          pageLimit: 1
        });
        emitResult(cli.io, {
          ok: true,
          command: "auth check",
          data: {
            authenticated: true,
            keyForm: credentials.keyForm,
            // Only the last four characters — never the full Key ID.
            keyId: `...${credentials.keyId.slice(-4)}`,
            // ASC's own estimate when the page reports it; otherwise fall back to
            // what this page already proves the key can see.
            appsVisible: read.total ?? read.items.length
          },
          ...read.rateLimit !== void 0 && { rateLimit: read.rateLimit }
        });
      }
    });
    authCommand = defineCommand({
      meta: {
        name: "auth",
        description: "Verify credentials against the live ASC API: check"
      },
      subCommands: {
        check: checkCommand
      }
    });
  }
});

// dist/capabilities/builds.js
function buildBuildsQuery(options) {
  return {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.app !== void 0 && { "filter[app]": options.app },
    ...options.preReleaseVersion !== void 0 && {
      "filter[preReleaseVersion]": options.preReleaseVersion
    },
    ...options.platform !== void 0 && {
      "filter[preReleaseVersion.platform]": options.platform
    },
    ...options.processingState !== void 0 && {
      "filter[processingState]": options.processingState
    },
    ...options.version !== void 0 && {
      "filter[version]": options.version
    },
    ...options.expired !== void 0 && {
      "filter[expired]": options.expired
    },
    ...options.audienceType !== void 0 && {
      "filter[buildAudienceType]": options.audienceType
    },
    ...options.betaGroups !== void 0 && {
      "filter[betaGroups]": options.betaGroups
    },
    ...options.sort !== void 0 && { sort: options.sort },
    ...options.fields !== void 0 && { "fields[builds]": options.fields }
  };
}
function listBuilds(client, options) {
  return readPaged(client, "/v1/builds", { params: { query: buildBuildsQuery(options) } }, options.scope, options.pagination);
}
async function getBuild(client, buildId, options = {}) {
  const query = {
    ...options.fields !== void 0 && { "fields[builds]": options.fields },
    ...options.include !== void 0 && { include: options.include }
  };
  const { data } = await client.GET("/v1/builds/{id}", {
    params: { path: { id: buildId }, query }
  });
  return expectDocument(data);
}
async function findLatestProcessedBuild(client, options) {
  const read = await listBuilds(client, {
    scope: { maxItems: 1 },
    app: [options.appId],
    // live-verify (实机核实 #8): VALID is the correct "latest processed" filter.
    processingState: ["VALID"],
    sort: ["-uploadedDate"],
    ...options.platform !== void 0 && { platform: [options.platform] },
    ...options.audienceType !== void 0 && {
      audienceType: [options.audienceType]
    }
  });
  const match = read.items[0];
  if (match === void 0) {
    const platformNote = options.platform !== void 0 ? ` for platform ${options.platform}` : "";
    const audienceNote = options.audienceType !== void 0 ? ` in audience ${options.audienceType}` : "";
    throw new AscNotFoundError(`App ${options.appId} has no processed (VALID) build${platformNote}${audienceNote}.`);
  }
  return match;
}
async function expireBuild(client, buildId) {
  const { data } = await client.PATCH("/v1/builds/{id}", {
    params: { path: { id: buildId } },
    body: {
      data: { type: "builds", id: buildId, attributes: { expired: true } }
    }
  });
  return expectDocument(data);
}
async function getBuildBetaDetail(client, buildId) {
  const { data } = await client.GET("/v1/builds/{id}/buildBetaDetail", {
    params: { path: { id: buildId } }
  });
  return expectDocument(data);
}
async function updateBuildBetaDetail(client, buildBetaDetailId, attributes) {
  const { data } = await client.PATCH("/v1/buildBetaDetails/{id}", {
    params: { path: { id: buildBetaDetailId } },
    body: {
      data: { type: "buildBetaDetails", id: buildBetaDetailId, attributes }
    }
  });
  return expectDocument(data);
}
async function assignBuildToBetaGroups(client, buildId, groupIds) {
  await client.POST("/v1/builds/{id}/relationships/betaGroups", {
    params: { path: { id: buildId } },
    body: { data: groupIds.map((id) => ({ type: "betaGroups", id })) }
  });
}
async function removeBuildFromBetaGroups(client, buildId, groupIds) {
  await client.DELETE("/v1/builds/{id}/relationships/betaGroups", {
    params: { path: { id: buildId } },
    body: { data: groupIds.map((id) => ({ type: "betaGroups", id })) }
  });
}
function listBuildIndividualTesters(client, buildId, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.fields !== void 0 && {
      "fields[betaTesters]": options.fields
    }
  };
  return readPaged(client, "/v1/builds/{id}/individualTesters", { params: { path: { id: buildId }, query } }, options.scope, options.pagination);
}
async function addIndividualTesters(client, buildId, testerIds) {
  await client.POST("/v1/builds/{id}/relationships/individualTesters", {
    params: { path: { id: buildId } },
    body: {
      data: testerIds.map((id) => ({ type: "betaTesters", id }))
    }
  });
}
async function removeIndividualTesters(client, buildId, testerIds) {
  await client.DELETE("/v1/builds/{id}/relationships/individualTesters", {
    params: { path: { id: buildId } },
    body: {
      data: testerIds.map((id) => ({ type: "betaTesters", id }))
    }
  });
}
function listPreReleaseVersions(client, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.app !== void 0 && { "filter[app]": options.app },
    ...options.platform !== void 0 && {
      "filter[platform]": options.platform
    },
    ...options.version !== void 0 && {
      "filter[version]": options.version
    },
    ...options.sort !== void 0 && { sort: options.sort },
    ...options.fields !== void 0 && {
      "fields[preReleaseVersions]": options.fields
    }
  };
  return readPaged(client, "/v1/preReleaseVersions", { params: { query } }, options.scope, options.pagination);
}
async function getPreReleaseVersion(client, versionId) {
  const { data } = await client.GET("/v1/preReleaseVersions/{id}", {
    params: { path: { id: versionId } }
  });
  return expectDocument(data);
}
function listPreReleaseVersionBuilds(client, versionId, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.fields !== void 0 && { "fields[builds]": options.fields }
  };
  return readPaged(client, "/v1/preReleaseVersions/{id}/builds", { params: { path: { id: versionId }, query } }, options.scope, options.pagination);
}
var init_builds = __esm({
  "dist/capabilities/builds.js"() {
    "use strict";
    init_errors();
    init_internal();
    init_paginate();
  }
});

// dist/capabilities/beta-review.js
async function getBetaAppReviewDetail(client, options) {
  const query = {
    "filter[app]": [options.appId],
    ...options.fields !== void 0 && {
      "fields[betaAppReviewDetails]": options.fields
    }
  };
  const read = await readPaged(client, "/v1/betaAppReviewDetails", { params: { query } }, "single-page");
  const match = read.items[0];
  if (match === void 0) {
    throw new AscNotFoundError(`App ${options.appId} has no beta app review detail yet.`);
  }
  return match;
}
async function updateBetaAppReviewDetail(client, detailId, attributes) {
  const { data } = await client.PATCH("/v1/betaAppReviewDetails/{id}", {
    params: { path: { id: detailId } },
    body: {
      data: { type: "betaAppReviewDetails", id: detailId, attributes }
    }
  });
  return expectDocument(data);
}
function listBetaAppReviewSubmissions(client, options) {
  const query = {
    "filter[build]": [options.buildId],
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.betaReviewState !== void 0 && {
      "filter[betaReviewState]": options.betaReviewState
    },
    ...options.fields !== void 0 && {
      "fields[betaAppReviewSubmissions]": options.fields
    }
  };
  return readPaged(client, "/v1/betaAppReviewSubmissions", { params: { query } }, options.scope, options.pagination);
}
async function getBetaAppReviewSubmission(client, submissionId) {
  const { data } = await client.GET("/v1/betaAppReviewSubmissions/{id}", {
    params: { path: { id: submissionId } }
  });
  return expectDocument(data);
}
async function getBuildBetaAppReviewSubmission(client, buildId) {
  const { data } = await client.GET("/v1/builds/{id}/betaAppReviewSubmission", {
    params: { path: { id: buildId } }
  });
  return expectDocument(data);
}
async function submitBuildForBetaReview(client, buildId) {
  const { data } = await client.POST("/v1/betaAppReviewSubmissions", {
    body: {
      data: {
        type: "betaAppReviewSubmissions",
        relationships: {
          build: { data: { type: "builds", id: buildId } }
        }
      }
    }
  });
  return expectDocument(data);
}
var init_beta_review = __esm({
  "dist/capabilities/beta-review.js"() {
    "use strict";
    init_errors();
    init_internal();
    init_paginate();
  }
});

// dist/capabilities/beta-groups.js
function listBetaGroups(client, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.app !== void 0 && { "filter[app]": options.app },
    ...options.name !== void 0 && { "filter[name]": options.name },
    ...options.isInternalGroup !== void 0 && {
      "filter[isInternalGroup]": options.isInternalGroup
    },
    ...options.sort !== void 0 && { sort: options.sort },
    ...options.fields !== void 0 && {
      "fields[betaGroups]": options.fields
    }
  };
  return readPaged(client, "/v1/betaGroups", { params: { query } }, options.scope, options.pagination);
}
async function getBetaGroup(client, groupId, options = {}) {
  const query = {
    ...options.fields !== void 0 && {
      "fields[betaGroups]": options.fields
    },
    ...options.include !== void 0 && { include: options.include }
  };
  const { data } = await client.GET("/v1/betaGroups/{id}", {
    params: { path: { id: groupId }, query }
  });
  return expectDocument(data);
}
async function createBetaGroup(client, appId, attributes) {
  const { data } = await client.POST("/v1/betaGroups", {
    body: {
      data: {
        type: "betaGroups",
        attributes,
        relationships: {
          app: { data: { type: "apps", id: appId } }
        }
      }
    }
  });
  return expectDocument(data);
}
async function updateBetaGroup(client, groupId, attributes) {
  const { data } = await client.PATCH("/v1/betaGroups/{id}", {
    params: { path: { id: groupId } },
    body: { data: { type: "betaGroups", id: groupId, attributes } }
  });
  return expectDocument(data);
}
async function deleteBetaGroup(client, groupId) {
  await client.DELETE("/v1/betaGroups/{id}", {
    params: { path: { id: groupId } }
  });
}
function listGroupTesters(client, groupId, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.fields !== void 0 && {
      "fields[betaTesters]": options.fields
    }
  };
  return readPaged(client, "/v1/betaGroups/{id}/betaTesters", { params: { path: { id: groupId }, query } }, options.scope, options.pagination);
}
async function addTestersToGroup(client, groupId, testerIds) {
  await client.POST("/v1/betaGroups/{id}/relationships/betaTesters", {
    params: { path: { id: groupId } },
    body: {
      data: testerIds.map((id) => ({ type: "betaTesters", id }))
    }
  });
}
async function removeTestersFromGroup(client, groupId, testerIds) {
  await client.DELETE("/v1/betaGroups/{id}/relationships/betaTesters", {
    params: { path: { id: groupId } },
    body: {
      data: testerIds.map((id) => ({ type: "betaTesters", id }))
    }
  });
}
function listGroupBuilds(client, groupId, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.fields !== void 0 && { "fields[builds]": options.fields }
  };
  return readPaged(client, "/v1/betaGroups/{id}/builds", { params: { path: { id: groupId }, query } }, options.scope, options.pagination);
}
async function setPublicLink(client, groupId, options) {
  const attributes = {
    publicLinkEnabled: options.enabled,
    ...options.limitEnabled !== void 0 && {
      publicLinkLimitEnabled: options.limitEnabled
    },
    ...options.limit !== void 0 && { publicLinkLimit: options.limit }
  };
  return updateBetaGroup(client, groupId, attributes);
}
async function readRecruitmentCriteria(client, groupId, options = {}) {
  const query = {
    ...options.fields !== void 0 && {
      "fields[betaRecruitmentCriteria]": options.fields
    }
  };
  const { data } = await client.GET("/v1/betaGroups/{id}/betaRecruitmentCriteria", { params: { path: { id: groupId }, query } });
  return expectDocument(data);
}
async function setRecruitmentCriteria(client, groupId, filters, existingCriterionId) {
  if (existingCriterionId !== void 0) {
    const { data: data2 } = await client.PATCH("/v1/betaRecruitmentCriteria/{id}", {
      params: { path: { id: existingCriterionId } },
      body: {
        data: {
          type: "betaRecruitmentCriteria",
          id: existingCriterionId,
          attributes: { deviceFamilyOsVersionFilters: [...filters] }
        }
      }
    });
    return expectDocument(data2);
  }
  const { data } = await client.POST("/v1/betaRecruitmentCriteria", {
    body: {
      data: {
        type: "betaRecruitmentCriteria",
        attributes: { deviceFamilyOsVersionFilters: [...filters] },
        relationships: {
          betaGroup: { data: { type: "betaGroups", id: groupId } }
        }
      }
    }
  });
  return expectDocument(data);
}
async function clearRecruitmentCriteria(client, criterionId) {
  await client.DELETE("/v1/betaRecruitmentCriteria/{id}", {
    params: { path: { id: criterionId } }
  });
}
function listRecruitmentCriterionOptions(client, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit }
  };
  return readPaged(client, "/v1/betaRecruitmentCriterionOptions", { params: { query } }, options.scope, options.pagination);
}
async function checkRecruitmentCompatibleBuild(client, groupId) {
  const { data } = await client.GET("/v1/betaGroups/{id}/betaRecruitmentCriterionCompatibleBuildCheck", { params: { path: { id: groupId } } });
  return expectDocument(data);
}
var init_beta_groups = __esm({
  "dist/capabilities/beta-groups.js"() {
    "use strict";
    init_internal();
    init_paginate();
  }
});

// dist/capabilities/beta-localizations.js
function listBetaBuildLocalizations(client, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.build !== void 0 && { "filter[build]": options.build },
    ...options.locale !== void 0 && { "filter[locale]": options.locale },
    ...options.fields !== void 0 && {
      "fields[betaBuildLocalizations]": options.fields
    }
  };
  return readPaged(client, "/v1/betaBuildLocalizations", { params: { query } }, options.scope, options.pagination);
}
async function createBetaBuildLocalization(client, buildId, attributes) {
  const { data } = await client.POST("/v1/betaBuildLocalizations", {
    body: {
      data: {
        type: "betaBuildLocalizations",
        attributes,
        relationships: {
          build: { data: { type: "builds", id: buildId } }
        }
      }
    }
  });
  return expectDocument(data);
}
async function updateBetaBuildLocalization(client, localizationId, attributes) {
  const { data } = await client.PATCH("/v1/betaBuildLocalizations/{id}", {
    params: { path: { id: localizationId } },
    body: {
      data: {
        type: "betaBuildLocalizations",
        id: localizationId,
        attributes
      }
    }
  });
  return expectDocument(data);
}
async function deleteBetaBuildLocalization(client, localizationId) {
  await client.DELETE("/v1/betaBuildLocalizations/{id}", {
    params: { path: { id: localizationId } }
  });
}
function listBetaAppLocalizations(client, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.app !== void 0 && { "filter[app]": options.app },
    ...options.locale !== void 0 && { "filter[locale]": options.locale },
    ...options.fields !== void 0 && {
      "fields[betaAppLocalizations]": options.fields
    }
  };
  return readPaged(client, "/v1/betaAppLocalizations", { params: { query } }, options.scope, options.pagination);
}
async function createBetaAppLocalization(client, appId, attributes) {
  const { data } = await client.POST("/v1/betaAppLocalizations", {
    body: {
      data: {
        type: "betaAppLocalizations",
        attributes,
        relationships: {
          app: { data: { type: "apps", id: appId } }
        }
      }
    }
  });
  return expectDocument(data);
}
async function updateBetaAppLocalization(client, localizationId, attributes) {
  const { data } = await client.PATCH("/v1/betaAppLocalizations/{id}", {
    params: { path: { id: localizationId } },
    body: {
      data: { type: "betaAppLocalizations", id: localizationId, attributes }
    }
  });
  return expectDocument(data);
}
async function deleteBetaAppLocalization(client, localizationId) {
  await client.DELETE("/v1/betaAppLocalizations/{id}", {
    params: { path: { id: localizationId } }
  });
}
var init_beta_localizations = __esm({
  "dist/capabilities/beta-localizations.js"() {
    "use strict";
    init_internal();
    init_paginate();
  }
});

// dist/capabilities/beta-testers.js
function listBetaTesters(client, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.apps !== void 0 && { "filter[apps]": options.apps },
    ...options.betaGroups !== void 0 && {
      "filter[betaGroups]": options.betaGroups
    },
    ...options.builds !== void 0 && { "filter[builds]": options.builds },
    ...options.email !== void 0 && { "filter[email]": options.email },
    ...options.inviteType !== void 0 && {
      "filter[inviteType]": options.inviteType
    },
    ...options.sort !== void 0 && { sort: options.sort },
    ...options.fields !== void 0 && {
      "fields[betaTesters]": options.fields
    }
  };
  return readPaged(client, "/v1/betaTesters", { params: { query } }, options.scope, options.pagination);
}
async function getBetaTester(client, testerId, options = {}) {
  const query = {
    ...options.fields !== void 0 && {
      "fields[betaTesters]": options.fields
    },
    ...options.include !== void 0 && { include: options.include }
  };
  const { data } = await client.GET("/v1/betaTesters/{id}", {
    params: { path: { id: testerId }, query }
  });
  return expectDocument(data);
}
async function createBetaTester(client, attributes, options = {}) {
  const relationships = {};
  if (options.betaGroupIds !== void 0) {
    relationships.betaGroups = {
      data: options.betaGroupIds.map((id) => ({
        type: "betaGroups",
        id
      }))
    };
  }
  if (options.buildIds !== void 0) {
    relationships.builds = {
      data: options.buildIds.map((id) => ({ type: "builds", id }))
    };
  }
  const { data } = await client.POST("/v1/betaTesters", {
    body: {
      data: {
        type: "betaTesters",
        attributes,
        ...Object.keys(relationships).length > 0 && { relationships }
      }
    }
  });
  return expectDocument(data);
}
async function deleteBetaTester(client, testerId) {
  await client.DELETE("/v1/betaTesters/{id}", {
    params: { path: { id: testerId } }
  });
}
async function removeTesterFromApp(client, testerId, appIds) {
  await client.DELETE("/v1/betaTesters/{id}/relationships/apps", {
    params: { path: { id: testerId } },
    body: { data: appIds.map((id) => ({ type: "apps", id })) }
  });
}
var init_beta_testers = __esm({
  "dist/capabilities/beta-testers.js"() {
    "use strict";
    init_internal();
    init_paginate();
  }
});

// dist/workflows/beta-distribution.js
async function ensureBetaGroup(client, appId, name, createAttributes = {}) {
  const existing = await listBetaGroups(client, {
    scope: "all-pages",
    app: [appId],
    name: [name]
  });
  const match = existing.items.find((group) => group.attributes?.name === name);
  if (match !== void 0) {
    return { group: match, created: false };
  }
  const created = await createBetaGroup(client, appId, {
    ...createAttributes,
    name
  });
  return { group: created.data, created: true };
}
function chunk(items, size) {
  const out = [];
  for (let at = 0; at < items.length; at += size) {
    out.push(items.slice(at, at + size));
  }
  return out;
}
async function bulkAddTestersToGroup(client, groupId, emails, options = {}) {
  const batchSize = options.batchSize ?? DEFAULT_LINKAGE_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new AscInvalidParameterError(`batchSize must be a positive integer; got ${String(batchSize)}.`);
  }
  const testerIds = [];
  const createdEmails = [];
  const seen = /* @__PURE__ */ new Set();
  for (const email of emails) {
    if (seen.has(email)) {
      continue;
    }
    seen.add(email);
    const existing = await listBetaTesters(client, {
      scope: "all-pages",
      email: [email]
    });
    const match = existing.items.find((tester) => tester.attributes?.email === email);
    if (match !== void 0) {
      testerIds.push(match.id);
      continue;
    }
    const attributes = {
      email,
      ...options.attributesForEmail?.(email) ?? {}
    };
    const created = await createBetaTester(client, attributes);
    testerIds.push(created.data.id);
    createdEmails.push(email);
  }
  const batches = chunk(testerIds, batchSize);
  for (const batch of batches) {
    await addTestersToGroup(client, groupId, batch);
  }
  return {
    testerIds,
    createdEmails,
    linkageBatches: batches.length
  };
}
async function upsertBetaBuildLocalization(client, buildId, locale, whatsNew) {
  const existing = await listBetaBuildLocalizations(client, {
    scope: "all-pages",
    build: [buildId],
    locale: [locale]
  });
  const match = existing.items.find((item) => item.attributes?.locale === locale);
  if (match !== void 0) {
    const attributes = { whatsNew };
    const updated = await updateBetaBuildLocalization(client, match.id, attributes);
    return { localization: updated.data, created: false };
  }
  const created = await createBetaBuildLocalization(client, buildId, {
    locale,
    whatsNew
  });
  return { localization: created.data, created: true };
}
async function upsertBetaAppLocalization(client, appId, locale, attributes) {
  const existing = await listBetaAppLocalizations(client, {
    scope: "all-pages",
    app: [appId],
    locale: [locale]
  });
  const match = existing.items.find((item) => item.attributes?.locale === locale);
  if (match !== void 0) {
    const updated = await updateBetaAppLocalization(client, match.id, attributes);
    return { localization: updated.data, created: false };
  }
  const created = await createBetaAppLocalization(client, appId, {
    ...attributes,
    locale
  });
  return { localization: created.data, created: true };
}
async function findBetaAppReviewDetail(client, appId) {
  return getBetaAppReviewDetail(client, { appId });
}
async function setBetaAppReviewDetail(client, appId, attributes) {
  const detail = await findBetaAppReviewDetail(client, appId);
  const updated = await updateBetaAppReviewDetail(client, detail.id, attributes);
  return updated.data;
}
async function findRecruitmentCriterionId(client, groupId) {
  const response = await readRecruitmentCriteria(client, groupId);
  const resource = response.data;
  return resource?.id;
}
var DEFAULT_LINKAGE_BATCH_SIZE;
var init_beta_distribution = __esm({
  "dist/workflows/beta-distribution.js"() {
    "use strict";
    init_beta_groups();
    init_beta_testers();
    init_beta_localizations();
    init_beta_review();
    init_errors();
    init_builds();
    DEFAULT_LINKAGE_BATCH_SIZE = 50;
  }
});

// dist/cli/testflight-flags.js
function parseRecruitmentFilter(raw) {
  const segments = raw.split(":");
  if (segments.length > 3) {
    throw new CliUsageError(`--filter "${raw}" has too many parts; the format is deviceFamily:minOs:maxOs (OS bounds optional).`);
  }
  const familyRaw = (segments[0] ?? "").trim();
  if (familyRaw === "") {
    throw new CliUsageError(`--filter "${raw}" is missing the device family; the format is deviceFamily:minOs:maxOs.`);
  }
  if (!DEVICE_FAMILIES.includes(familyRaw)) {
    throw new CliUsageError(`--filter device family "${familyRaw}" is not known. Apple's API is authoritative; the values this build knows are: ${DEVICE_FAMILIES.join(", ")}. Run 'asc testflight groups criteria options' for the legal matrix.`);
  }
  const min = (segments[1] ?? "").trim();
  const max = (segments[2] ?? "").trim();
  return {
    deviceFamily: familyRaw,
    ...min !== "" && { minimumOsInclusive: min },
    ...max !== "" && { maximumOsInclusive: max }
  };
}
function parseRecruitmentFilters(raw) {
  if (raw === void 0) {
    throw new CliUsageError("criteria set requires at least one --filter deviceFamily:minOs:maxOs.");
  }
  const values = Array.isArray(raw) ? raw : [raw];
  const filters = values.flatMap((value) => csvList(value) ?? []).map((value) => parseRecruitmentFilter(value));
  if (filters.length === 0) {
    throw new CliUsageError("criteria set requires at least one --filter deviceFamily:minOs:maxOs.");
  }
  return filters;
}
function rejectCreateOnlyGroupFlags(args) {
  const offenders = CREATE_ONLY_GROUP_FLAGS.filter((flag) => args[flag] !== void 0 && args[flag] !== false);
  if (offenders.length > 0) {
    throw new CliUsageError(`--${offenders.join(", --")} can only be set when creating a group (a group's internal/external nature and all-builds access are fixed at creation); they cannot be changed on update.`);
  }
}
function parseAutoNotify(raw) {
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  throw new CliUsageError(`--auto-notify expects true or false, got "${raw ?? "(missing)"}".`);
}
var DEVICE_FAMILIES, CREATE_ONLY_GROUP_FLAGS;
var init_testflight_flags = __esm({
  "dist/cli/testflight-flags.js"() {
    "use strict";
    init_exit_codes();
    init_read_scope();
    DEVICE_FAMILIES = [
      "IPHONE",
      "IPAD",
      "APPLE_TV",
      "APPLE_WATCH",
      "MAC",
      "VISION"
    ];
    CREATE_ONLY_GROUP_FLAGS = ["internal", "all-builds"];
  }
});

// dist/cli/commands/testflight-shared.js
function requireIdList(raw, flag) {
  const ids = csvList(raw);
  if (ids === void 0 || ids.length === 0) {
    throw new CliUsageError(`${flag} expects a comma-separated list of ids (got nothing).`);
  }
  const seen = /* @__PURE__ */ new Set();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new CliUsageError(`${flag} lists "${id}" more than once.`);
    }
    seen.add(id);
  }
  return ids;
}
function requireForce(force, action) {
  if (force !== true) {
    throw new CliUsageError(`${action} requires --force (this action is destructive or irreversible).`);
  }
}
var forceArg;
var init_testflight_shared = __esm({
  "dist/cli/commands/testflight-shared.js"() {
    "use strict";
    init_exit_codes();
    init_read_scope();
    forceArg = {
      force: {
        type: "boolean",
        description: "Required to confirm this destructive or irreversible action"
      }
    };
  }
});

// dist/cli/commands/builds.js
var listCommand2, getCommand2, latestCommand, expireCommand, betaDetailGetCommand, betaDetailSetCommand, betaDetailCommand, notesListCommand, notesSetCommand, notesDeleteCommand, notesCommand, reviewStatusCommand, reviewSubmitCommand, reviewCommand, groupsAddCommand, groupsRemoveCommand, groupsCommand, testersListCommand, testersAddCommand, testersRemoveCommand, testersCommand, preReleaseVersionsListCommand, preReleaseVersionsCommand, buildsCommand;
var init_builds2 = __esm({
  "dist/cli/commands/builds.js"() {
    "use strict";
    init_dist();
    init_builds();
    init_beta_review();
    init_beta_groups();
    init_beta_localizations();
    init_beta_distribution();
    init_context();
    init_exit_codes();
    init_output();
    init_read_scope();
    init_testflight_flags();
    init_testflight_shared();
    listCommand2 = defineCommand({
      meta: {
        name: "list",
        description: "List builds, filterable by app, version, platform, processing state, expiry, or audience"
      },
      args: {
        app: {
          type: "string",
          valueHint: "appId",
          description: "Scope to one app"
        },
        "pre-release-version": {
          type: "string",
          valueHint: "id",
          description: "Scope to one pre-release (train) version id"
        },
        platform: {
          type: "string",
          valueHint: "IOS",
          description: "Filter by platform (via the related preReleaseVersion)"
        },
        "processing-state": {
          type: "string",
          valueHint: "VALID",
          description: "PROCESSING, FAILED, INVALID, or VALID"
        },
        version: {
          type: "string",
          valueHint: "1234",
          description: "Filter by build (upload) version string"
        },
        expired: {
          type: "boolean",
          description: "Only expired builds (--no-expired for unexpired)"
        },
        audience: {
          type: "string",
          valueHint: "APP_STORE_ELIGIBLE",
          description: "Filter by build audience type"
        },
        sort: {
          type: "string",
          valueHint: "-uploadedDate",
          description: "Sort key, e.g. uploadedDate, -uploadedDate, version"
        },
        ...readScopeArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const options = {
          scope,
          ...pageLimit !== void 0 && { pageLimit },
          ...ctx.args.app !== void 0 && { app: [ctx.args.app] },
          ...ctx.args["pre-release-version"] !== void 0 && {
            preReleaseVersion: [ctx.args["pre-release-version"]]
          },
          ...ctx.args.platform !== void 0 && {
            platform: [ctx.args.platform]
          },
          ...ctx.args["processing-state"] !== void 0 && {
            processingState: [
              ctx.args["processing-state"]
            ]
          },
          ...ctx.args.version !== void 0 && { version: [ctx.args.version] },
          ...ctx.args.expired !== void 0 && {
            expired: [String(ctx.args.expired)]
          },
          ...ctx.args.audience !== void 0 && {
            audienceType: [ctx.args.audience]
          },
          ...csvList(ctx.args.sort) !== void 0 && {
            sort: csvList(ctx.args.sort)
          }
        };
        const read = await listBuilds(await cli.client(), options);
        emitResult(cli.io, listEnvelope("builds list", read, scope));
      }
    });
    getCommand2 = defineCommand({
      meta: {
        name: "get",
        description: "Read one build by ASC id, with optional related includes"
      },
      args: {
        buildId: {
          type: "positional",
          required: true,
          description: "The build's ASC id (from 'list')"
        },
        include: {
          type: "string",
          valueHint: "preReleaseVersion,betaGroups",
          description: "Related resources to include (comma-separated)"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const options = {
          ...csvList(ctx.args.include) !== void 0 && {
            include: csvList(ctx.args.include)
          }
        };
        const document = await getBuild(await cli.client(), ctx.args.buildId, options);
        emitResult(cli.io, documentEnvelope("builds get", document));
      }
    });
    latestCommand = defineCommand({
      meta: {
        name: "latest",
        description: "Resolve the newest processed (VALID) build for an app (optionally by platform/audience)"
      },
      args: {
        app: {
          type: "string",
          required: true,
          valueHint: "appId",
          description: "The app's ASC id"
        },
        platform: {
          type: "string",
          valueHint: "IOS",
          description: "Restrict to one platform"
        },
        audience: {
          type: "string",
          valueHint: "APP_STORE_ELIGIBLE",
          description: "Restrict to one build audience type"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const options = {
          appId: ctx.args.app,
          ...ctx.args.platform !== void 0 && {
            platform: ctx.args.platform
          },
          ...ctx.args.audience !== void 0 && {
            audienceType: ctx.args.audience
          }
        };
        const build = await findLatestProcessedBuild(await cli.client(), options);
        emitResult(cli.io, documentEnvelope("builds latest", { data: build }, { resolved: { appId: ctx.args.app, buildId: build.id } }));
      }
    });
    expireCommand = defineCommand({
      meta: {
        name: "expire",
        description: "Expire a build. IRREVERSIBLE: Apple's API has no un-expire and the build leaves testing. Requires --force"
      },
      args: {
        buildId: {
          type: "positional",
          required: true,
          description: "The build's ASC id"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        requireForce(ctx.args.force, "Expiring a build (irreversible \u2014 there is no un-expire)");
        const document = await expireBuild(await cli.client(), ctx.args.buildId);
        emitResult(cli.io, documentEnvelope("builds expire", document, {
          resolved: { buildId: ctx.args.buildId, expired: true }
        }));
      }
    });
    betaDetailGetCommand = defineCommand({
      meta: {
        name: "get",
        description: "Read a build's buildBetaDetail (internal/external build state + autoNotify)"
      },
      args: {
        buildId: {
          type: "positional",
          required: true,
          description: "The build's ASC id"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const document = await getBuildBetaDetail(await cli.client(), ctx.args.buildId);
        emitResult(cli.io, documentEnvelope("builds beta-detail get", document, {
          resolved: { buildId: ctx.args.buildId, detailId: document.data.id }
        }));
      }
    });
    betaDetailSetCommand = defineCommand({
      meta: {
        name: "set",
        description: "Set a build's autoNotifyEnabled (the only writable buildBetaDetail field)"
      },
      args: {
        buildId: {
          type: "positional",
          required: true,
          description: "The build's ASC id"
        },
        "auto-notify": {
          type: "string",
          required: true,
          valueHint: "true",
          description: "true or false: whether testers are auto-notified on approval"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const autoNotify = parseAutoNotify(ctx.args["auto-notify"]);
        const client = await cli.client();
        const detail = await getBuildBetaDetail(client, ctx.args.buildId);
        const document = await updateBuildBetaDetail(client, detail.data.id, {
          autoNotifyEnabled: autoNotify
        });
        emitResult(cli.io, documentEnvelope("builds beta-detail set", document, {
          resolved: { buildId: ctx.args.buildId, detailId: detail.data.id }
        }));
      }
    });
    betaDetailCommand = defineCommand({
      meta: {
        name: "beta-detail",
        description: "Build beta detail: get the states, set autoNotifyEnabled"
      },
      subCommands: {
        get: betaDetailGetCommand,
        set: betaDetailSetCommand
      }
    });
    notesListCommand = defineCommand({
      meta: {
        name: "list",
        description: "List a build's 'what to test' notes (per locale)"
      },
      args: {
        buildId: {
          type: "positional",
          required: true,
          description: "The build's ASC id"
        },
        locale: {
          type: "string",
          valueHint: "en-US",
          description: "Filter to one locale"
        },
        ...readScopeArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const read = await listBetaBuildLocalizations(await cli.client(), {
          scope,
          ...pageLimit !== void 0 && { pageLimit },
          build: [ctx.args.buildId],
          ...ctx.args.locale !== void 0 && { locale: [ctx.args.locale] }
        });
        emitResult(cli.io, listEnvelope("builds notes list", read, scope, {
          buildId: ctx.args.buildId
        }));
      }
    });
    notesSetCommand = defineCommand({
      meta: {
        name: "set",
        description: "Set a build's 'what to test' note for a locale (upserts: creates the locale or patches it)"
      },
      args: {
        buildId: {
          type: "positional",
          required: true,
          description: "The build's ASC id"
        },
        locale: {
          type: "string",
          required: true,
          valueHint: "en-US",
          description: "The locale (BCP-47)"
        },
        "whats-new": {
          type: "string",
          required: true,
          valueHint: "text",
          description: "The 'what to test' text"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const result = await upsertBetaBuildLocalization(await cli.client(), ctx.args.buildId, ctx.args.locale, ctx.args["whats-new"]);
        emitResult(cli.io, documentEnvelope("builds notes set", { data: result.localization }, {
          resolved: {
            buildId: ctx.args.buildId,
            locale: ctx.args.locale,
            created: result.created
          }
        }));
      }
    });
    notesDeleteCommand = defineCommand({
      meta: {
        name: "delete",
        description: "Delete a build's 'what to test' note localization (destructive: --force)"
      },
      args: {
        localizationId: {
          type: "positional",
          required: true,
          description: "The betaBuildLocalization id (from 'list')"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        requireForce(ctx.args.force, "Deleting a build note localization");
        await deleteBetaBuildLocalization(await cli.client(), ctx.args.localizationId);
        emitResult(cli.io, {
          ok: true,
          command: "builds notes delete",
          data: { id: ctx.args.localizationId, deleted: true }
        });
      }
    });
    notesCommand = defineCommand({
      meta: {
        name: "notes",
        description: "Build 'what to test' notes (betaBuildLocalization): list/set/delete"
      },
      subCommands: {
        list: notesListCommand,
        set: notesSetCommand,
        delete: notesDeleteCommand
      }
    });
    reviewStatusCommand = defineCommand({
      meta: {
        name: "status",
        description: "Read a build's current beta app review submission status"
      },
      args: {
        buildId: {
          type: "positional",
          required: true,
          description: "The build's ASC id"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const document = await getBuildBetaAppReviewSubmission(await cli.client(), ctx.args.buildId);
        emitResult(cli.io, documentEnvelope("builds review status", document, {
          resolved: { buildId: ctx.args.buildId }
        }));
      }
    });
    reviewSubmitCommand = defineCommand({
      meta: {
        name: "submit",
        description: "Submit a build for TestFlight external beta review. HIGH SIDE EFFECT: triggers a REAL Apple beta review; the submission cannot be patched or deleted. Requires --force"
      },
      args: {
        buildId: {
          type: "positional",
          required: true,
          description: "The build's ASC id"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        requireForce(ctx.args.force, "Submitting a build for beta review (it triggers a real Apple review and cannot be undone)");
        const document = await submitBuildForBetaReview(await cli.client(), ctx.args.buildId);
        emitResult(cli.io, documentEnvelope("builds review submit", document, {
          resolved: { buildId: ctx.args.buildId, submitted: true }
        }));
      }
    });
    reviewCommand = defineCommand({
      meta: {
        name: "review",
        description: "Beta app review: read status, submit (high side effect)"
      },
      subCommands: {
        status: reviewStatusCommand,
        submit: reviewSubmitCommand
      }
    });
    groupsAddCommand = defineCommand({
      meta: {
        name: "add",
        description: "Distribute a build to beta groups. SIDE EFFECT: adding an external group makes the build visible to external testers (may require prior beta review). Requires --force"
      },
      args: {
        buildId: {
          type: "positional",
          required: true,
          description: "The build's ASC id"
        },
        group: {
          type: "string",
          required: true,
          valueHint: "id,id",
          description: "Beta group id(s) to distribute to"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        requireForce(ctx.args.force, "Distributing a build to beta groups (external groups expose it to testers)");
        const groupIds = requireIdList(ctx.args.group, "--group");
        const client = await cli.client();
        const allBuildsGroups = [];
        for (const groupId of groupIds) {
          const group = await getBetaGroup(client, groupId, {
            fields: ["hasAccessToAllBuilds"]
          });
          if (group.data.attributes?.hasAccessToAllBuilds === true) {
            allBuildsGroups.push(groupId);
          }
        }
        if (allBuildsGroups.length > 0) {
          throw new CliUsageError(`Group(s) ${allBuildsGroups.join(", ")} have hasAccessToAllBuilds=true: they already see every build, so an explicit build linkage is redundant and Apple rejects it. Drop these group id(s) from --group.`);
        }
        await assignBuildToBetaGroups(client, ctx.args.buildId, groupIds);
        emitResult(cli.io, {
          ok: true,
          command: "builds groups add",
          data: {
            buildId: ctx.args.buildId,
            added: groupIds,
            count: groupIds.length
          }
        });
      }
    });
    groupsRemoveCommand = defineCommand({
      meta: {
        name: "remove",
        description: "Stop distributing a build to beta groups (destructive: --force)"
      },
      args: {
        buildId: {
          type: "positional",
          required: true,
          description: "The build's ASC id"
        },
        group: {
          type: "string",
          required: true,
          valueHint: "id,id",
          description: "Beta group id(s) to remove"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        requireForce(ctx.args.force, "Removing a build from beta groups");
        const groupIds = requireIdList(ctx.args.group, "--group");
        await removeBuildFromBetaGroups(await cli.client(), ctx.args.buildId, groupIds);
        emitResult(cli.io, {
          ok: true,
          command: "builds groups remove",
          data: {
            buildId: ctx.args.buildId,
            removed: groupIds,
            count: groupIds.length
          }
        });
      }
    });
    groupsCommand = defineCommand({
      meta: {
        name: "groups",
        description: "Build distribution to beta groups: add (side effect), remove"
      },
      subCommands: {
        add: groupsAddCommand,
        remove: groupsRemoveCommand
      }
    });
    testersListCommand = defineCommand({
      meta: {
        name: "list",
        description: "List a build's individual (per-build) testers"
      },
      args: {
        buildId: {
          type: "positional",
          required: true,
          description: "The build's ASC id"
        },
        ...readScopeArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const read = await listBuildIndividualTesters(await cli.client(), ctx.args.buildId, { scope, ...pageLimit !== void 0 && { pageLimit } });
        emitResult(cli.io, listEnvelope("builds testers list", read, scope, {
          buildId: ctx.args.buildId
        }));
      }
    });
    testersAddCommand = defineCommand({
      meta: {
        name: "add",
        description: "Add individual testers to a build. SIDE EFFECT: may notify the testers. Requires --force"
      },
      args: {
        buildId: {
          type: "positional",
          required: true,
          description: "The build's ASC id"
        },
        tester: {
          type: "string",
          required: true,
          valueHint: "id,id",
          description: "Tester id(s) to add"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        requireForce(ctx.args.force, "Adding individual testers to a build (it may notify them)");
        const testerIds = requireIdList(ctx.args.tester, "--tester");
        await addIndividualTesters(await cli.client(), ctx.args.buildId, testerIds);
        emitResult(cli.io, {
          ok: true,
          command: "builds testers add",
          data: {
            buildId: ctx.args.buildId,
            added: testerIds,
            count: testerIds.length
          }
        });
      }
    });
    testersRemoveCommand = defineCommand({
      meta: {
        name: "remove",
        description: "Remove individual testers from a build (destructive: --force)"
      },
      args: {
        buildId: {
          type: "positional",
          required: true,
          description: "The build's ASC id"
        },
        tester: {
          type: "string",
          required: true,
          valueHint: "id,id",
          description: "Tester id(s) to remove"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        requireForce(ctx.args.force, "Removing individual testers from a build");
        const testerIds = requireIdList(ctx.args.tester, "--tester");
        await removeIndividualTesters(await cli.client(), ctx.args.buildId, testerIds);
        emitResult(cli.io, {
          ok: true,
          command: "builds testers remove",
          data: {
            buildId: ctx.args.buildId,
            removed: testerIds,
            count: testerIds.length
          }
        });
      }
    });
    testersCommand = defineCommand({
      meta: {
        name: "testers",
        description: "Build individual testers: list/add (side effect)/remove"
      },
      subCommands: {
        list: testersListCommand,
        add: testersAddCommand,
        remove: testersRemoveCommand
      }
    });
    preReleaseVersionsListCommand = defineCommand({
      meta: {
        name: "list",
        description: "List pre-release (train) versions, filterable by app/platform/version"
      },
      args: {
        app: {
          type: "string",
          valueHint: "appId",
          description: "Scope to one app"
        },
        platform: {
          type: "string",
          valueHint: "IOS",
          description: "Filter by platform"
        },
        version: {
          type: "string",
          valueHint: "1.2.0",
          description: "Filter by version string"
        },
        ...readScopeArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const options = {
          scope,
          ...pageLimit !== void 0 && { pageLimit },
          ...ctx.args.app !== void 0 && { app: [ctx.args.app] },
          ...ctx.args.platform !== void 0 && {
            platform: [
              ctx.args.platform
            ]
          },
          ...ctx.args.version !== void 0 && { version: [ctx.args.version] }
        };
        const read = await listPreReleaseVersions(await cli.client(), options);
        emitResult(cli.io, listEnvelope("builds pre-release-versions list", read, scope));
      }
    });
    preReleaseVersionsCommand = defineCommand({
      meta: {
        name: "pre-release-versions",
        description: "Pre-release (train) versions: list"
      },
      subCommands: {
        list: preReleaseVersionsListCommand
      }
    });
    buildsCommand = defineCommand({
      meta: {
        name: "builds",
        description: "Builds: list/get/latest/expire, beta detail, notes, beta review, group distribution, individual testers, pre-release versions"
      },
      subCommands: {
        list: listCommand2,
        get: getCommand2,
        latest: latestCommand,
        expire: expireCommand,
        "beta-detail": betaDetailCommand,
        notes: notesCommand,
        review: reviewCommand,
        groups: groupsCommand,
        testers: testersCommand,
        "pre-release-versions": preReleaseVersionsCommand
      }
    });
  }
});

// dist/cli/registry.js
var DOMAINS, API_UNSUPPORTED;
var init_registry = __esm({
  "dist/cli/registry.js"() {
    "use strict";
    DOMAINS = [
      {
        name: "apps",
        summary: "List apps and read app details",
        status: { implemented: true }
      },
      {
        name: "versions",
        summary: "List an app's App Store versions",
        status: { implemented: true }
      },
      {
        name: "metadata",
        summary: "Read and update store metadata and localizations, app level and version level",
        status: { implemented: true }
      },
      {
        name: "reviews",
        summary: "Read customer reviews; post or replace developer responses",
        status: { implemented: true }
      },
      {
        name: "doctor",
        summary: "Offline environment and credentials self-check",
        status: { implemented: true }
      },
      {
        name: "auth",
        summary: "Verify credentials against the live ASC API with one harmless read",
        status: { implemented: true }
      },
      {
        name: "capabilities",
        summary: "Machine-readable map of implemented/planned/unsupported tasks",
        status: { implemented: true }
      },
      {
        name: "reports",
        summary: "Sales, finance, and analytics report workflows",
        status: { implemented: true }
      },
      {
        name: "media",
        summary: "Screenshot and preview upload workflows",
        status: { implemented: true }
      },
      {
        name: "testflight",
        summary: "TestFlight beta groups, testers, test info, beta review detail, and feedback",
        status: { implemented: true }
      },
      {
        name: "builds",
        summary: "Builds: list/get/latest/expire, beta detail, notes, beta review, group distribution, individual testers, pre-release versions",
        status: { implemented: true }
      },
      {
        name: "submission",
        summary: "Submission and release: preflight readiness, status, review detail, release config, export compliance, submit/cancel/release",
        status: { implemented: true }
      }
    ];
    API_UNSUPPORTED = [
      {
        task: "Editing or deleting customer reviews or star ratings",
        guidance: "Review content belongs to the reviewer; the only API-side action is a developer response (asc reviews respond)."
      },
      {
        task: "App Review communication threads (Resolution Center messages)",
        guidance: "Handle in App Store Connect on the web: My Apps \u2192 your app \u2192 App Review."
      },
      {
        task: "Agreements, tax, banking, and payout configuration",
        guidance: "Handle in App Store Connect on the web: Business / Agreements section."
      },
      {
        task: "Creating or downloading App Store Connect API keys",
        guidance: "Handle in App Store Connect on the web: Users and Access \u2192 Integrations."
      },
      {
        task: "Creating or reading legacy appStoreVersionSubmissions (per-version submit)",
        guidance: "Apple removed this model (no create request remains). Use the modern review submissions instead: asc submission preflight / status / submit."
      },
      {
        task: "Editing a review submission's items after it has been submitted",
        guidance: "A submitted review submission is immutable except to cancel it. Cancel and re-assemble: asc submission cancel <id> --force, then submit again (re-review starts from scratch)."
      },
      {
        task: "Un-canceling or reviving a canceled review submission",
        guidance: "Cancellation is one-way; the version flips to Developer Rejected. Open a fresh submission and submit again: asc submission submit --version <id> --app <id> --force."
      }
    ];
  }
});

// dist/cli/commands/capabilities.js
var capabilitiesCommand;
var init_capabilities = __esm({
  "dist/cli/commands/capabilities.js"() {
    "use strict";
    init_dist();
    init_context();
    init_output();
    init_registry();
    capabilitiesCommand = defineCommand({
      meta: {
        name: "capabilities",
        description: "Print the authoritative map of implemented, planned, and API-unsupported tasks"
      },
      run(ctx) {
        const cli = cliContextOf(ctx.data);
        emitResult(cli.io, {
          ok: true,
          command: "capabilities",
          data: {
            implemented: DOMAINS.filter((entry) => entry.status.implemented).map((entry) => ({ name: entry.name, summary: entry.summary })),
            planned: DOMAINS.filter((entry) => !entry.status.implemented).map((entry) => ({
              name: entry.name,
              summary: entry.summary,
              milestone: entry.status.implemented ? void 0 : entry.status.milestone
            })),
            unsupportedByAppleApi: API_UNSUPPORTED
          }
        });
      }
    });
  }
});

// dist/auth/credential-format.js
function inspectCredentialFormat(env) {
  const warnings = [];
  const keyId = env[KEY_ID]?.trim();
  const issuerId = env[ISSUER_ID]?.trim();
  const keyLooksLikeIssuer = keyId !== void 0 && keyId !== "" && UUID_SHAPE.test(keyId);
  const issuerLooksLikeKey = issuerId !== void 0 && issuerId !== "" && KEY_ID_SHAPE.test(issuerId);
  if (keyLooksLikeIssuer && issuerLooksLikeKey) {
    warnings.push({
      code: "key-issuer-swapped",
      message: `${KEY_ID} holds a UUID and ${ISSUER_ID} holds a 10-character code \u2014 these look swapped. ${KEY_ID} is the short 10-character Key ID shown next to the key; ${ISSUER_ID} is the UUID shown above the keys list in Users and Access \u2192 Integrations.`
    });
    return warnings;
  }
  if (keyLooksLikeIssuer) {
    warnings.push({
      code: "key-id-looks-like-issuer-id",
      message: `${KEY_ID} looks like a UUID, which is the shape of an Issuer ID, not a Key ID. Copy the short 10-character Key ID shown next to the key in Users and Access \u2192 Integrations; for a Team key the UUID belongs in ${ISSUER_ID}.`
    });
  } else if (keyId !== void 0 && keyId !== "" && !KEY_ID_SHAPE.test(keyId)) {
    warnings.push({
      code: "key-id-unusual-format",
      message: `${KEY_ID} is not the usual 10-character Key ID format; double-check you copied the Key ID itself (not the key's name).`
    });
  }
  if (issuerId !== void 0 && issuerId !== "" && !UUID_SHAPE.test(issuerId)) {
    warnings.push({
      code: "issuer-id-not-uuid",
      message: issuerLooksLikeKey ? `${ISSUER_ID} looks like a 10-character Key ID, not the expected UUID. The Issuer ID is the UUID shown above the keys list in Users and Access \u2192 Integrations; an individual key has no Issuer ID (leave ${ISSUER_ID} unset).` : `${ISSUER_ID} is not in UUID format. The Issuer ID is the UUID shown above the API keys list in Users and Access \u2192 Integrations; an individual key has no Issuer ID (leave ${ISSUER_ID} unset).`
    });
  }
  return warnings;
}
function inspectInlinePrivateKey(raw) {
  if (raw === void 0) {
    return void 0;
  }
  const value = raw.trim();
  if (value === "") {
    return void 0;
  }
  if (/^["']/.test(value) || /["']$/.test(value)) {
    return `${PRIVATE_KEY} appears wrapped in quotes \u2014 remove the surrounding " or ' so the value begins with "-----BEGIN".`;
  }
  if (!value.includes("-----BEGIN")) {
    return `${PRIVATE_KEY} does not contain a "-----BEGIN ...-----" line; paste the full contents of the .p8 file, or set ${ASC_ENV_VARS.privateKeyPath} to the file path instead.`;
  }
  return void 0;
}
var KEY_ID_SHAPE, UUID_SHAPE, KEY_ID, ISSUER_ID, PRIVATE_KEY;
var init_credential_format = __esm({
  "dist/auth/credential-format.js"() {
    "use strict";
    init_credentials();
    KEY_ID_SHAPE = /^[A-Za-z0-9]{10}$/;
    UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    ({ keyId: KEY_ID, issuerId: ISSUER_ID, privateKey: PRIVATE_KEY } = ASC_ENV_VARS);
  }
});

// dist/cli/report-flags.js
function resolveAccessType(raw) {
  if (raw === void 0) {
    return "ONGOING";
  }
  if (ACCESS_TYPES.includes(raw)) {
    return raw;
  }
  throw new CliUsageError(`--access-type expects ONGOING or ONE_TIME_SNAPSHOT, got "${raw}".`);
}
function resolveVendorNumber(flag, env) {
  const vendor = flag ?? env[ASC_VENDOR_NUMBER_ENV];
  if (vendor !== void 0 && vendor !== "") {
    return vendor;
  }
  throw new CliUsageError(`A vendor number is required: pass --vendor or set ${ASC_VENDOR_NUMBER_ENV}. Find it in App Store Connect \u2192 Payments and Financial Reports (top of the page); the API cannot read it.`);
}
function resolveSalesFrequency(raw) {
  if (raw === void 0) {
    return "DAILY";
  }
  if (SALES_FREQUENCIES.includes(raw)) {
    return raw;
  }
  throw new CliUsageError(`--frequency expects one of ${SALES_FREQUENCIES.join(", ")}, got "${raw}".`);
}
function validateSalesReportDate(frequency, date) {
  if (date === void 0) {
    return;
  }
  const format = REPORT_DATE_FORMATS[frequency];
  if (!format.pattern.test(date)) {
    throw new CliUsageError(`--date for a ${frequency} sales report must be ${format.description}, got "${date}".`);
  }
}
function validateProcessingDate(date) {
  if (date === void 0) {
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new CliUsageError(`--date for an analytics instance must be YYYY-MM-DD (the processing date), got "${date}".`);
  }
}
function validateFinanceReportDate(date) {
  if (!/^\d{4}-\d{2}$/.test(date)) {
    throw new CliUsageError(`--date for a finance report must be YYYY-MM (Apple's fiscal month), got "${date}".`);
  }
}
function resolveReportFormat(raw) {
  if (raw === void 0) {
    return void 0;
  }
  if (raw === "json") {
    return "json";
  }
  throw new CliUsageError(`--format only supports json (the raw report file is always written), got "${raw}".`);
}
function maskVendorNumber(vendorNumber) {
  return `...${vendorNumber.slice(-4)}`;
}
var ACCESS_TYPES, ASC_VENDOR_NUMBER_ENV, REPORT_DATE_FORMATS, SALES_FREQUENCIES;
var init_report_flags = __esm({
  "dist/cli/report-flags.js"() {
    "use strict";
    init_exit_codes();
    ACCESS_TYPES = [
      "ONGOING",
      "ONE_TIME_SNAPSHOT"
    ];
    ASC_VENDOR_NUMBER_ENV = "ASC_VENDOR_NUMBER";
    REPORT_DATE_FORMATS = {
      DAILY: { pattern: /^\d{4}-\d{2}-\d{2}$/, description: "YYYY-MM-DD" },
      WEEKLY: {
        pattern: /^\d{4}-\d{2}-\d{2}$/,
        description: "YYYY-MM-DD (the week's closing date)"
      },
      MONTHLY: { pattern: /^\d{4}-\d{2}$/, description: "YYYY-MM" },
      YEARLY: { pattern: /^\d{4}$/, description: "YYYY" }
    };
    SALES_FREQUENCIES = Object.keys(REPORT_DATE_FORMATS);
  }
});

// dist/capabilities/app-store-versions.js
function listAppStoreVersions(client, appId, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.platform !== void 0 && {
      "filter[platform]": options.platform
    },
    ...options.appVersionState !== void 0 && {
      "filter[appVersionState]": options.appVersionState
    },
    ...options.versionString !== void 0 && {
      "filter[versionString]": options.versionString
    },
    ...options.fields !== void 0 && {
      "fields[appStoreVersions]": options.fields
    }
  };
  return readPaged(client, "/v1/apps/{id}/appStoreVersions", { params: { path: { id: appId }, query } }, options.scope, options.pagination);
}
var init_app_store_versions = __esm({
  "dist/capabilities/app-store-versions.js"() {
    "use strict";
    init_paginate();
  }
});

// dist/capabilities/app-infos.js
function listAppInfos(client, appId, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.fields !== void 0 && { "fields[appInfos]": options.fields }
  };
  return readPaged(client, "/v1/apps/{id}/appInfos", { params: { path: { id: appId }, query } }, options.scope, options.pagination);
}
async function getAppInfo(client, appInfoId, options = {}) {
  const query = {
    ...options.fields !== void 0 && { "fields[appInfos]": options.fields },
    ...options.include !== void 0 && { include: options.include },
    ...options.localizationFields !== void 0 && {
      "fields[appInfoLocalizations]": options.localizationFields
    }
  };
  const { data } = await client.GET("/v1/appInfos/{id}", {
    params: { path: { id: appInfoId }, query }
  });
  return expectDocument(data);
}
var init_app_infos = __esm({
  "dist/capabilities/app-infos.js"() {
    "use strict";
    init_internal();
    init_paginate();
  }
});

// dist/capabilities/app-info-localizations.js
function listAppInfoLocalizations(client, appInfoId, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.locale !== void 0 && { "filter[locale]": options.locale },
    ...options.fields !== void 0 && {
      "fields[appInfoLocalizations]": options.fields
    }
  };
  return readPaged(client, "/v1/appInfos/{id}/appInfoLocalizations", { params: { path: { id: appInfoId }, query } }, options.scope, options.pagination);
}
async function getAppInfoLocalization(client, localizationId, options = {}) {
  const query = {
    ...options.fields !== void 0 && {
      "fields[appInfoLocalizations]": options.fields
    }
  };
  const { data } = await client.GET("/v1/appInfoLocalizations/{id}", {
    params: { path: { id: localizationId }, query }
  });
  return expectDocument(data);
}
async function createAppInfoLocalization(client, appInfoId, attributes) {
  const { data } = await client.POST("/v1/appInfoLocalizations", {
    body: {
      data: {
        type: "appInfoLocalizations",
        attributes,
        relationships: {
          appInfo: {
            data: { type: "appInfos", id: appInfoId }
          }
        }
      }
    }
  });
  return expectDocument(data);
}
async function updateAppInfoLocalization(client, localizationId, attributes) {
  const { data } = await client.PATCH("/v1/appInfoLocalizations/{id}", {
    params: { path: { id: localizationId } },
    body: {
      data: {
        type: "appInfoLocalizations",
        id: localizationId,
        attributes
      }
    }
  });
  return expectDocument(data);
}
var init_app_info_localizations = __esm({
  "dist/capabilities/app-info-localizations.js"() {
    "use strict";
    init_internal();
    init_paginate();
  }
});

// dist/capabilities/app-store-version-localizations.js
function listAppStoreVersionLocalizations(client, versionId, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.locale !== void 0 && { "filter[locale]": options.locale },
    ...options.fields !== void 0 && {
      "fields[appStoreVersionLocalizations]": options.fields
    }
  };
  return readPaged(client, "/v1/appStoreVersions/{id}/appStoreVersionLocalizations", { params: { path: { id: versionId }, query } }, options.scope, options.pagination);
}
async function getAppStoreVersionLocalization(client, localizationId, options = {}) {
  const query = {
    ...options.fields !== void 0 && {
      "fields[appStoreVersionLocalizations]": options.fields
    }
  };
  const { data } = await client.GET("/v1/appStoreVersionLocalizations/{id}", {
    params: { path: { id: localizationId }, query }
  });
  return expectDocument(data);
}
async function createAppStoreVersionLocalization(client, versionId, attributes) {
  const { data } = await client.POST("/v1/appStoreVersionLocalizations", {
    body: {
      data: {
        type: "appStoreVersionLocalizations",
        attributes,
        relationships: {
          appStoreVersion: {
            data: { type: "appStoreVersions", id: versionId }
          }
        }
      }
    }
  });
  return expectDocument(data);
}
async function updateAppStoreVersionLocalization(client, localizationId, attributes) {
  const { data } = await client.PATCH("/v1/appStoreVersionLocalizations/{id}", {
    params: { path: { id: localizationId } },
    body: {
      data: {
        type: "appStoreVersionLocalizations",
        id: localizationId,
        attributes
      }
    }
  });
  return expectDocument(data);
}
var init_app_store_version_localizations = __esm({
  "dist/capabilities/app-store-version-localizations.js"() {
    "use strict";
    init_internal();
    init_paginate();
  }
});

// dist/capabilities/customer-reviews.js
function buildReviewsQuery(options) {
  return {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.rating !== void 0 && { "filter[rating]": options.rating },
    ...options.territory !== void 0 && {
      "filter[territory]": options.territory
    },
    ...options.hasPublishedResponse !== void 0 && {
      "exists[publishedResponse]": options.hasPublishedResponse
    },
    ...options.sort !== void 0 && { sort: options.sort },
    ...options.fields !== void 0 && {
      "fields[customerReviews]": options.fields
    }
  };
}
function listCustomerReviewsForApp(client, appId, options) {
  const query = buildReviewsQuery(options);
  return readPaged(client, "/v1/apps/{id}/customerReviews", { params: { path: { id: appId }, query } }, options.scope, options.pagination);
}
function listCustomerReviewsForVersion(client, versionId, options) {
  const query = buildReviewsQuery(options);
  return readPaged(client, "/v1/appStoreVersions/{id}/customerReviews", { params: { path: { id: versionId }, query } }, options.scope, options.pagination);
}
async function getCustomerReview(client, reviewId, options = {}) {
  const query = {
    ...options.fields !== void 0 && {
      "fields[customerReviews]": options.fields
    },
    ...options.include !== void 0 && { include: options.include },
    ...options.responseFields !== void 0 && {
      "fields[customerReviewResponses]": options.responseFields
    }
  };
  const { data } = await client.GET("/v1/customerReviews/{id}", {
    params: { path: { id: reviewId }, query }
  });
  return expectDocument(data);
}
async function getCustomerReviewResponse(client, reviewId, options = {}) {
  const query = {
    ...options.fields !== void 0 && {
      "fields[customerReviewResponses]": options.fields
    }
  };
  const { data } = await client.GET("/v1/customerReviews/{id}/response", {
    params: { path: { id: reviewId }, query }
  });
  const document = expectDocument(data);
  const resource = document.data;
  if (resource === null) {
    throw new AscNotFoundError(`Review ${reviewId} has no developer response yet.`);
  }
  return document;
}
async function setCustomerReviewResponse(client, reviewId, responseBody) {
  const { data } = await client.POST("/v1/customerReviewResponses", {
    body: {
      data: {
        type: "customerReviewResponses",
        attributes: { responseBody },
        relationships: {
          review: {
            data: { type: "customerReviews", id: reviewId }
          }
        }
      }
    }
  });
  return expectDocument(data);
}
var init_customer_reviews = __esm({
  "dist/capabilities/customer-reviews.js"() {
    "use strict";
    init_errors();
    init_internal();
    init_paginate();
  }
});

// dist/capabilities/analytics-reports.js
function listAnalyticsReportRequests(client, appId, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.accessType !== void 0 && {
      "filter[accessType]": options.accessType
    },
    ...options.fields !== void 0 && {
      "fields[analyticsReportRequests]": options.fields
    }
  };
  return readPaged(client, "/v1/apps/{id}/analyticsReportRequests", { params: { path: { id: appId }, query } }, options.scope, options.pagination);
}
async function getAnalyticsReportRequest(client, requestId, options = {}) {
  const query = {
    ...options.fields !== void 0 && {
      "fields[analyticsReportRequests]": options.fields
    }
  };
  const { data } = await client.GET("/v1/analyticsReportRequests/{id}", {
    params: { path: { id: requestId }, query }
  });
  return expectDocument(data);
}
async function createAnalyticsReportRequest(client, appId, accessType) {
  const { data } = await client.POST("/v1/analyticsReportRequests", {
    body: {
      data: {
        type: "analyticsReportRequests",
        attributes: { accessType },
        relationships: {
          app: {
            data: { type: "apps", id: appId }
          }
        }
      }
    }
  });
  return expectDocument(data);
}
async function deleteAnalyticsReportRequest(client, requestId) {
  await client.DELETE("/v1/analyticsReportRequests/{id}", {
    params: { path: { id: requestId } }
  });
}
function listAnalyticsReports(client, requestId, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.category !== void 0 && {
      "filter[category]": options.category
    },
    ...options.name !== void 0 && { "filter[name]": options.name },
    ...options.fields !== void 0 && {
      "fields[analyticsReports]": options.fields
    }
  };
  return readPaged(client, "/v1/analyticsReportRequests/{id}/reports", { params: { path: { id: requestId }, query } }, options.scope, options.pagination);
}
function listAnalyticsReportInstances(client, reportId, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.granularity !== void 0 && {
      "filter[granularity]": options.granularity
    },
    ...options.processingDate !== void 0 && {
      "filter[processingDate]": options.processingDate
    },
    ...options.fields !== void 0 && {
      "fields[analyticsReportInstances]": options.fields
    }
  };
  return readPaged(client, "/v1/analyticsReports/{id}/instances", { params: { path: { id: reportId }, query } }, options.scope, options.pagination);
}
function listAnalyticsReportSegments(client, instanceId, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.fields !== void 0 && {
      "fields[analyticsReportSegments]": options.fields
    }
  };
  return readPaged(client, "/v1/analyticsReportInstances/{id}/segments", { params: { path: { id: instanceId }, query } }, options.scope, options.pagination);
}
var init_analytics_reports = __esm({
  "dist/capabilities/analytics-reports.js"() {
    "use strict";
    init_internal();
    init_paginate();
  }
});

// dist/workflows/report-files.js
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { rename, unlink } from "node:fs/promises";
import { Transform } from "node:stream";
import { finished, pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
function isGzipMagic(bytes) {
  return bytes[0] === 31 && bytes[1] === 139;
}
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
function downloadFailure(cause, target) {
  if (cause instanceof AscFileProcessingError) {
    return cause;
  }
  return new AscFileProcessingError(`Reading the report stream failed: ${messageOf(cause)}`, "download", { cause, ...target !== void 0 && { target } });
}
function sniffDelimiter(line) {
  if (line.includes("	")) {
    return "tab";
  }
  if (line.includes(",")) {
    return "comma";
  }
  return void 0;
}
function splitReportLine(line, delimiter) {
  if (delimiter === void 0) {
    return [line];
  }
  return line.split(delimiter === "tab" ? "	" : ",");
}
function createLineObserver() {
  let bytesWritten = 0;
  let newlines = 0;
  let lastByte;
  let headerParts = [];
  let headerBytes = 0;
  let headerSettled = false;
  let headerOverflow = false;
  const stream = new Transform({
    transform(chunk2, _encoding, callback) {
      bytesWritten += chunk2.length;
      if (chunk2.length > 0) {
        lastByte = chunk2[chunk2.length - 1];
      }
      for (let at = chunk2.indexOf(NEWLINE); at !== -1; at = chunk2.indexOf(NEWLINE, at + 1)) {
        newlines += 1;
      }
      if (!headerSettled) {
        const newlineAt = chunk2.indexOf(NEWLINE);
        const slice = newlineAt === -1 ? chunk2 : chunk2.subarray(0, newlineAt);
        if (headerBytes + slice.length > HEADER_CAPTURE_CAP_BYTES) {
          headerOverflow = true;
          headerSettled = true;
          headerParts = [];
        } else {
          headerParts.push(slice);
          headerBytes += slice.length;
          if (newlineAt !== -1) {
            headerSettled = true;
          }
        }
      }
      callback(null, chunk2);
    }
  });
  return {
    stream,
    summarize() {
      const endsWithNewline = lastByte === NEWLINE;
      const totalLines = bytesWritten === 0 ? 0 : newlines + (endsWithNewline ? 0 : 1);
      const rows = Math.max(0, totalLines - 1);
      if (bytesWritten === 0 || headerOverflow) {
        return { bytesWritten, rows };
      }
      const headerLine = Buffer.concat(headerParts).toString("utf8").replace(/\r$/, "");
      const delimiter = sniffDelimiter(headerLine);
      return {
        bytesWritten,
        rows,
        headers: splitReportLine(headerLine, delimiter),
        ...delimiter !== void 0 && { delimiter }
      };
    }
  };
}
async function saveReportStream(source, filePath, options = {}) {
  const iterator = source[Symbol.asyncIterator]();
  const peeked = [];
  let peekedBytes = 0;
  try {
    while (peekedBytes < 2) {
      const next = await iterator.next();
      if (next.done === true) {
        break;
      }
      peeked.push(next.value);
      peekedBytes += next.value.length;
    }
  } catch (error) {
    throw downloadFailure(error, options.sourceTarget);
  }
  const wasGzipped = isGzipMagic(Buffer.concat(peeked, Math.min(peekedBytes, 2)));
  const hash = createHash("md5");
  let compressedBytes = 0;
  async function* transferred() {
    try {
      for (const chunk2 of peeked) {
        hash.update(chunk2);
        compressedBytes += chunk2.length;
        yield chunk2;
      }
      for (; ; ) {
        const next = await iterator.next();
        if (next.done === true) {
          return;
        }
        hash.update(next.value);
        compressedBytes += next.value.length;
        yield next.value;
      }
    } catch (error) {
      throw downloadFailure(error, options.sourceTarget);
    } finally {
      try {
        await iterator.return?.();
      } catch {
      }
    }
  }
  const gunzip = wasGzipped ? createGunzip() : void 0;
  const observer = createLineObserver();
  const writeStream = createWriteStream(filePath);
  let failedStage;
  gunzip?.on("error", () => {
    failedStage ??= "decompress";
  });
  writeStream.on("error", () => {
    failedStage ??= "write";
  });
  try {
    if (gunzip === void 0) {
      await pipeline(transferred(), observer.stream, writeStream);
    } else {
      await pipeline(transferred(), gunzip, observer.stream, writeStream);
    }
  } catch (error) {
    await finished(writeStream).catch(() => void 0);
    await unlink(filePath).catch(() => void 0);
    if (error instanceof AscFileProcessingError) {
      throw error;
    }
    if (failedStage === "decompress") {
      throw new AscFileProcessingError(`Decompressing the report payload failed: ${messageOf(error)}`, "decompress", { target: filePath, cause: error });
    }
    if (failedStage === "write") {
      throw new AscFileProcessingError(`Writing the report file failed: ${messageOf(error)}`, "write", { target: filePath, cause: error });
    }
    throw downloadFailure(error, options.sourceTarget);
  }
  const md5 = hash.digest("hex");
  const expectedMd5 = options.expectedMd5?.toLowerCase();
  if (expectedMd5 !== void 0 && expectedMd5 !== md5) {
    let evidencePath = `${filePath}.corrupt`;
    try {
      await rename(filePath, evidencePath);
    } catch {
      evidencePath = filePath;
    }
    throw new AscFileProcessingError(`Report checksum mismatch: expected MD5 ${expectedMd5}, computed ${md5}; the transferred bytes are kept at ${evidencePath}`, "checksum", { target: evidencePath });
  }
  const summary = observer.summarize();
  return {
    path: filePath,
    bytesWritten: summary.bytesWritten,
    compressedBytes,
    wasGzipped,
    md5,
    rows: summary.rows,
    ...summary.headers !== void 0 && { headers: summary.headers },
    ...summary.delimiter !== void 0 && { delimiter: summary.delimiter }
  };
}
async function convertDelimitedReportToJson(sourcePath, jsonPath) {
  const input = createReadStream(sourcePath, { encoding: "utf8" });
  const output = createWriteStream(jsonPath);
  let failedStage;
  output.on("error", () => {
    failedStage ??= "write";
  });
  let rows = 0;
  async function* records() {
    try {
      yield "[";
      let headers;
      let delimiter;
      let first = true;
      const convertLine = (rawLine) => {
        const line = rawLine.replace(/\r$/, "");
        if (line === "") {
          return void 0;
        }
        if (headers === void 0) {
          delimiter = sniffDelimiter(line);
          headers = splitReportLine(line, delimiter);
          return void 0;
        }
        const fields = splitReportLine(line, delimiter);
        const record = {};
        headers.forEach((name, index) => {
          record[name] = fields[index] ?? "";
        });
        rows += 1;
        const prefix = first ? "\n" : ",\n";
        first = false;
        return prefix + JSON.stringify(record);
      };
      let remainder = "";
      for await (const chunk2 of input) {
        const lines = (remainder + chunk2).split("\n");
        remainder = lines.pop() ?? "";
        for (const line of lines) {
          const record = convertLine(line);
          if (record !== void 0) {
            yield record;
          }
        }
      }
      const lastRecord = convertLine(remainder);
      if (lastRecord !== void 0) {
        yield lastRecord;
      }
      yield "\n]\n";
    } catch (error) {
      throw new AscFileProcessingError(`Converting the report to JSON failed: ${messageOf(error)}; the original report file is untouched at ${sourcePath}`, "parse", { target: sourcePath, cause: error });
    }
  }
  try {
    await pipeline(records(), output);
  } catch (error) {
    await finished(output).catch(() => void 0);
    await unlink(jsonPath).catch(() => void 0);
    if (error instanceof AscFileProcessingError) {
      throw error;
    }
    if (failedStage === "write") {
      throw new AscFileProcessingError(`Writing the JSON report failed: ${messageOf(error)}`, "write", { target: jsonPath, cause: error });
    }
    throw new AscFileProcessingError(`Converting the report to JSON failed: ${messageOf(error)}; the original report file is untouched at ${sourcePath}`, "parse", { target: sourcePath, cause: error });
  }
  return { path: jsonPath, rows };
}
async function downloadExternalFile(url, filePath, options = {}) {
  let target;
  try {
    const parsed = new URL(url);
    target = parsed.origin + parsed.pathname;
  } catch (error) {
    throw new AscFileProcessingError("Segment download failed: the segment URL is not a valid URL", "download", { cause: error });
  }
  const transport = createRetryingFetch(options.retry === void 0 ? {} : { retry: options.retry });
  let response;
  try {
    response = await transport(new Request(url));
  } catch (error) {
    throw new AscFileProcessingError(`Downloading ${target} failed: ${messageOf(error)}`, "download", { target, cause: error });
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => void 0);
    throw new AscFileProcessingError(`Downloading ${target} failed with HTTP ${String(response.status)}`, "download", {
      target,
      request: { method: "GET", url: target, status: response.status }
    });
  }
  if (response.body === null) {
    throw new AscFileProcessingError(`Downloading ${target} returned no body`, "download", { target });
  }
  return saveReportStream(response.body, filePath, {
    sourceTarget: target,
    ...options.expectedMd5 !== void 0 && {
      expectedMd5: options.expectedMd5
    }
  });
}
async function saveBinaryStream(source, filePath, options = {}) {
  let bytesWritten = 0;
  async function* counted() {
    try {
      for await (const chunk2 of source) {
        bytesWritten += chunk2.length;
        yield chunk2;
      }
    } catch (error) {
      throw downloadFailure(error, options.sourceTarget);
    }
  }
  const writeStream = createWriteStream(filePath);
  let failedStage;
  writeStream.on("error", () => {
    failedStage ??= "write";
  });
  try {
    await pipeline(counted(), writeStream);
  } catch (error) {
    await finished(writeStream).catch(() => void 0);
    await unlink(filePath).catch(() => void 0);
    if (error instanceof AscFileProcessingError) {
      throw error;
    }
    if (failedStage === "write") {
      throw new AscFileProcessingError(`Writing the asset file failed: ${messageOf(error)}`, "write", { target: filePath, cause: error });
    }
    throw downloadFailure(error, options.sourceTarget);
  }
  return { path: filePath, bytesWritten };
}
function sanitizeDownloadUrl(url) {
  const parsed = new URL(url);
  return parsed.origin + parsed.pathname;
}
async function downloadExternalBinaryFile(url, filePath, options = {}) {
  let target;
  try {
    target = sanitizeDownloadUrl(url);
  } catch (error) {
    throw new AscFileProcessingError("Asset download failed: the asset URL is not a valid URL", "download", { cause: error });
  }
  const transport = createRetryingFetch(options.retry === void 0 ? {} : { retry: options.retry });
  let response;
  try {
    response = await transport(new Request(url));
  } catch (error) {
    throw new AscFileProcessingError(`Downloading ${target} failed: ${messageOf(error)}`, "download", { target, cause: error });
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => void 0);
    throw new AscFileProcessingError(`Downloading ${target} failed with HTTP ${String(response.status)}`, "download", {
      target,
      request: { method: "GET", url: target, status: response.status }
    });
  }
  if (response.body === null) {
    throw new AscFileProcessingError(`Downloading ${target} returned no body`, "download", { target });
  }
  return saveBinaryStream(response.body, filePath, { sourceTarget: target });
}
function defaultSalesReportFileName(spec) {
  return `sales-${spec.reportType}-${spec.reportSubType}-${spec.frequency}-${spec.reportDate ?? "latest"}.tsv`;
}
function defaultFinanceReportFileName(spec) {
  return `finance-${spec.reportType}-${spec.regionCode}-${spec.reportDate}.tsv`;
}
function defaultAnalyticsReportDirName(reportName, granularity, processingDate) {
  return `analytics-${slugify(reportName)}-${granularity.toLowerCase()}-${processingDate}`;
}
function analyticsSegmentFileName(index, extension) {
  return `segment-${String(index).padStart(3, "0")}.${extension}`;
}
function jsonSiblingPath(reportPath) {
  return /\.(tsv|csv|txt)$/i.test(reportPath) ? reportPath.replace(/\.(tsv|csv|txt)$/i, ".json") : `${reportPath}.json`;
}
function slugify(value) {
  const slug = value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-+|-+$/g, "");
  return slug === "" ? "report" : slug;
}
var NEWLINE, HEADER_CAPTURE_CAP_BYTES;
var init_report_files = __esm({
  "dist/workflows/report-files.js"() {
    "use strict";
    init_errors();
    init_transport();
    NEWLINE = 10;
    HEADER_CAPTURE_CAP_BYTES = 256 * 1024;
  }
});

// dist/workflows/analytics-reports.js
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
async function ensureAnalyticsReportRequest(client, appId, accessType) {
  const existing = await listAnalyticsReportRequests(client, appId, {
    scope: "all-pages",
    accessType: [accessType]
  });
  const stoppedRequestIds = existing.items.filter((request) => request.attributes?.stoppedDueToInactivity === true).map((request) => request.id);
  const active = existing.items.find((request) => request.attributes?.stoppedDueToInactivity !== true);
  if (active !== void 0) {
    return { request: active, created: false, stoppedRequestIds };
  }
  const created = await createAnalyticsReportRequest(client, appId, accessType);
  return { request: created.data, created: true, stoppedRequestIds };
}
function extractMd5(checksum) {
  if (checksum === null) {
    return void 0;
  }
  const match = /^(?:md5:)?([0-9a-f]{32})$/i.exec(checksum.trim());
  return match?.[1];
}
async function downloadAnalyticsInstance(client, instanceId, directory) {
  const segments = await listAnalyticsReportSegments(client, instanceId, {
    scope: "all-pages"
  });
  if (segments.items.length === 0) {
    throw new AscNotFoundError(`Analytics report instance ${instanceId} has no downloadable segments yet. Segments appear when Apple finishes generating the instance; retry shortly.`);
  }
  try {
    await mkdir(directory, { recursive: true });
  } catch (error) {
    throw new AscFileProcessingError(`Creating the report directory failed: ${error instanceof Error ? error.message : String(error)}`, "write", { target: directory, cause: error });
  }
  const downloaded = [];
  for (const [index, segment] of segments.items.entries()) {
    const url = segment.attributes?.url;
    if (url === void 0) {
      throw new AscUpstreamError(`Analytics segment ${segment.id} carries no download URL.`);
    }
    const checksum = segment.attributes?.checksum ?? null;
    const expectedMd5 = extractMd5(checksum);
    const saved = await downloadExternalFile(url, join(directory, analyticsSegmentFileName(index, "csv")), { ...expectedMd5 !== void 0 && { expectedMd5 } });
    downloaded.push({
      segmentId: segment.id,
      path: saved.path,
      bytesWritten: saved.bytesWritten,
      rows: saved.rows,
      checksum,
      checksumVerified: expectedMd5 !== void 0
    });
  }
  return { directory, segments: downloaded };
}
async function downloadAnalyticsReport(client, selector, options = {}) {
  const requests = await listAnalyticsReportRequests(client, selector.appId, {
    scope: "all-pages",
    accessType: [selector.accessType]
  });
  const request = requests.items.find((candidate) => candidate.attributes?.stoppedDueToInactivity !== true);
  if (request === void 0) {
    const stopped = requests.items.length;
    throw new AscNotFoundError(`App ${selector.appId} has no active ${selector.accessType} analytics report request${stopped > 0 ? ` (${String(stopped)} stopped for inactivity)` : ""}. Create one with the ensure-request verb; Apple generates the first data 1-2 days later.`);
  }
  const reports = await listAnalyticsReports(client, request.id, {
    scope: "all-pages",
    name: [selector.reportName],
    ...selector.category !== void 0 && { category: [selector.category] }
  });
  if (reports.items.length > 1) {
    const categories = reports.items.map((candidate) => candidate.attributes?.category ?? "?").join(", ");
    throw new AscInvalidParameterError(`Report name "${selector.reportName}" matches ${String(reports.items.length)} reports (categories: ${categories}); add a category to disambiguate.`);
  }
  const report = reports.items[0];
  if (report === void 0) {
    const available = await listAnalyticsReports(client, request.id, {
      scope: "all-pages"
    });
    const names = [
      ...new Set(available.items.flatMap((candidate) => candidate.attributes?.name === void 0 ? [] : [candidate.attributes.name]))
    ];
    throw new AscNotFoundError(`No report named "${selector.reportName}" exists under request ${request.id}.${names.length > 0 ? ` Available reports: ${names.join("; ")}.` : " No reports exist yet \u2014 the first data takes 1-2 days after the report request is created."}`);
  }
  const instances = await listAnalyticsReportInstances(client, report.id, {
    scope: "all-pages",
    ...selector.granularity !== void 0 && {
      granularity: [selector.granularity]
    },
    ...selector.processingDate !== void 0 && {
      processingDate: [selector.processingDate]
    }
  });
  const instance = [...instances.items].sort((a, b) => (b.attributes?.processingDate ?? "").localeCompare(a.attributes?.processingDate ?? ""))[0];
  if (instance === void 0) {
    if (selector.granularity !== void 0 || selector.processingDate !== void 0) {
      const all = await listAnalyticsReportInstances(client, report.id, {
        scope: "all-pages"
      });
      const coordinates = all.items.map((candidate) => `${candidate.attributes?.granularity ?? "?"} @ ${candidate.attributes?.processingDate ?? "?"}`).join(", ");
      throw new AscNotFoundError(`Report "${selector.reportName}" has no instance matching the granularity/date filters.${coordinates === "" ? " No instances exist yet." : ` Available instances: ${coordinates}.`}`);
    }
    throw new AscNotFoundError(`Report "${selector.reportName}" has no instances yet \u2014 Apple generates the first data 1-2 days after the report request is created, then daily for ONGOING requests.`);
  }
  const directory = options.directory ?? defaultAnalyticsReportDirName(report.attributes?.name ?? selector.reportName, instance.attributes?.granularity ?? "UNKNOWN", instance.attributes?.processingDate ?? "unknown-date");
  const download = await downloadAnalyticsInstance(client, instance.id, directory);
  return { request, report, instance, ...download };
}
var init_analytics_reports2 = __esm({
  "dist/workflows/analytics-reports.js"() {
    "use strict";
    init_analytics_reports();
    init_errors();
    init_report_files();
  }
});

// dist/workflows/sales-reports.js
function carryErrorContext(error) {
  return {
    apiErrors: error.apiErrors,
    ...error.rateLimit !== void 0 && { rateLimit: error.rateLimit },
    ...error.request !== void 0 && { request: error.request },
    cause: error
  };
}
function enrichSalesNotFound(error, spec) {
  return new AscNotFoundError(`No ${spec.frequency} ${spec.reportType}/${spec.reportSubType} sales report exists for ${spec.reportDate ?? "the latest date"} under vendor ...${spec.vendorNumber.slice(-4)}. ${SALES_NOT_FOUND_GUIDANCE[spec.frequency]} A report also stays missing when the app simply had no activity to report.`, carryErrorContext(error));
}
async function downloadSalesReport(client, spec, destinationPath) {
  const query = {
    "filter[frequency]": [spec.frequency],
    "filter[reportType]": [spec.reportType],
    "filter[reportSubType]": [spec.reportSubType],
    "filter[vendorNumber]": [spec.vendorNumber],
    ...spec.reportDate !== void 0 && {
      "filter[reportDate]": [spec.reportDate]
    },
    ...spec.version !== void 0 && { "filter[version]": [spec.version] }
  };
  let body;
  try {
    const result = await client.GET("/v1/salesReports", {
      params: { query },
      parseAs: "stream"
    });
    body = result.data ?? null;
  } catch (error) {
    throw error instanceof AscNotFoundError ? enrichSalesNotFound(error, spec) : error;
  }
  if (body === null) {
    throw new AscUpstreamError("ASC returned a success status without a report body.");
  }
  return saveReportStream(body, destinationPath, {
    sourceTarget: "/v1/salesReports"
  });
}
var SALES_NOT_FOUND_GUIDANCE;
var init_sales_reports = __esm({
  "dist/workflows/sales-reports.js"() {
    "use strict";
    init_errors();
    init_report_files();
    SALES_NOT_FOUND_GUIDANCE = {
      DAILY: "Daily reports appear roughly a day after the business day ends and old ones expire after several months \u2014 try a recent date, or omit the date for the latest available report.",
      WEEKLY: "Weekly reports are filed under the week's closing date, so a mid-week date finds nothing \u2014 use the most recent week-ending date.",
      MONTHLY: "Monthly reports appear a few days after the calendar month ends \u2014 check the YYYY-MM month is complete.",
      YEARLY: "Yearly reports appear after the calendar year ends \u2014 check the YYYY year is complete."
    };
  }
});

// dist/workflows/finance-reports.js
function enrichFinanceNotFound(error, spec) {
  return new AscNotFoundError(`No ${spec.reportType} finance report exists for fiscal month ${spec.reportDate} in region ${spec.regionCode} under vendor ...${spec.vendorNumber.slice(-4)}. Finance reports appear only after Apple closes the fiscal month (early in the following calendar month), the date is the FISCAL month (which shifts against the calendar), and the region must match a report listed in App Store Connect \u2192 Payments and Financial Reports \u2014 ZZ consolidates all regions.`, carryErrorContext(error));
}
async function downloadFinanceReport(client, spec, destinationPath) {
  const query = {
    "filter[regionCode]": [spec.regionCode],
    "filter[reportDate]": [spec.reportDate],
    "filter[reportType]": [spec.reportType],
    "filter[vendorNumber]": [spec.vendorNumber]
  };
  let body;
  try {
    const result = await client.GET("/v1/financeReports", {
      params: { query },
      parseAs: "stream"
    });
    body = result.data ?? null;
  } catch (error) {
    throw error instanceof AscNotFoundError ? enrichFinanceNotFound(error, spec) : error;
  }
  if (body === null) {
    throw new AscUpstreamError("ASC returned a success status without a report body.");
  }
  return saveReportStream(body, destinationPath, {
    sourceTarget: "/v1/financeReports"
  });
}
var init_finance_reports = __esm({
  "dist/workflows/finance-reports.js"() {
    "use strict";
    init_errors();
    init_report_files();
    init_sales_reports();
  }
});

// dist/capabilities/app-screenshots.js
function listAppScreenshotSets(client, localizationId, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.fields !== void 0 && {
      "fields[appScreenshotSets]": options.fields
    }
  };
  return readPaged(client, "/v1/appStoreVersionLocalizations/{id}/appScreenshotSets", { params: { path: { id: localizationId }, query } }, options.scope, options.pagination);
}
function listAppScreenshots(client, setId, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.fields !== void 0 && {
      "fields[appScreenshots]": options.fields
    }
  };
  return readPaged(client, "/v1/appScreenshotSets/{id}/appScreenshots", { params: { path: { id: setId }, query } }, options.scope, options.pagination);
}
async function createAppScreenshotSet(client, localizationId, screenshotDisplayType) {
  const { data } = await client.POST("/v1/appScreenshotSets", {
    body: {
      data: {
        type: "appScreenshotSets",
        attributes: { screenshotDisplayType },
        relationships: {
          appStoreVersionLocalization: {
            data: { type: "appStoreVersionLocalizations", id: localizationId }
          }
        }
      }
    }
  });
  return expectDocument(data);
}
async function deleteAppScreenshotSet(client, setId) {
  await client.DELETE("/v1/appScreenshotSets/{id}", {
    params: { path: { id: setId } }
  });
}
async function reserveAppScreenshot(client, setId, attributes) {
  const { data } = await client.POST("/v1/appScreenshots", {
    body: {
      data: {
        type: "appScreenshots",
        attributes,
        relationships: {
          appScreenshotSet: {
            data: { type: "appScreenshotSets", id: setId }
          }
        }
      }
    }
  });
  return expectDocument(data);
}
async function getAppScreenshot(client, screenshotId) {
  const { data } = await client.GET("/v1/appScreenshots/{id}", {
    params: { path: { id: screenshotId } }
  });
  return expectDocument(data);
}
function readScreenshotDeliveryState(resource) {
  return resource.data.attributes?.assetDeliveryState;
}
async function commitAppScreenshot(client, screenshotId, attributes) {
  const { data } = await client.PATCH("/v1/appScreenshots/{id}", {
    params: { path: { id: screenshotId } },
    body: {
      data: { type: "appScreenshots", id: screenshotId, attributes }
    }
  });
  return expectDocument(data);
}
async function deleteAppScreenshot(client, screenshotId) {
  await client.DELETE("/v1/appScreenshots/{id}", {
    params: { path: { id: screenshotId } }
  });
}
async function reorderAppScreenshots(client, setId, screenshotIds) {
  await client.PATCH("/v1/appScreenshotSets/{id}/relationships/appScreenshots", {
    params: { path: { id: setId } },
    body: {
      data: screenshotIds.map((id) => ({
        type: "appScreenshots",
        id
      }))
    }
  });
}
var init_app_screenshots = __esm({
  "dist/capabilities/app-screenshots.js"() {
    "use strict";
    init_internal();
    init_paginate();
  }
});

// dist/capabilities/app-previews.js
function listAppPreviewSets(client, localizationId, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.fields !== void 0 && {
      "fields[appPreviewSets]": options.fields
    }
  };
  return readPaged(client, "/v1/appStoreVersionLocalizations/{id}/appPreviewSets", { params: { path: { id: localizationId }, query } }, options.scope, options.pagination);
}
function listAppPreviews(client, setId, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.fields !== void 0 && {
      "fields[appPreviews]": options.fields
    }
  };
  return readPaged(client, "/v1/appPreviewSets/{id}/appPreviews", { params: { path: { id: setId }, query } }, options.scope, options.pagination);
}
async function createAppPreviewSet(client, localizationId, previewType) {
  const { data } = await client.POST("/v1/appPreviewSets", {
    body: {
      data: {
        type: "appPreviewSets",
        attributes: { previewType },
        relationships: {
          appStoreVersionLocalization: {
            data: { type: "appStoreVersionLocalizations", id: localizationId }
          }
        }
      }
    }
  });
  return expectDocument(data);
}
async function deleteAppPreviewSet(client, setId) {
  await client.DELETE("/v1/appPreviewSets/{id}", {
    params: { path: { id: setId } }
  });
}
async function reserveAppPreview(client, setId, attributes) {
  const { data } = await client.POST("/v1/appPreviews", {
    body: {
      data: {
        type: "appPreviews",
        attributes,
        relationships: {
          appPreviewSet: {
            data: { type: "appPreviewSets", id: setId }
          }
        }
      }
    }
  });
  return expectDocument(data);
}
async function getAppPreview(client, previewId) {
  const { data } = await client.GET("/v1/appPreviews/{id}", {
    params: { path: { id: previewId } }
  });
  return expectDocument(data);
}
function readPreviewDeliveryStates(resource) {
  const attributes = resource.data.attributes;
  return {
    asset: attributes?.assetDeliveryState,
    video: attributes?.videoDeliveryState
  };
}
async function commitAppPreview(client, previewId, attributes) {
  const { data } = await client.PATCH("/v1/appPreviews/{id}", {
    params: { path: { id: previewId } },
    body: {
      data: { type: "appPreviews", id: previewId, attributes }
    }
  });
  return expectDocument(data);
}
async function deleteAppPreview(client, previewId) {
  await client.DELETE("/v1/appPreviews/{id}", {
    params: { path: { id: previewId } }
  });
}
async function reorderAppPreviews(client, setId, previewIds) {
  await client.PATCH("/v1/appPreviewSets/{id}/relationships/appPreviews", {
    params: { path: { id: setId } },
    body: {
      data: previewIds.map((id) => ({ type: "appPreviews", id }))
    }
  });
}
var init_app_previews = __esm({
  "dist/capabilities/app-previews.js"() {
    "use strict";
    init_internal();
    init_paginate();
  }
});

// dist/workflows/media-files.js
import { createHash as createHash2 } from "node:crypto";
import { createReadStream as createReadStream2 } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { Readable } from "node:stream";
import { setTimeout as delay2 } from "node:timers/promises";
function messageOf2(error) {
  return error instanceof Error ? error.message : String(error);
}
function isAbortError2(error) {
  return error instanceof Error && error.name === "AbortError";
}
async function defaultSleep2(ms) {
  await delay2(ms);
}
function sanitizeUploadUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch {
    return "the upload URL";
  }
}
async function readUploadFileMetadata(filePath) {
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      throw new AscFileProcessingError(`${filePath} is not a regular file.`, "transfer-read", { target: filePath });
    }
    return { fileName: basename(filePath), fileSize: stats.size };
  } catch (error) {
    if (error instanceof AscFileProcessingError) {
      throw error;
    }
    throw new AscFileProcessingError(`Reading ${filePath} failed: ${messageOf2(error)}`, "transfer-read", { target: filePath, cause: error });
  }
}
async function computeFileMd5(filePath) {
  const hash = createHash2("md5");
  try {
    for await (const chunk2 of createReadStream2(filePath)) {
      hash.update(chunk2);
    }
  } catch (error) {
    throw new AscFileProcessingError(`Reading ${filePath} to checksum it failed: ${messageOf2(error)}`, "transfer-read", { target: filePath, cause: error });
  }
  return hash.digest("hex");
}
async function transferPart(filePath, operation, fetchImpl, retry) {
  const { url, length, offset } = operation;
  if (url === void 0 || length === void 0 || offset === void 0) {
    throw new AscUpstreamError("An upload operation is missing its url, offset, or length; Apple's reservation response is incomplete.");
  }
  const method = operation.method ?? "PUT";
  const target = sanitizeUploadUrl(url);
  for (let attempt = 1; ; attempt += 1) {
    const headers = new Headers();
    for (const header of operation.requestHeaders ?? []) {
      if (header.name !== void 0 && header.value !== void 0) {
        headers.set(header.name, header.value);
      }
    }
    headers.set("content-length", String(length));
    const body = Readable.toWeb(createReadStream2(filePath, { start: offset, end: offset + length - 1 }));
    const init = {
      method,
      headers,
      body,
      duplex: "half"
    };
    let response;
    try {
      response = await fetchImpl(new Request(url, init));
    } catch (error) {
      if (isAbortError2(error)) {
        throw error;
      }
      if (attempt < retry.maxAttempts) {
        await retry.sleep(retry.backoffDelayMs(attempt));
        continue;
      }
      throw new AscFileProcessingError(`Uploading to ${target} failed at the network level after ${String(attempt)} attempt(s): ${messageOf2(error)}`, "transfer", { target, cause: error });
    }
    if ((response.status === 429 || response.status >= 500) && attempt < retry.maxAttempts) {
      await response.body?.cancel().catch(() => void 0);
      await retry.sleep(retry.backoffDelayMs(attempt));
      continue;
    }
    await response.body?.cancel().catch(() => void 0);
    if (!response.ok) {
      throw new AscFileProcessingError(`Uploading to ${target} failed with HTTP ${String(response.status)}`, "transfer", { target, request: { method, url: target, status: response.status } });
    }
    return length;
  }
}
async function uploadFileParts(filePath, operations, options = {}) {
  if (operations.length === 0) {
    throw new AscUpstreamError("Apple's reservation returned no upload operations; there is nothing to upload.");
  }
  const fetchImpl = options.fetch ?? ((request) => globalThis.fetch(request));
  const maxAttempts = options.retry?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.retry?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.retry?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const sleep = options.retry?.sleep ?? defaultSleep2;
  const random = options.retry?.random ?? Math.random;
  const retry = {
    maxAttempts,
    // AWS-style full jitter, identical to the transport layer's policy.
    backoffDelayMs: (attempt) => random() * Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)),
    sleep
  };
  let bytesTransferred = 0;
  for (const operation of operations) {
    bytesTransferred += await transferPart(filePath, operation, fetchImpl, retry);
  }
  return { operationCount: operations.length, bytesTransferred };
}
var init_media_files = __esm({
  "dist/workflows/media-files.js"() {
    "use strict";
    init_errors();
    init_transport();
  }
});

// dist/workflows/media-assets.js
import { basename as basename2 } from "node:path";
async function resolveLocalization(client, versionId, locale) {
  const read = await listAppStoreVersionLocalizations(client, versionId, {
    scope: "all-pages",
    locale: [locale]
  });
  const match = read.items[0];
  if (match === void 0) {
    const all = await listAppStoreVersionLocalizations(client, versionId, {
      scope: "all-pages"
    });
    const locales = all.items.flatMap((item) => item.attributes?.locale === void 0 ? [] : [item.attributes.locale]);
    throw new AscNotFoundError(`Version ${versionId} has no "${locale}" localization.${locales.length > 0 ? ` Available locales: ${locales.join(", ")}.` : " It has no localizations yet \u2014 add one with 'asc metadata version add-locale'."}`);
  }
  return {
    localizationId: match.id,
    locale: match.attributes?.locale ?? locale,
    localization: match
  };
}
async function ensureScreenshotSet(client, localizationId, displayType) {
  const existing = await listAppScreenshotSets(client, localizationId, {
    scope: "all-pages"
  });
  const match = existing.items.find((set) => set.attributes?.screenshotDisplayType === displayType);
  if (match !== void 0) {
    return { set: match, created: false };
  }
  const created = await createAppScreenshotSet(client, localizationId, displayType);
  return { set: created.data, created: true };
}
async function ensurePreviewSet(client, localizationId, previewType) {
  const existing = await listAppPreviewSets(client, localizationId, {
    scope: "all-pages"
  });
  const match = existing.items.find((set) => set.attributes?.previewType === previewType);
  if (match !== void 0) {
    return { set: match, created: false };
  }
  const created = await createAppPreviewSet(client, localizationId, previewType);
  return { set: created.data, created: true };
}
async function defaultSleep3(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
function formatStateErrors(errors) {
  if (errors.length === 0) {
    return "no error detail was provided by Apple";
  }
  return errors.map((error) => `${error.code ?? "?"}: ${error.description ?? "?"}`).join("; ");
}
function pollTuning(kind, options) {
  const intervalMs = options.pollIntervalMs ?? (kind === "preview" ? 5e3 : 2e3);
  const timeoutMs = options.pollTimeoutMs ?? (kind === "preview" ? 6e5 : 6e4);
  return {
    intervalMs,
    maxAttempts: Math.max(1, Math.ceil(timeoutMs / intervalMs)),
    sleep: options.sleep ?? defaultSleep3
  };
}
async function pollUntilTerminal(ops, assetId, initial, initialClassification, options) {
  let resource = initial;
  let classification = initialClassification;
  if (options.wait === false) {
    return { resource, classification, pollTimedOut: false };
  }
  const { intervalMs, maxAttempts, sleep } = pollTuning(ops.kind, options);
  let attempt = 0;
  while (classification.state === "pending" && attempt < maxAttempts) {
    await sleep(intervalMs);
    resource = await ops.get(assetId);
    classification = ops.extract(resource).classification;
    attempt += 1;
  }
  return {
    resource,
    classification,
    pollTimedOut: classification.state === "pending"
  };
}
function inferPreviewMimeType(fileName) {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) {
    return void 0;
  }
  return PREVIEW_MIME_BY_EXTENSION[fileName.slice(dot).toLowerCase()];
}
async function runMediaUpload(ops, setId, filePath, options) {
  const fileMeta = await readUploadFileMetadata(filePath);
  const md5 = await computeFileMd5(filePath);
  const reserved = await ops.reserve(setId, fileMeta);
  const reservedInfo = ops.extract(reserved);
  const operations = reservedInfo.uploadOperations;
  if (operations === void 0 || operations.length === 0) {
    throw new AscUpstreamError(`Apple reserved ${ops.kind} ${reservedInfo.id} but returned no upload operations; cannot upload.`);
  }
  const transfer = await uploadFileParts(filePath, operations, options.transfer ?? {});
  const committed = await ops.commit(reservedInfo.id, md5);
  const polled = await pollUntilTerminal(ops, reservedInfo.id, committed, ops.extract(committed).classification, options);
  if (polled.classification.state === "failed") {
    throw new AscFileProcessingError(`Apple's processing of ${ops.kind} ${reservedInfo.id} reported FAILED: ${formatStateErrors(polled.classification.errors)}`, "processing", { target: reservedInfo.id });
  }
  return {
    assetId: reservedInfo.id,
    fileName: fileMeta.fileName,
    fileSize: fileMeta.fileSize,
    md5,
    operationCount: transfer.operationCount,
    bytesTransferred: transfer.bytesTransferred,
    resource: polled.resource,
    finalState: polled.classification.detail,
    complete: polled.classification.state === "complete",
    pollTimedOut: polled.pollTimedOut
  };
}
function classifyScreenshot(resource) {
  const delivery = readScreenshotDeliveryState(resource);
  const state = delivery?.state;
  if (state === "FAILED") {
    return {
      state: "failed",
      errors: delivery?.errors ?? [],
      detail: "assetDeliveryState FAILED"
    };
  }
  if (state === "COMPLETE") {
    return { state: "complete", errors: [], detail: "COMPLETE" };
  }
  return {
    state: "pending",
    errors: [],
    detail: `assetDeliveryState ${state ?? "UNKNOWN"}`
  };
}
function classifyPreview(resource) {
  const { asset, video } = readPreviewDeliveryStates(resource);
  if (asset?.state === "FAILED") {
    return {
      state: "failed",
      errors: asset.errors ?? [],
      detail: "assetDeliveryState FAILED"
    };
  }
  if (video?.state === "FAILED") {
    return {
      state: "failed",
      errors: video.errors ?? [],
      detail: "videoDeliveryState FAILED"
    };
  }
  if (asset?.state === "COMPLETE" && video?.state === "COMPLETE") {
    return { state: "complete", errors: [], detail: "COMPLETE" };
  }
  return {
    state: "pending",
    errors: [],
    detail: `asset ${asset?.state ?? "UNKNOWN"} / video ${video?.state ?? "UNKNOWN"}`
  };
}
function screenshotOps(client) {
  return {
    kind: "screenshot",
    reserve: (setId, fileMeta) => reserveAppScreenshot(client, setId, {
      fileName: fileMeta.fileName,
      fileSize: fileMeta.fileSize
    }),
    commit: (assetId, md5) => commitAppScreenshot(client, assetId, {
      uploaded: true,
      sourceFileChecksum: md5
    }),
    get: (assetId) => getAppScreenshot(client, assetId),
    extract: (resource) => ({
      id: resource.data.id,
      uploadOperations: resource.data.attributes?.uploadOperations,
      classification: classifyScreenshot(resource)
    })
  };
}
function previewOps(client, extras) {
  return {
    kind: "preview",
    reserve: (setId, fileMeta) => reserveAppPreview(client, setId, {
      fileName: fileMeta.fileName,
      fileSize: fileMeta.fileSize,
      ...extras.mimeType !== void 0 && { mimeType: extras.mimeType },
      ...extras.previewFrameTimeCode !== void 0 && {
        previewFrameTimeCode: extras.previewFrameTimeCode
      }
    }),
    commit: (assetId, md5) => commitAppPreview(client, assetId, {
      uploaded: true,
      sourceFileChecksum: md5
    }),
    get: (assetId) => getAppPreview(client, assetId),
    extract: (resource) => ({
      id: resource.data.id,
      uploadOperations: resource.data.attributes?.uploadOperations,
      classification: classifyPreview(resource)
    })
  };
}
function uploadScreenshot(client, setId, filePath, options = {}) {
  return runMediaUpload(screenshotOps(client), setId, filePath, options);
}
function uploadPreview(client, setId, filePath, options = {}) {
  const { mimeType, previewFrameTimeCode, ...uploadOptions } = options;
  const resolvedMimeType = mimeType ?? inferPreviewMimeType(basename2(filePath));
  return runMediaUpload(previewOps(client, {
    ...resolvedMimeType !== void 0 && { mimeType: resolvedMimeType },
    ...previewFrameTimeCode !== void 0 && { previewFrameTimeCode }
  }), setId, filePath, uploadOptions);
}
async function runStatus(ops, assetId, options) {
  const current = await ops.get(assetId);
  const polled = await pollUntilTerminal(
    ops,
    assetId,
    current,
    ops.extract(current).classification,
    // A status read is one-shot unless the caller explicitly opts into waiting.
    { ...options, wait: options.wait ?? false }
  );
  return {
    assetId,
    finalState: polled.classification.detail,
    complete: polled.classification.state === "complete",
    failed: polled.classification.state === "failed",
    errors: polled.classification.errors,
    resource: polled.resource,
    pollTimedOut: polled.pollTimedOut
  };
}
function getScreenshotStatus(client, assetId, options = {}) {
  return runStatus(screenshotOps(client), assetId, options);
}
function getPreviewStatus(client, assetId, options = {}) {
  return runStatus(previewOps(client, {}), assetId, options);
}
async function batchLeadingOrder(batchIds, listMemberIds) {
  const current = await listMemberIds();
  const batch = new Set(batchIds);
  return [...batchIds, ...current.filter((id) => !batch.has(id))];
}
async function uploadScreenshotSet(client, localizationId, displayType, filePaths, options = {}) {
  const ensured = await ensureScreenshotSet(client, localizationId, displayType);
  const setId = ensured.set.id;
  const uploads = [];
  for (const filePath of filePaths) {
    uploads.push(await uploadScreenshot(client, setId, filePath, options));
  }
  if (options.reorder !== true) {
    return { setId, setCreated: ensured.created, uploads };
  }
  const order = await batchLeadingOrder(uploads.map((upload) => upload.assetId), () => listAppScreenshots(client, setId, { scope: "all-pages" }).then((read) => read.items.map((item) => item.id)));
  await reorderAppScreenshots(client, setId, order);
  return { setId, setCreated: ensured.created, uploads, order };
}
async function uploadPreviewSet(client, localizationId, previewType, filePaths, options = {}) {
  const ensured = await ensurePreviewSet(client, localizationId, previewType);
  const setId = ensured.set.id;
  const uploads = [];
  for (const filePath of filePaths) {
    uploads.push(await uploadPreview(client, setId, filePath, options));
  }
  if (options.reorder !== true) {
    return { setId, setCreated: ensured.created, uploads };
  }
  const order = await batchLeadingOrder(uploads.map((upload) => upload.assetId), () => listAppPreviews(client, setId, { scope: "all-pages" }).then((read) => read.items.map((item) => item.id)));
  await reorderAppPreviews(client, setId, order);
  return { setId, setCreated: ensured.created, uploads, order };
}
var PREVIEW_MIME_BY_EXTENSION;
var init_media_assets = __esm({
  "dist/workflows/media-assets.js"() {
    "use strict";
    init_app_screenshots();
    init_app_previews();
    init_app_store_version_localizations();
    init_errors();
    init_media_files();
    PREVIEW_MIME_BY_EXTENSION = {
      ".mov": "video/quicktime",
      ".mp4": "video/mp4",
      ".m4v": "video/x-m4v"
    };
  }
});

// dist/capabilities/testflight-feedback.js
function listCrashFeedback(client, appId, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.build !== void 0 && { "filter[build]": [...options.build] },
    ...options.tester !== void 0 && {
      "filter[tester]": [...options.tester]
    },
    ...options.deviceModel !== void 0 && {
      "filter[deviceModel]": [...options.deviceModel]
    },
    ...options.osVersion !== void 0 && {
      "filter[osVersion]": [...options.osVersion]
    },
    ...options.sort !== void 0 && { sort: options.sort }
  };
  return readPaged(client, "/v1/apps/{id}/betaFeedbackCrashSubmissions", { params: { path: { id: appId }, query } }, options.scope, options.pagination);
}
async function getCrashFeedback(client, submissionId, options = {}) {
  const query = {
    ...options.include !== void 0 && { include: options.include }
  };
  const { data } = await client.GET("/v1/betaFeedbackCrashSubmissions/{id}", {
    params: { path: { id: submissionId }, query }
  });
  return expectDocument(data);
}
async function getCrashLog(client, submissionId) {
  const { data } = await client.GET("/v1/betaFeedbackCrashSubmissions/{id}/crashLog", { params: { path: { id: submissionId } } });
  return expectDocument(data);
}
function listScreenshotFeedback(client, appId, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.build !== void 0 && { "filter[build]": [...options.build] },
    ...options.tester !== void 0 && {
      "filter[tester]": [...options.tester]
    },
    ...options.deviceModel !== void 0 && {
      "filter[deviceModel]": [...options.deviceModel]
    },
    ...options.osVersion !== void 0 && {
      "filter[osVersion]": [...options.osVersion]
    },
    ...options.sort !== void 0 && { sort: options.sort }
  };
  return readPaged(client, "/v1/apps/{id}/betaFeedbackScreenshotSubmissions", { params: { path: { id: appId }, query } }, options.scope, options.pagination);
}
async function getScreenshotFeedback(client, submissionId, options = {}) {
  const query = {
    ...options.include !== void 0 && { include: options.include }
  };
  const { data } = await client.GET("/v1/betaFeedbackScreenshotSubmissions/{id}", { params: { path: { id: submissionId }, query } });
  return expectDocument(data);
}
var init_testflight_feedback = __esm({
  "dist/capabilities/testflight-feedback.js"() {
    "use strict";
    init_internal();
    init_paginate();
  }
});

// dist/workflows/feedback-files.js
import { mkdir as mkdir2, writeFile } from "node:fs/promises";
import { join as join2 } from "node:path";
import { gunzipSync } from "node:zlib";
function messageOf3(error) {
  return error instanceof Error ? error.message : String(error);
}
function sanitizeScreenshotUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch {
    return void 0;
  }
}
function screenshotExtension(url) {
  try {
    const parsed = new URL(url);
    const match = IMAGE_EXTENSION_BY_PATH.exec(parsed.pathname);
    const captured = match?.[1];
    if (captured !== void 0) {
      return captured.toLowerCase().replace("jpeg", "jpg");
    }
  } catch {
  }
  return "png";
}
function screenshotFileName(submissionId, index, url) {
  return `screenshot-${submissionId}-${String(index).padStart(2, "0")}.${screenshotExtension(url)}`;
}
async function ensureDir(dir) {
  try {
    await mkdir2(dir, { recursive: true });
  } catch (error) {
    throw new AscFileProcessingError(`Creating the output directory ${dir} failed: ${messageOf3(error)}`, "write", { target: dir, cause: error });
  }
}
async function downloadScreenshotFeedbackAttachments(client, submissionId, outputDir, options = {}) {
  const submission = await getScreenshotFeedback(client, submissionId);
  const images = submission.data.attributes?.screenshots ?? [];
  if (images.length === 0) {
    throw new AscNotFoundError(`Screenshot feedback ${submissionId} carries no screenshots.`);
  }
  await ensureDir(outputDir);
  const saved = [];
  for (const [index, image] of images.entries()) {
    const { url } = image;
    if (url === void 0) {
      throw new AscFileProcessingError(`Screenshot ${String(index)} of feedback ${submissionId} carries no URL.`, "download");
    }
    const sanitizedUrl = sanitizeScreenshotUrl(url);
    if (image.expirationDate !== void 0) {
      const expiresAt = Date.parse(image.expirationDate);
      if (!Number.isNaN(expiresAt) && expiresAt <= Date.now()) {
        saved.push({
          skipped: true,
          reason: `signed URL expired at ${image.expirationDate}`,
          ...image.width !== void 0 && { width: image.width },
          ...image.height !== void 0 && { height: image.height },
          expirationDate: image.expirationDate,
          ...sanitizedUrl !== void 0 && { sanitizedUrl }
        });
        continue;
      }
    }
    const fileName = screenshotFileName(submissionId, index, url);
    const filePath = join2(outputDir, fileName);
    const result = await downloadExternalBinaryFile(url, filePath, {
      ...options.retry !== void 0 && { retry: options.retry }
    });
    saved.push({
      path: result.path,
      bytesWritten: result.bytesWritten,
      ...image.width !== void 0 && { width: image.width },
      ...image.height !== void 0 && { height: image.height },
      ...image.expirationDate !== void 0 && {
        expirationDate: image.expirationDate
      },
      ...sanitizedUrl !== void 0 && { sanitizedUrl }
    });
  }
  return saved;
}
function decodeCrashLog(logText) {
  const looksBase64 = logText.length > 0 && logText.length % 4 === 0 && !logText.includes("\n") && /^[A-Za-z0-9+/]+={0,2}$/.test(logText);
  if (looksBase64) {
    const decoded = Buffer.from(logText, "base64");
    if (decoded[0] === 31 && decoded[1] === 139) {
      try {
        return gunzipSync(decoded);
      } catch {
        return Buffer.from(logText, "utf8");
      }
    }
    const reEncoded = decoded.toString("base64").replace(/=+$/, "");
    if (reEncoded === logText.replace(/=+$/, "")) {
      const utf8 = decoded.toString("utf8");
      if (!utf8.includes("\uFFFD")) {
        return Buffer.from(utf8, "utf8");
      }
    }
  }
  return Buffer.from(logText, "utf8");
}
async function downloadCrashFeedbackLog(client, submissionId, outputDir) {
  const log = await getCrashLog(client, submissionId);
  const logText = log.data.attributes?.logText;
  if (logText === void 0 || logText === "") {
    throw new AscNotFoundError(`Crash feedback ${submissionId} has no crash log text.`);
  }
  await ensureDir(outputDir);
  const bytes = decodeCrashLog(logText);
  const filePath = join2(outputDir, `crash-${submissionId}.crash`);
  try {
    await writeFile(filePath, bytes);
  } catch (error) {
    throw new AscFileProcessingError(`Writing the crash log ${filePath} failed: ${messageOf3(error)}`, "write", { target: filePath, cause: error });
  }
  return { path: filePath, bytesWritten: bytes.length };
}
async function resolveSubmissions(client, target) {
  if (target.id !== void 0) {
    if (target.kind === void 0) {
      throw new AscFileProcessingError("A single feedback id requires its kind (crash or screenshot).", "download");
    }
    return [{ id: target.id, kind: target.kind }];
  }
  if (target.appId === void 0) {
    throw new AscFileProcessingError("Provide either a submission id (+ kind) or an appId to enumerate.", "download");
  }
  const kinds = target.kinds ?? ["crash", "screenshot"];
  const scope = target.scope ?? "single-page";
  const listOptions = target.listOptions ?? {};
  const resolved = [];
  if (kinds.includes("crash")) {
    const crashes = await listCrashFeedback(client, target.appId, {
      ...listOptions,
      scope
    });
    for (const item of crashes.items) {
      resolved.push({ id: item.id, kind: "crash" });
    }
  }
  if (kinds.includes("screenshot")) {
    const shots = await listScreenshotFeedback(client, target.appId, {
      ...listOptions,
      scope
    });
    for (const item of shots.items) {
      resolved.push({ id: item.id, kind: "screenshot" });
    }
  }
  return resolved;
}
async function downloadFeedbackAttachments(client, target, outputDir, options = {}) {
  const submissions = await resolveSubmissions(client, target);
  const items = [];
  let totalFiles = 0;
  let totalBytes = 0;
  for (const submission of submissions) {
    try {
      if (submission.kind === "screenshot") {
        const saved = await downloadScreenshotFeedbackAttachments(client, submission.id, outputDir, options);
        const written = saved.filter((file) => file.skipped !== true);
        totalFiles += written.length;
        totalBytes += written.reduce((sum, file) => sum + (file.bytesWritten ?? 0), 0);
        items.push({
          id: submission.id,
          kind: "screenshot",
          savedFiles: saved,
          // A submission whose only images were all skipped lands nothing.
          skipped: written.length === 0
        });
      } else {
        const saved = await downloadCrashFeedbackLog(client, submission.id, outputDir);
        totalFiles += 1;
        totalBytes += saved.bytesWritten;
        items.push({
          id: submission.id,
          kind: "crash",
          // A crash log is recorded as a screenshot-shaped file entry (path +
          // bytes) so the summary has a single uniform savedFiles shape.
          savedFiles: [{ path: saved.path, bytesWritten: saved.bytesWritten }],
          skipped: false
        });
      }
    } catch (error) {
      if (error instanceof AscNotFoundError) {
        items.push({
          id: submission.id,
          kind: submission.kind,
          savedFiles: [],
          skipped: true
        });
        continue;
      }
      items.push({
        id: submission.id,
        kind: submission.kind,
        savedFiles: [],
        skipped: false,
        error: messageOf3(error)
      });
    }
  }
  return {
    submissions: items,
    totals: { files: totalFiles, bytes: totalBytes }
  };
}
var IMAGE_EXTENSION_BY_PATH;
var init_feedback_files = __esm({
  "dist/workflows/feedback-files.js"() {
    "use strict";
    init_testflight_feedback();
    init_errors();
    init_report_files();
    IMAGE_EXTENSION_BY_PATH = /\.(png|jpe?g|heic|heif|gif|webp)$/i;
  }
});

// dist/capabilities/review-submissions.js
function listReviewSubmissions(client, options) {
  const query = {
    "filter[app]": [options.appId],
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.platform !== void 0 && {
      "filter[platform]": options.platform
    },
    ...options.state !== void 0 && { "filter[state]": options.state },
    ...options.include !== void 0 && { include: options.include },
    ...options.fields !== void 0 && {
      "fields[reviewSubmissions]": options.fields
    }
  };
  return readPaged(client, "/v1/reviewSubmissions", { params: { query } }, options.scope, options.pagination);
}
async function getReviewSubmission(client, submissionId, options = {}) {
  const query = {
    ...options.include !== void 0 && { include: options.include },
    ...options.fields !== void 0 && {
      "fields[reviewSubmissions]": options.fields
    },
    ...options.itemFields !== void 0 && {
      "fields[reviewSubmissionItems]": options.itemFields
    }
  };
  const { data } = await client.GET("/v1/reviewSubmissions/{id}", {
    params: { path: { id: submissionId }, query }
  });
  return expectDocument(data);
}
async function createReviewSubmission(client, appId, platform) {
  const { data } = await client.POST("/v1/reviewSubmissions", {
    body: {
      data: {
        type: "reviewSubmissions",
        ...platform !== void 0 && { attributes: { platform } },
        relationships: {
          app: { data: { type: "apps", id: appId } }
        }
      }
    }
  });
  return expectDocument(data);
}
async function updateReviewSubmission(client, submissionId, attributes) {
  const { data } = await client.PATCH("/v1/reviewSubmissions/{id}", {
    params: { path: { id: submissionId } },
    body: {
      data: { type: "reviewSubmissions", id: submissionId, attributes }
    }
  });
  return expectDocument(data);
}
async function createReviewSubmissionItem(client, reviewSubmissionId, content) {
  const present = CONTENT_RELATIONSHIP_KEYS.filter((key) => content[key] !== void 0);
  if (present.length !== 1) {
    throw new AscInvalidParameterError(`A review submission item requires exactly one content relationship; got ${String(present.length)} (${present.join(", ") || "none"}).`);
  }
  const { data } = await client.POST("/v1/reviewSubmissionItems", {
    body: {
      data: {
        type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: {
            data: { type: "reviewSubmissions", id: reviewSubmissionId }
          },
          ...content.appStoreVersion !== void 0 && {
            appStoreVersion: {
              data: {
                type: "appStoreVersions",
                id: content.appStoreVersion
              }
            }
          }
        }
      }
    }
  });
  return expectDocument(data);
}
async function updateReviewSubmissionItem(client, itemId, attributes) {
  const { data } = await client.PATCH("/v1/reviewSubmissionItems/{id}", {
    params: { path: { id: itemId } },
    body: {
      data: { type: "reviewSubmissionItems", id: itemId, attributes }
    }
  });
  return expectDocument(data);
}
async function deleteReviewSubmissionItem(client, itemId) {
  await client.DELETE("/v1/reviewSubmissionItems/{id}", {
    params: { path: { id: itemId } }
  });
}
function listReviewSubmissionItems(client, reviewSubmissionId, options) {
  const query = {
    ...options.pageLimit !== void 0 && { limit: options.pageLimit },
    ...options.include !== void 0 && { include: options.include },
    ...options.fields !== void 0 && {
      "fields[reviewSubmissionItems]": options.fields
    }
  };
  return readPaged(client, "/v1/reviewSubmissions/{id}/items", { params: { path: { id: reviewSubmissionId }, query } }, options.scope, options.pagination);
}
var CONTENT_RELATIONSHIP_KEYS;
var init_review_submissions = __esm({
  "dist/capabilities/review-submissions.js"() {
    "use strict";
    init_errors();
    init_internal();
    init_paginate();
    CONTENT_RELATIONSHIP_KEYS = ["appStoreVersion"];
  }
});

// dist/capabilities/app-store-review-details.js
async function findAppStoreReviewDetail(client, versionId) {
  const { data } = await client.GET("/v1/appStoreVersions/{id}/appStoreReviewDetail", { params: { path: { id: versionId } } });
  const document = expectDocument(data);
  const resource = document.data;
  return resource ?? void 0;
}
async function getAppStoreReviewDetail(client, versionId) {
  const detail = await findAppStoreReviewDetail(client, versionId);
  if (detail === void 0) {
    throw new AscNotFoundError(`App Store version ${versionId} has no review detail yet.`);
  }
  return detail;
}
async function createAppStoreReviewDetail(client, versionId, attributes) {
  const { data } = await client.POST("/v1/appStoreReviewDetails", {
    body: {
      data: {
        type: "appStoreReviewDetails",
        attributes,
        relationships: {
          appStoreVersion: {
            data: { type: "appStoreVersions", id: versionId }
          }
        }
      }
    }
  });
  return expectDocument(data);
}
async function updateAppStoreReviewDetail(client, detailId, attributes) {
  const { data } = await client.PATCH("/v1/appStoreReviewDetails/{id}", {
    params: { path: { id: detailId } },
    body: {
      data: { type: "appStoreReviewDetails", id: detailId, attributes }
    }
  });
  return expectDocument(data);
}
var init_app_store_review_details = __esm({
  "dist/capabilities/app-store-review-details.js"() {
    "use strict";
    init_errors();
    init_internal();
  }
});

// dist/capabilities/app-store-versions-release.js
async function getAppStoreVersion(client, versionId, options = {}) {
  const query = {
    ...options.include !== void 0 && { include: options.include },
    ...options.fields !== void 0 && {
      "fields[appStoreVersions]": options.fields
    },
    ...options.buildFields !== void 0 && {
      "fields[builds]": options.buildFields
    },
    ...options.reviewDetailFields !== void 0 && {
      "fields[appStoreReviewDetails]": options.reviewDetailFields
    },
    ...options.phasedReleaseFields !== void 0 && {
      "fields[appStoreVersionPhasedReleases]": options.phasedReleaseFields
    }
  };
  const { data } = await client.GET("/v1/appStoreVersions/{id}", {
    params: { path: { id: versionId }, query }
  });
  return expectDocument(data);
}
async function updateAppStoreVersionRelease(client, versionId, config) {
  const attributes = {
    ...config.releaseType !== void 0 && {
      releaseType: config.releaseType
    },
    ...config.earliestReleaseDate !== void 0 && {
      earliestReleaseDate: config.earliestReleaseDate
    },
    ...config.downloadable !== void 0 && {
      downloadable: config.downloadable
    }
  };
  const { data } = await client.PATCH("/v1/appStoreVersions/{id}", {
    params: { path: { id: versionId } },
    body: {
      data: {
        type: "appStoreVersions",
        id: versionId,
        attributes,
        ...config.buildId !== void 0 && {
          relationships: {
            build: { data: { type: "builds", id: config.buildId } }
          }
        }
      }
    }
  });
  return expectDocument(data);
}
async function createAppStoreVersionReleaseRequest(client, versionId) {
  const { data } = await client.POST("/v1/appStoreVersionReleaseRequests", {
    body: {
      data: {
        type: "appStoreVersionReleaseRequests",
        relationships: {
          appStoreVersion: {
            data: { type: "appStoreVersions", id: versionId }
          }
        }
      }
    }
  });
  return expectDocument(data);
}
async function getVersionAppStoreReviewDetail(client, versionId) {
  const { data } = await client.GET("/v1/appStoreVersions/{id}/appStoreReviewDetail", { params: { path: { id: versionId } } });
  return expectDocument(data);
}
async function getVersionReviewSubmission(client, versionId) {
  const { data } = await client.GET("/v1/appStoreVersions/{id}/appStoreVersionSubmission", { params: { path: { id: versionId } } });
  return expectDocument(data);
}
async function getVersionPhasedRelease(client, versionId) {
  const { data } = await client.GET("/v1/appStoreVersions/{id}/appStoreVersionPhasedRelease", { params: { path: { id: versionId } } });
  return expectDocument(data);
}
async function getVersionBuild(client, versionId) {
  const { data } = await client.GET("/v1/appStoreVersions/{id}/build", {
    params: { path: { id: versionId } }
  });
  return expectDocument(data);
}
var init_app_store_versions_release = __esm({
  "dist/capabilities/app-store-versions-release.js"() {
    "use strict";
    init_internal();
  }
});

// dist/capabilities/export-compliance.js
async function setBuildExportCompliance(client, buildId, usesNonExemptEncryption) {
  const { data } = await client.PATCH("/v1/builds/{id}", {
    params: { path: { id: buildId } },
    body: {
      data: {
        type: "builds",
        id: buildId,
        attributes: { usesNonExemptEncryption }
      }
    }
  });
  return expectDocument(data);
}
var init_export_compliance = __esm({
  "dist/capabilities/export-compliance.js"() {
    "use strict";
    init_internal();
  }
});

// dist/capabilities/age-rating.js
async function getAgeRatingDeclaration(client, appId) {
  const { data } = await client.GET("/v1/apps/{id}/appInfos", {
    params: {
      path: { id: appId },
      query: { include: ["ageRatingDeclaration"] }
    }
  });
  const document = expectDocument(data);
  const declaration = document.included?.find((resource) => resource.type === "ageRatingDeclarations");
  if (declaration === void 0) {
    throw new AscNotFoundError(`App ${appId} has no age-rating declaration yet.`);
  }
  return declaration;
}
var init_age_rating = __esm({
  "dist/capabilities/age-rating.js"() {
    "use strict";
    init_errors();
    init_internal();
  }
});

// dist/workflows/submission-assembly.js
async function findContainerHoldingVersion(client, appId, versionId) {
  const containers = await listReviewSubmissions(client, {
    appId,
    scope: "all-pages"
  });
  for (const submission of containers.items) {
    const state = submission.attributes?.state;
    if (state !== void 0 && !UNSUBMITTED_STATES.has(state)) {
      continue;
    }
    const items = await listReviewSubmissionItems(client, submission.id, {
      scope: "all-pages"
    });
    const match = items.items.find((item) => item.relationships?.appStoreVersion?.data?.id === versionId);
    if (match !== void 0) {
      return { submission, item: match };
    }
  }
  return void 0;
}
async function submitVersionForReview(client, appId, versionId, platform) {
  const existing = await findContainerHoldingVersion(client, appId, versionId);
  let submission;
  let item;
  let containerCreated = false;
  let itemCreated = false;
  if (existing !== void 0) {
    submission = existing.submission;
    item = existing.item;
  } else {
    const created = await createReviewSubmission(client, appId, platform);
    submission = created.data;
    containerCreated = true;
    const createdItem = await createReviewSubmissionItem(client, submission.id, {
      appStoreVersion: versionId
    });
    item = createdItem.data;
    itemCreated = true;
  }
  await updateReviewSubmission(client, submission.id, { submitted: true });
  return { submission, item, containerCreated, itemCreated, submitted: true };
}
async function cancelReviewSubmission(client, submissionId) {
  const updated = await updateReviewSubmission(client, submissionId, { canceled: true });
  return { submission: updated.data, canceled: true };
}
async function releaseVersionNow(client, versionId) {
  const created = await createAppStoreVersionReleaseRequest(client, versionId);
  return { releaseRequestId: created.data.id, accepted: true };
}
var UNSUBMITTED_STATES;
var init_submission_assembly = __esm({
  "dist/workflows/submission-assembly.js"() {
    "use strict";
    init_review_submissions();
    init_app_store_versions_release();
    UNSUBMITTED_STATES = /* @__PURE__ */ new Set([
      "READY_FOR_REVIEW",
      "UNRESOLVED_ISSUES"
    ]);
  }
});

// dist/workflows/submission-preflight.js
function attachedBuildId(relationships) {
  return relationships?.build?.data?.id ?? void 0;
}
async function preflightVersionSubmission(client, appId, versionId) {
  const blockers = [];
  const versionResponse = await getAppStoreVersion(client, versionId, {
    include: ["build", "appStoreVersionPhasedRelease"]
  });
  const version = versionResponse.data;
  const appVersionState = version.attributes?.appVersionState;
  const versionEditable = appVersionState !== void 0 && EDITABLE_VERSION_STATES.has(appVersionState);
  if (!versionEditable) {
    blockers.push("VERSION_NOT_EDITABLE");
  }
  const buildId = attachedBuildId(version.relationships);
  let buildProcessingState;
  let buildExportComplianceSet = false;
  if (buildId === void 0) {
    blockers.push("MISSING_BUILD");
  } else {
    const buildResponse = await getBuild(client, buildId);
    const buildAttributes = buildResponse.data.attributes;
    buildProcessingState = buildAttributes?.processingState;
    if (buildProcessingState !== void 0 && buildProcessingState !== "VALID") {
      blockers.push("BUILD_NOT_ELIGIBLE");
    }
    if (buildAttributes?.usesNonExemptEncryption === void 0) {
      blockers.push("BUILD_EXPORT_COMPLIANCE_UNSET");
    } else {
      buildExportComplianceSet = true;
    }
  }
  const reviewDetail = await findAppStoreReviewDetail(client, versionId);
  const hasReviewDetail = reviewDetail !== void 0;
  if (!hasReviewDetail) {
    blockers.push("MISSING_REVIEW_DETAIL");
  }
  let hasAgeRating = false;
  try {
    await getAgeRatingDeclaration(client, appId);
    hasAgeRating = true;
  } catch (error) {
    if (!(error instanceof AscNotFoundError)) {
      throw error;
    }
    blockers.push("MISSING_AGE_RATING");
  }
  const localizations = await listAppStoreVersionLocalizations(client, versionId, { scope: "all-pages" });
  const incompleteLocales = [];
  for (const localization of localizations.items) {
    const attributes = localization.attributes;
    const missing = REQUIRED_LOCALIZATION_FIELDS.some((field) => {
      const value = attributes?.[field];
      return value === void 0 || value === "";
    });
    if (missing) {
      incompleteLocales.push(attributes?.locale ?? localization.id);
    }
  }
  if (localizations.items.length === 0 || incompleteLocales.length > 0) {
    blockers.push("MISSING_LOCALIZATION");
  }
  const phasedResponse = await getVersionPhasedRelease(client, versionId);
  const phasedRelease = phasedResponse.data;
  const snapshot = {
    versionId,
    appId,
    ...version.attributes?.versionString !== void 0 && {
      versionString: version.attributes.versionString
    },
    ...appVersionState !== void 0 && { appVersionState },
    versionEditable,
    ...buildId !== void 0 && { buildId },
    ...buildProcessingState !== void 0 && { buildProcessingState },
    buildExportComplianceSet,
    hasReviewDetail,
    hasAgeRating,
    localizationCount: localizations.items.length,
    incompleteLocales,
    ...phasedRelease?.attributes?.phasedReleaseState !== void 0 && {
      phasedReleaseState: phasedRelease.attributes.phasedReleaseState
    },
    ...phasedRelease?.attributes?.currentDayNumber !== void 0 && {
      phasedReleaseCurrentDayNumber: phasedRelease.attributes.currentDayNumber
    }
  };
  return { submittable: blockers.length === 0, blockers, snapshot };
}
var EDITABLE_VERSION_STATES, REQUIRED_LOCALIZATION_FIELDS;
var init_submission_preflight = __esm({
  "dist/workflows/submission-preflight.js"() {
    "use strict";
    init_app_store_versions_release();
    init_app_store_review_details();
    init_age_rating();
    init_builds();
    init_app_store_version_localizations();
    init_errors();
    EDITABLE_VERSION_STATES = /* @__PURE__ */ new Set([
      "PREPARE_FOR_SUBMISSION",
      "WAITING_FOR_EXPORT_COMPLIANCE",
      "READY_FOR_REVIEW"
    ]);
    REQUIRED_LOCALIZATION_FIELDS = ["description", "keywords"];
  }
});

// dist/index.js
var index_exports = {};
__export(index_exports, {
  ASC_API_BASE_URL: () => ASC_API_BASE_URL,
  ASC_ENV_VARS: () => ASC_ENV_VARS,
  ASC_TOKEN_AUDIENCE: () => ASC_TOKEN_AUDIENCE,
  AscAuthenticationError: () => AscAuthenticationError,
  AscCredentialError: () => AscCredentialError,
  AscError: () => AscError,
  AscFileProcessingError: () => AscFileProcessingError,
  AscInvalidParameterError: () => AscInvalidParameterError,
  AscNetworkError: () => AscNetworkError,
  AscNotFoundError: () => AscNotFoundError,
  AscPermissionError: () => AscPermissionError,
  AscRateLimitError: () => AscRateLimitError,
  AscRateLimitFloorError: () => AscRateLimitFloorError,
  AscTokenProvider: () => AscTokenProvider,
  AscUpstreamError: () => AscUpstreamError,
  DEFAULT_LINKAGE_BATCH_SIZE: () => DEFAULT_LINKAGE_BATCH_SIZE,
  DEFAULT_RATE_LIMIT_FLOOR: () => DEFAULT_RATE_LIMIT_FLOOR,
  IAT_BACKDATE_SECONDS: () => IAT_BACKDATE_SECONDS,
  REFRESH_SAFETY_MARGIN_SECONDS: () => REFRESH_SAFETY_MARGIN_SECONDS,
  TOKEN_LIFETIME_SECONDS: () => TOKEN_LIFETIME_SECONDS,
  addIndividualTesters: () => addIndividualTesters,
  addTestersToGroup: () => addTestersToGroup,
  analyticsSegmentFileName: () => analyticsSegmentFileName,
  assignBuildToBetaGroups: () => assignBuildToBetaGroups,
  bulkAddTestersToGroup: () => bulkAddTestersToGroup,
  cancelReviewSubmission: () => cancelReviewSubmission,
  checkRecruitmentCompatibleBuild: () => checkRecruitmentCompatibleBuild,
  clearRecruitmentCriteria: () => clearRecruitmentCriteria,
  commitAppPreview: () => commitAppPreview,
  commitAppScreenshot: () => commitAppScreenshot,
  computeFileMd5: () => computeFileMd5,
  convertDelimitedReportToJson: () => convertDelimitedReportToJson,
  createAnalyticsReportRequest: () => createAnalyticsReportRequest,
  createAppInfoLocalization: () => createAppInfoLocalization,
  createAppPreviewSet: () => createAppPreviewSet,
  createAppScreenshotSet: () => createAppScreenshotSet,
  createAppStoreReviewDetail: () => createAppStoreReviewDetail,
  createAppStoreVersionLocalization: () => createAppStoreVersionLocalization,
  createAppStoreVersionReleaseRequest: () => createAppStoreVersionReleaseRequest,
  createAscClient: () => createAscClient,
  createBetaAppLocalization: () => createBetaAppLocalization,
  createBetaBuildLocalization: () => createBetaBuildLocalization,
  createBetaGroup: () => createBetaGroup,
  createBetaTester: () => createBetaTester,
  createRetryingFetch: () => createRetryingFetch,
  createReviewSubmission: () => createReviewSubmission,
  createReviewSubmissionItem: () => createReviewSubmissionItem,
  defaultAnalyticsReportDirName: () => defaultAnalyticsReportDirName,
  defaultFinanceReportFileName: () => defaultFinanceReportFileName,
  defaultSalesReportFileName: () => defaultSalesReportFileName,
  deleteAnalyticsReportRequest: () => deleteAnalyticsReportRequest,
  deleteAppPreview: () => deleteAppPreview,
  deleteAppPreviewSet: () => deleteAppPreviewSet,
  deleteAppScreenshot: () => deleteAppScreenshot,
  deleteAppScreenshotSet: () => deleteAppScreenshotSet,
  deleteBetaAppLocalization: () => deleteBetaAppLocalization,
  deleteBetaBuildLocalization: () => deleteBetaBuildLocalization,
  deleteBetaGroup: () => deleteBetaGroup,
  deleteBetaTester: () => deleteBetaTester,
  deleteReviewSubmissionItem: () => deleteReviewSubmissionItem,
  downloadAnalyticsInstance: () => downloadAnalyticsInstance,
  downloadAnalyticsReport: () => downloadAnalyticsReport,
  downloadCrashFeedbackLog: () => downloadCrashFeedbackLog,
  downloadExternalBinaryFile: () => downloadExternalBinaryFile,
  downloadExternalFile: () => downloadExternalFile,
  downloadFeedbackAttachments: () => downloadFeedbackAttachments,
  downloadFinanceReport: () => downloadFinanceReport,
  downloadSalesReport: () => downloadSalesReport,
  downloadScreenshotFeedbackAttachments: () => downloadScreenshotFeedbackAttachments,
  ensureAnalyticsReportRequest: () => ensureAnalyticsReportRequest,
  ensureBetaGroup: () => ensureBetaGroup,
  ensurePreviewSet: () => ensurePreviewSet,
  ensureScreenshotSet: () => ensureScreenshotSet,
  expireBuild: () => expireBuild,
  findAppStoreReviewDetail: () => findAppStoreReviewDetail,
  findBetaAppReviewDetail: () => findBetaAppReviewDetail,
  findLatestProcessedBuild: () => findLatestProcessedBuild,
  findRecruitmentCriterionId: () => findRecruitmentCriterionId,
  getAgeRatingDeclaration: () => getAgeRatingDeclaration,
  getAnalyticsReportRequest: () => getAnalyticsReportRequest,
  getApp: () => getApp,
  getAppInfo: () => getAppInfo,
  getAppInfoLocalization: () => getAppInfoLocalization,
  getAppPreview: () => getAppPreview,
  getAppScreenshot: () => getAppScreenshot,
  getAppStoreReviewDetail: () => getAppStoreReviewDetail,
  getAppStoreVersion: () => getAppStoreVersion,
  getAppStoreVersionLocalization: () => getAppStoreVersionLocalization,
  getBetaAppReviewDetail: () => getBetaAppReviewDetail,
  getBetaAppReviewSubmission: () => getBetaAppReviewSubmission,
  getBetaGroup: () => getBetaGroup,
  getBetaTester: () => getBetaTester,
  getBuild: () => getBuild,
  getBuildBetaAppReviewSubmission: () => getBuildBetaAppReviewSubmission,
  getBuildBetaDetail: () => getBuildBetaDetail,
  getCrashFeedback: () => getCrashFeedback,
  getCrashLog: () => getCrashLog,
  getCustomerReview: () => getCustomerReview,
  getCustomerReviewResponse: () => getCustomerReviewResponse,
  getPreReleaseVersion: () => getPreReleaseVersion,
  getPreviewStatus: () => getPreviewStatus,
  getReviewSubmission: () => getReviewSubmission,
  getScreenshotFeedback: () => getScreenshotFeedback,
  getScreenshotStatus: () => getScreenshotStatus,
  getVersionAppStoreReviewDetail: () => getVersionAppStoreReviewDetail,
  getVersionBuild: () => getVersionBuild,
  getVersionPhasedRelease: () => getVersionPhasedRelease,
  getVersionReviewSubmission: () => getVersionReviewSubmission,
  inferPreviewMimeType: () => inferPreviewMimeType,
  isGzipMagic: () => isGzipMagic,
  jsonSiblingPath: () => jsonSiblingPath,
  listAnalyticsReportInstances: () => listAnalyticsReportInstances,
  listAnalyticsReportRequests: () => listAnalyticsReportRequests,
  listAnalyticsReportSegments: () => listAnalyticsReportSegments,
  listAnalyticsReports: () => listAnalyticsReports,
  listAppInfoLocalizations: () => listAppInfoLocalizations,
  listAppInfos: () => listAppInfos,
  listAppPreviewSets: () => listAppPreviewSets,
  listAppPreviews: () => listAppPreviews,
  listAppScreenshotSets: () => listAppScreenshotSets,
  listAppScreenshots: () => listAppScreenshots,
  listAppStoreVersionLocalizations: () => listAppStoreVersionLocalizations,
  listAppStoreVersions: () => listAppStoreVersions,
  listApps: () => listApps,
  listBetaAppLocalizations: () => listBetaAppLocalizations,
  listBetaAppReviewSubmissions: () => listBetaAppReviewSubmissions,
  listBetaBuildLocalizations: () => listBetaBuildLocalizations,
  listBetaGroups: () => listBetaGroups,
  listBetaTesters: () => listBetaTesters,
  listBuildIndividualTesters: () => listBuildIndividualTesters,
  listBuilds: () => listBuilds,
  listCrashFeedback: () => listCrashFeedback,
  listCustomerReviewsForApp: () => listCustomerReviewsForApp,
  listCustomerReviewsForVersion: () => listCustomerReviewsForVersion,
  listGroupBuilds: () => listGroupBuilds,
  listGroupTesters: () => listGroupTesters,
  listPreReleaseVersionBuilds: () => listPreReleaseVersionBuilds,
  listPreReleaseVersions: () => listPreReleaseVersions,
  listRecruitmentCriterionOptions: () => listRecruitmentCriterionOptions,
  listReviewSubmissionItems: () => listReviewSubmissionItems,
  listReviewSubmissions: () => listReviewSubmissions,
  listScreenshotFeedback: () => listScreenshotFeedback,
  loadAscCredentialsFromEnv: () => loadAscCredentialsFromEnv,
  paginate: () => paginate,
  parseRateLimitHeader: () => parseRateLimitHeader,
  preflightVersionSubmission: () => preflightVersionSubmission,
  readPaged: () => readPaged,
  readRecruitmentCriteria: () => readRecruitmentCriteria,
  readUploadFileMetadata: () => readUploadFileMetadata,
  releaseVersionNow: () => releaseVersionNow,
  removeBuildFromBetaGroups: () => removeBuildFromBetaGroups,
  removeIndividualTesters: () => removeIndividualTesters,
  removeTesterFromApp: () => removeTesterFromApp,
  removeTestersFromGroup: () => removeTestersFromGroup,
  reorderAppPreviews: () => reorderAppPreviews,
  reorderAppScreenshots: () => reorderAppScreenshots,
  reserveAppPreview: () => reserveAppPreview,
  reserveAppScreenshot: () => reserveAppScreenshot,
  resolveLocalization: () => resolveLocalization,
  saveBinaryStream: () => saveBinaryStream,
  saveReportStream: () => saveReportStream,
  setBetaAppReviewDetail: () => setBetaAppReviewDetail,
  setBuildExportCompliance: () => setBuildExportCompliance,
  setCustomerReviewResponse: () => setCustomerReviewResponse,
  setPublicLink: () => setPublicLink,
  setRecruitmentCriteria: () => setRecruitmentCriteria,
  signAscToken: () => signAscToken,
  submitBuildForBetaReview: () => submitBuildForBetaReview,
  submitVersionForReview: () => submitVersionForReview,
  updateAppInfoLocalization: () => updateAppInfoLocalization,
  updateAppStoreReviewDetail: () => updateAppStoreReviewDetail,
  updateAppStoreVersionLocalization: () => updateAppStoreVersionLocalization,
  updateAppStoreVersionRelease: () => updateAppStoreVersionRelease,
  updateBetaAppLocalization: () => updateBetaAppLocalization,
  updateBetaAppReviewDetail: () => updateBetaAppReviewDetail,
  updateBetaBuildLocalization: () => updateBetaBuildLocalization,
  updateBetaGroup: () => updateBetaGroup,
  updateBuildBetaDetail: () => updateBuildBetaDetail,
  updateReviewSubmission: () => updateReviewSubmission,
  updateReviewSubmissionItem: () => updateReviewSubmissionItem,
  uploadFileParts: () => uploadFileParts,
  uploadPreview: () => uploadPreview,
  uploadPreviewSet: () => uploadPreviewSet,
  uploadScreenshot: () => uploadScreenshot,
  uploadScreenshotSet: () => uploadScreenshotSet,
  upsertBetaAppLocalization: () => upsertBetaAppLocalization,
  upsertBetaBuildLocalization: () => upsertBetaBuildLocalization
});
var init_index = __esm({
  "dist/index.js"() {
    "use strict";
    init_credentials();
    init_token();
    init_errors();
    init_client();
    init_rate_limit();
    init_transport();
    init_paginate();
    init_apps();
    init_app_store_versions();
    init_app_infos();
    init_app_info_localizations();
    init_app_store_version_localizations();
    init_customer_reviews();
    init_analytics_reports();
    init_analytics_reports2();
    init_report_files();
    init_sales_reports();
    init_finance_reports();
    init_app_screenshots();
    init_app_previews();
    init_media_files();
    init_media_assets();
    init_beta_groups();
    init_beta_testers();
    init_builds();
    init_beta_localizations();
    init_beta_review();
    init_testflight_feedback();
    init_feedback_files();
    init_beta_distribution();
    init_report_files();
    init_review_submissions();
    init_app_store_review_details();
    init_app_store_versions_release();
    init_app_store_versions_release();
    init_export_compliance();
    init_age_rating();
    init_submission_assembly();
    init_submission_preflight();
  }
});

// dist/cli/preflight.js
function compareVersions(a, b) {
  const partsA = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const partsB = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(partsA.length, partsB.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (partsA[index] ?? 0) - (partsB[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}
function isBundled() {
  return true;
}
function checkNodeVersion(currentVersion) {
  const satisfied = compareVersions(currentVersion, MIN_NODE_VERSION) >= 0;
  return {
    name: "node-version",
    status: satisfied ? "pass" : "fail",
    detail: `Node ${currentVersion} (minimum ${MIN_NODE_VERSION})`,
    ...satisfied ? {} : {
      fix: `Install Node ${MIN_NODE_VERSION} or newer (24 LTS recommended) and re-run.`
    }
  };
}
async function checkDependencies() {
  if (isBundled()) {
    return {
      name: "dependencies",
      status: "pass",
      detail: `jose and openapi-fetch are inlined (${BUNDLED_DETAIL})`
    };
  }
  const missing = [];
  for (const name of ["jose", "openapi-fetch"]) {
    try {
      await import(name);
    } catch {
      missing.push(name);
    }
  }
  return missing.length === 0 ? {
    name: "dependencies",
    status: "pass",
    detail: "jose and openapi-fetch are loadable"
  } : {
    name: "dependencies",
    status: "fail",
    detail: `Cannot load: ${missing.join(", ")}`,
    fix: "Run `npm ci` in the repository root, then `npm run build`."
  };
}
async function checkBuild() {
  if (isBundled()) {
    return {
      name: "build",
      status: "pass",
      detail: `capability modules are inlined (${BUNDLED_DETAIL})`
    };
  }
  try {
    await Promise.resolve().then(() => (init_index(), index_exports));
    return {
      name: "build",
      status: "pass",
      detail: "Capability modules are importable"
    };
  } catch {
    return {
      name: "build",
      status: "fail",
      detail: "The library build next to the CLI cannot be loaded",
      fix: "Run `npm run build` in the repository root to refresh dist/."
    };
  }
}
async function checkCredentials(env) {
  try {
    const credentials = await loadAscCredentialsFromEnv(env);
    const warnings = inspectCredentialFormat(env).map((warning) => warning.message);
    return {
      name: "credentials",
      status: "pass",
      detail: `Loaded a ${credentials.keyForm} key (key id ending ...${credentials.keyId.slice(-4)})`,
      ...warnings.length > 0 && { warnings }
    };
  } catch (error) {
    if (error instanceof AscCredentialError) {
      return {
        name: "credentials",
        status: "fail",
        detail: error.message,
        fix: credentialFix(error, env)
      };
    }
    throw error;
  }
}
function checkVendorNumber(env) {
  const vendor = env[ASC_VENDOR_NUMBER_ENV];
  return {
    name: "vendor-number",
    status: "pass",
    detail: vendor === void 0 || vendor === "" ? `${ASC_VENDOR_NUMBER_ENV} is not set (optional; sales/finance report downloads need it via this variable or --vendor)` : `${ASC_VENDOR_NUMBER_ENV} is set (ending ...${vendor.slice(-4)})`
  };
}
function credentialFix(error, env) {
  switch (error.reason) {
    case "missing-key-id":
      return `Set ${ASC_ENV_VARS.keyId}. Keys live in App Store Connect \u2192 Users and Access \u2192 Integrations.`;
    case "missing-private-key":
      return `Set ${ASC_ENV_VARS.privateKey} (inline PEM) or ${ASC_ENV_VARS.privateKeyPath} (path to the .p8 file).`;
    case "conflicting-private-key-sources":
      return `Unset one of ${ASC_ENV_VARS.privateKey} / ${ASC_ENV_VARS.privateKeyPath}.`;
    case "unreadable-private-key-file":
      return `Fix the path in ${ASC_ENV_VARS.privateKeyPath} so the .p8 file is readable.`;
    case "invalid-private-key": {
      const hint = inspectInlinePrivateKey(env[ASC_ENV_VARS.privateKey]);
      const generic = "Use the unmodified .p8 file content downloaded from App Store Connect.";
      return hint === void 0 ? generic : `${hint} ${generic}`;
    }
  }
}
var MIN_NODE_VERSION, BUNDLED_DETAIL;
var init_preflight = __esm({
  "dist/cli/preflight.js"() {
    "use strict";
    init_credentials();
    init_credential_format();
    init_errors();
    init_report_flags();
    MIN_NODE_VERSION = "22.12.0";
    BUNDLED_DETAIL = "running from single-file bundle";
  }
});

// dist/cli/commands/doctor.js
var doctorCommand;
var init_doctor = __esm({
  "dist/cli/commands/doctor.js"() {
    "use strict";
    init_dist();
    init_context();
    init_exit_codes();
    init_preflight();
    doctorCommand = defineCommand({
      meta: {
        name: "doctor",
        description: "Check Node version, dependencies, build, and credential env vars (offline)"
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const checks = [
          checkNodeVersion(process.versions.node),
          await checkDependencies(),
          await checkBuild(),
          await checkCredentials(cli.env),
          checkVendorNumber(cli.env)
        ];
        const ok = checks.every((check) => check.status === "pass");
        cli.io.out(JSON.stringify({ ok, command: "doctor", data: { checks } }, null, 2));
        for (const check of checks) {
          cli.io.err(`${check.status === "pass" ? "ok " : "FAIL"} ${check.name}: ${check.detail}`);
          if (check.fix !== void 0) {
            cli.io.err(`     fix: ${check.fix}`);
          }
          for (const warning of check.warnings ?? []) {
            cli.io.err(`     warn: ${warning}`);
          }
        }
        return ok ? EXIT.success : EXIT.configuration;
      }
    });
  }
});

// dist/cli/media-flags.js
import { stat as stat2 } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { extname, join as join3 } from "node:path";
function resolveScreenshotDisplayType(raw) {
  if (raw === void 0) {
    throw new CliUsageError("--display-type is required; see 'asc media screenshots upload --help' for the device list.");
  }
  if (SCREENSHOT_DISPLAY_TYPES.includes(raw)) {
    return raw;
  }
  throw new CliUsageError(`--display-type "${raw}" is not a known screenshot display type. Apple's API is authoritative; the values this build knows are: ${SCREENSHOT_DISPLAY_TYPES.join(", ")}.`);
}
function resolvePreviewType(raw) {
  if (raw === void 0) {
    throw new CliUsageError("--preview-type is required; see 'asc media previews upload --help' for the device list.");
  }
  if (PREVIEW_TYPES.includes(raw)) {
    return raw;
  }
  throw new CliUsageError(`--preview-type "${raw}" is not a known preview type. Apple's API is authoritative; the values this build knows are: ${PREVIEW_TYPES.join(", ")}.`);
}
function validateFrameTimeCode(raw) {
  if (raw === void 0) {
    return;
  }
  if (!FRAME_TIME_CODE.test(raw)) {
    throw new CliUsageError(`--frame-time-code must be HH:MM:SS or HH:MM:SS.mmm, got "${raw}".`);
  }
}
async function statInputFile(path, flag = "--file") {
  let info;
  try {
    info = await stat2(path);
  } catch {
    throw new CliUsageError(`${flag} path does not exist or is not readable: ${path}`);
  }
  if (!info.isFile()) {
    throw new CliUsageError(`${flag} must be a regular file: ${path}`);
  }
}
async function readMediaDirectory(dir, extensions, flag = "--dir") {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    throw new CliUsageError(`${flag} path does not exist or is not a readable directory: ${dir}`);
  }
  const files = entries.filter((entry) => entry.isFile() && extensions.includes(extname(entry.name).toLowerCase())).map((entry) => entry.name).sort((a, b) => a.localeCompare(b)).map((name) => join3(dir, name));
  if (files.length === 0) {
    throw new CliUsageError(`${flag} contains no ${extensions.join("/")} files: ${dir}`);
  }
  return files;
}
function parseOrderList(raw) {
  const ids = csvList(raw);
  if (ids === void 0 || ids.length === 0) {
    throw new CliUsageError("--order expects a comma-separated list of asset ids.");
  }
  const seen = /* @__PURE__ */ new Set();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new CliUsageError(`--order lists "${id}" more than once.`);
    }
    seen.add(id);
  }
  return ids;
}
function resolveTimeoutMs(raw) {
  if (raw === void 0) {
    return void 0;
  }
  return parsePositiveInt(raw, "--timeout") * 1e3;
}
var SCREENSHOT_DISPLAY_TYPES, PREVIEW_TYPES, FRAME_TIME_CODE, SCREENSHOT_EXTENSIONS, PREVIEW_EXTENSIONS;
var init_media_flags = __esm({
  "dist/cli/media-flags.js"() {
    "use strict";
    init_exit_codes();
    init_read_scope();
    SCREENSHOT_DISPLAY_TYPES = [
      "APP_IPHONE_67",
      "APP_IPHONE_61",
      "APP_IPHONE_65",
      "APP_IPHONE_58",
      "APP_IPHONE_55",
      "APP_IPHONE_47",
      "APP_IPHONE_40",
      "APP_IPHONE_35",
      "APP_IPAD_PRO_3GEN_129",
      "APP_IPAD_PRO_3GEN_11",
      "APP_IPAD_PRO_129",
      "APP_IPAD_105",
      "APP_IPAD_97",
      "APP_DESKTOP",
      "APP_WATCH_ULTRA",
      "APP_WATCH_SERIES_10",
      "APP_WATCH_SERIES_7",
      "APP_WATCH_SERIES_4",
      "APP_WATCH_SERIES_3",
      "APP_APPLE_TV",
      "APP_APPLE_VISION_PRO",
      "IMESSAGE_APP_IPHONE_67",
      "IMESSAGE_APP_IPHONE_61",
      "IMESSAGE_APP_IPHONE_65",
      "IMESSAGE_APP_IPHONE_58",
      "IMESSAGE_APP_IPHONE_55",
      "IMESSAGE_APP_IPHONE_47",
      "IMESSAGE_APP_IPHONE_40",
      "IMESSAGE_APP_IPAD_PRO_3GEN_129",
      "IMESSAGE_APP_IPAD_PRO_3GEN_11",
      "IMESSAGE_APP_IPAD_PRO_129",
      "IMESSAGE_APP_IPAD_105",
      "IMESSAGE_APP_IPAD_97"
    ];
    PREVIEW_TYPES = [
      "IPHONE_67",
      "IPHONE_61",
      "IPHONE_65",
      "IPHONE_58",
      "IPHONE_55",
      "IPHONE_47",
      "IPHONE_40",
      "IPHONE_35",
      "IPAD_PRO_3GEN_129",
      "IPAD_PRO_3GEN_11",
      "IPAD_PRO_129",
      "IPAD_105",
      "IPAD_97",
      "DESKTOP",
      "APPLE_TV",
      "APPLE_VISION_PRO"
    ];
    FRAME_TIME_CODE = /^\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/;
    SCREENSHOT_EXTENSIONS = [".png", ".jpg", ".jpeg"];
    PREVIEW_EXTENSIONS = [".mov", ".mp4", ".m4v"];
  }
});

// dist/cli/commands/media-shared.js
function resolveWaitTimeout(flags) {
  const pollTimeoutMs = resolveTimeoutMs(flags.timeout);
  return {
    wait: flags.wait !== false,
    ...pollTimeoutMs !== void 0 && { pollTimeoutMs }
  };
}
function uploadResultFields(result, statusCommandBase) {
  return {
    assetId: result.assetId,
    fileName: result.fileName,
    fileSize: result.fileSize,
    md5: result.md5,
    operationCount: result.operationCount,
    bytesTransferred: result.bytesTransferred,
    finalState: result.finalState,
    complete: result.complete,
    ...result.pollTimedOut && {
      pollTimedOut: true,
      statusCommand: `${statusCommandBase} ${result.assetId}`
    }
  };
}
function statusResultFields(result) {
  return {
    assetId: result.assetId,
    finalState: result.finalState,
    complete: result.complete,
    failed: result.failed,
    ...result.errors.length > 0 && { errors: result.errors },
    ...result.pollTimedOut && { pollTimedOut: true }
  };
}
function uploadSetResultFields(result, statusCommandBase) {
  return {
    setId: result.setId,
    setCreated: result.setCreated,
    count: result.uploads.length,
    assets: result.uploads.map((upload) => ({
      assetId: upload.assetId,
      fileName: upload.fileName,
      fileSize: upload.fileSize,
      finalState: upload.finalState,
      complete: upload.complete,
      ...upload.pollTimedOut && { pollTimedOut: true }
    })),
    ...result.order !== void 0 && { order: result.order },
    ...result.uploads.some((upload) => upload.pollTimedOut) && {
      statusCommand: statusCommandBase
    }
  };
}
var versionLocaleArgs, setArg, waitTimeoutArgs;
var init_media_shared = __esm({
  "dist/cli/commands/media-shared.js"() {
    "use strict";
    init_media_flags();
    versionLocaleArgs = {
      version: {
        type: "string",
        required: true,
        valueHint: "versionId",
        description: "The App Store version's ASC id (from 'asc versions list')"
      },
      locale: {
        type: "string",
        required: true,
        valueHint: "en-US",
        description: "The localization's locale (BCP-47)"
      }
    };
    setArg = {
      set: {
        type: "string",
        required: true,
        valueHint: "setId",
        description: "The set's ASC id (from 'list-sets')"
      }
    };
    waitTimeoutArgs = {
      wait: {
        type: "boolean",
        default: true,
        description: "Wait (poll) until Apple finishes processing; pass --no-wait to return right after the commit"
      },
      timeout: {
        type: "string",
        valueHint: "60",
        description: "Max seconds to wait for processing (default: screenshots 60, previews 600)"
      }
    };
  }
});

// dist/cli/commands/media-previews.js
var STATUS_COMMAND, previewTypeArg, listSetsCommand, listCommand3, uploadCommand, uploadSetCommand, deleteCommand, deleteSetCommand, reorderCommand, statusCommand, mediaPreviewsCommand;
var init_media_previews = __esm({
  "dist/cli/commands/media-previews.js"() {
    "use strict";
    init_dist();
    init_app_previews();
    init_media_assets();
    init_context();
    init_exit_codes();
    init_media_flags();
    init_output();
    init_read_scope();
    init_media_shared();
    STATUS_COMMAND = "asc media previews status";
    previewTypeArg = {
      "preview-type": {
        type: "string",
        required: true,
        valueHint: "IPHONE_67",
        description: "The preview type (device class); see --help"
      }
    };
    listSetsCommand = defineCommand({
      meta: {
        name: "list-sets",
        description: "List a localization's preview sets (one per preview type)"
      },
      args: { ...versionLocaleArgs, ...readScopeArgs },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const localization = await resolveLocalization(await cli.client(), ctx.args.version, ctx.args.locale);
        const read = await listAppPreviewSets(await cli.client(), localization.localizationId, { scope, ...pageLimit !== void 0 && { pageLimit } });
        emitResult(cli.io, listEnvelope("media previews list-sets", read, scope, {
          versionId: ctx.args.version,
          locale: localization.locale,
          localizationId: localization.localizationId
        }));
      }
    });
    listCommand3 = defineCommand({
      meta: {
        name: "list",
        description: "List the previews in a set, in display order"
      },
      args: { ...setArg, ...readScopeArgs },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const read = await listAppPreviews(await cli.client(), ctx.args.set, {
          scope,
          ...pageLimit !== void 0 && { pageLimit }
        });
        emitResult(cli.io, listEnvelope("media previews list", read, scope));
      }
    });
    uploadCommand = defineCommand({
      meta: {
        name: "upload",
        description: "Upload one preview: reserve, transfer the bytes, commit, and confirm processing (video transcode can take minutes)"
      },
      args: {
        ...versionLocaleArgs,
        ...previewTypeArg,
        file: {
          type: "string",
          required: true,
          valueHint: "path",
          description: "Path to the preview video (.mov/.mp4/.m4v)"
        },
        "mime-type": {
          type: "string",
          valueHint: "video/mp4",
          description: "Override the mimeType (otherwise inferred from extension)"
        },
        "frame-time-code": {
          type: "string",
          valueHint: "00:00:05.000",
          description: "Poster-frame timecode HH:MM:SS[.mmm]"
        },
        ...waitTimeoutArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const previewType = resolvePreviewType(ctx.args["preview-type"]);
        validateFrameTimeCode(ctx.args["frame-time-code"]);
        await statInputFile(ctx.args.file);
        const wait = resolveWaitTimeout(ctx.args);
        const client = await cli.client();
        const localization = await resolveLocalization(client, ctx.args.version, ctx.args.locale);
        const ensured = await ensurePreviewSet(client, localization.localizationId, previewType);
        const result = await uploadPreview(client, ensured.set.id, ctx.args.file, {
          ...wait,
          ...ctx.args["mime-type"] !== void 0 && {
            mimeType: ctx.args["mime-type"]
          },
          ...ctx.args["frame-time-code"] !== void 0 && {
            previewFrameTimeCode: ctx.args["frame-time-code"]
          }
        });
        const rateLimit = cli.lastRateLimit();
        emitResult(cli.io, documentEnvelope("media previews upload", { data: result.resource.data }, {
          resolved: {
            versionId: ctx.args.version,
            locale: localization.locale,
            localizationId: localization.localizationId,
            previewType,
            setId: ensured.set.id,
            setCreated: ensured.created,
            ...uploadResultFields(result, STATUS_COMMAND)
          },
          ...rateLimit !== void 0 && { rateLimit }
        }));
      }
    });
    uploadSetCommand = defineCommand({
      meta: {
        name: "upload-set",
        description: "Upload every video in a directory into one preview type's set (appends; --reorder to lead with them)"
      },
      args: {
        ...versionLocaleArgs,
        ...previewTypeArg,
        dir: {
          type: "string",
          required: true,
          valueHint: "path",
          description: "Directory of preview videos, uploaded in filename order"
        },
        reorder: {
          type: "boolean",
          description: "After uploading, order the set to lead with this batch"
        },
        ...waitTimeoutArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const previewType = resolvePreviewType(ctx.args["preview-type"]);
        const files = await readMediaDirectory(ctx.args.dir, PREVIEW_EXTENSIONS);
        const wait = resolveWaitTimeout(ctx.args);
        const client = await cli.client();
        const localization = await resolveLocalization(client, ctx.args.version, ctx.args.locale);
        const result = await uploadPreviewSet(client, localization.localizationId, previewType, files, { ...wait, ...ctx.args.reorder === true && { reorder: true } });
        const rateLimit = cli.lastRateLimit();
        emitResult(cli.io, documentEnvelope("media previews upload-set", { data: result.uploads.map((upload) => upload.resource.data) }, {
          resolved: {
            versionId: ctx.args.version,
            locale: localization.locale,
            localizationId: localization.localizationId,
            previewType,
            ...uploadSetResultFields(result, STATUS_COMMAND)
          },
          ...rateLimit !== void 0 && { rateLimit }
        }));
      }
    });
    deleteCommand = defineCommand({
      meta: {
        name: "delete",
        description: "Delete one preview (use to clear a dangling reservation)"
      },
      args: {
        previewId: {
          type: "positional",
          required: true,
          description: "The preview's ASC id (from 'list')"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        await deleteAppPreview(await cli.client(), ctx.args.previewId);
        emitResult(cli.io, {
          ok: true,
          command: "media previews delete",
          data: { id: ctx.args.previewId, deleted: true }
        });
      }
    });
    deleteSetCommand = defineCommand({
      meta: {
        name: "delete-set",
        description: "Delete a preview set (destructive: a non-empty set needs --force and takes its previews with it)"
      },
      args: {
        ...setArg,
        force: {
          type: "boolean",
          description: "Required to delete a set that still holds previews"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const client = await cli.client();
        const existing = await listAppPreviews(client, ctx.args.set, {
          scope: "all-pages"
        });
        if (existing.items.length > 0 && ctx.args.force !== true) {
          throw new CliUsageError(`Set ${ctx.args.set} still holds ${String(existing.items.length)} preview(s); pass --force to delete the set and them.`);
        }
        await deleteAppPreviewSet(client, ctx.args.set);
        emitResult(cli.io, {
          ok: true,
          command: "media previews delete-set",
          data: {
            id: ctx.args.set,
            deleted: true,
            deletedPreviews: existing.items.length
          }
        });
      }
    });
    reorderCommand = defineCommand({
      meta: {
        name: "reorder",
        description: "Set a set's preview order (the list must be the set's full membership)"
      },
      args: {
        ...setArg,
        order: {
          type: "string",
          required: true,
          valueHint: "id,id,id",
          description: "Preview ids in the desired order (full membership)"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const order = parseOrderList(ctx.args.order);
        await reorderAppPreviews(await cli.client(), ctx.args.set, order);
        emitResult(cli.io, {
          ok: true,
          command: "media previews reorder",
          data: { setId: ctx.args.set, order },
          resolved: { count: order.length }
        });
      }
    });
    statusCommand = defineCommand({
      meta: {
        name: "status",
        description: "Read a preview's processing state (asset + video); --wait polls to a terminal state"
      },
      args: {
        previewId: {
          type: "positional",
          required: true,
          description: "The preview's ASC id (from 'list' or an upload)"
        },
        wait: {
          type: "boolean",
          description: "Poll until the asset reaches COMPLETE or FAILED"
        },
        timeout: {
          type: "string",
          valueHint: "600",
          description: "Max seconds to wait when --wait is set (default 600)"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const pollTimeoutMs = resolveTimeoutMs(ctx.args.timeout);
        const result = await getPreviewStatus(await cli.client(), ctx.args.previewId, {
          wait: ctx.args.wait === true,
          ...pollTimeoutMs !== void 0 && { pollTimeoutMs }
        });
        const rateLimit = cli.lastRateLimit();
        emitResult(cli.io, documentEnvelope("media previews status", { data: result.resource.data }, {
          resolved: statusResultFields(result),
          ...rateLimit !== void 0 && { rateLimit }
        }));
      }
    });
    mediaPreviewsCommand = defineCommand({
      meta: {
        name: "previews",
        description: "App Store preview (video) sets and previews"
      },
      subCommands: {
        "list-sets": listSetsCommand,
        list: listCommand3,
        upload: uploadCommand,
        "upload-set": uploadSetCommand,
        delete: deleteCommand,
        "delete-set": deleteSetCommand,
        reorder: reorderCommand,
        status: statusCommand
      }
    });
  }
});

// dist/cli/commands/media-screenshots.js
var STATUS_COMMAND2, displayTypeArg, listSetsCommand2, listCommand4, uploadCommand2, uploadSetCommand2, deleteCommand2, deleteSetCommand2, reorderCommand2, statusCommand2, mediaScreenshotsCommand;
var init_media_screenshots = __esm({
  "dist/cli/commands/media-screenshots.js"() {
    "use strict";
    init_dist();
    init_app_screenshots();
    init_media_assets();
    init_context();
    init_exit_codes();
    init_media_flags();
    init_output();
    init_read_scope();
    init_media_shared();
    STATUS_COMMAND2 = "asc media screenshots status";
    displayTypeArg = {
      "display-type": {
        type: "string",
        required: true,
        valueHint: "APP_IPHONE_67",
        description: "The screenshot display type (device class); see --help"
      }
    };
    listSetsCommand2 = defineCommand({
      meta: {
        name: "list-sets",
        description: "List a localization's screenshot sets (one per display type)"
      },
      args: { ...versionLocaleArgs, ...readScopeArgs },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const localization = await resolveLocalization(await cli.client(), ctx.args.version, ctx.args.locale);
        const read = await listAppScreenshotSets(await cli.client(), localization.localizationId, { scope, ...pageLimit !== void 0 && { pageLimit } });
        emitResult(cli.io, listEnvelope("media screenshots list-sets", read, scope, {
          versionId: ctx.args.version,
          locale: localization.locale,
          localizationId: localization.localizationId
        }));
      }
    });
    listCommand4 = defineCommand({
      meta: {
        name: "list",
        description: "List the screenshots in a set, in display order"
      },
      args: { ...setArg, ...readScopeArgs },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const read = await listAppScreenshots(await cli.client(), ctx.args.set, {
          scope,
          ...pageLimit !== void 0 && { pageLimit }
        });
        emitResult(cli.io, listEnvelope("media screenshots list", read, scope));
      }
    });
    uploadCommand2 = defineCommand({
      meta: {
        name: "upload",
        description: "Upload one screenshot: reserve, transfer the bytes, commit, and confirm processing"
      },
      args: {
        ...versionLocaleArgs,
        ...displayTypeArg,
        file: {
          type: "string",
          required: true,
          valueHint: "path",
          description: "Path to the screenshot image (PNG/JPEG)"
        },
        ...waitTimeoutArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const displayType = resolveScreenshotDisplayType(ctx.args["display-type"]);
        await statInputFile(ctx.args.file);
        const wait = resolveWaitTimeout(ctx.args);
        const client = await cli.client();
        const localization = await resolveLocalization(client, ctx.args.version, ctx.args.locale);
        const ensured = await ensureScreenshotSet(client, localization.localizationId, displayType);
        const result = await uploadScreenshot(client, ensured.set.id, ctx.args.file, wait);
        const rateLimit = cli.lastRateLimit();
        emitResult(cli.io, documentEnvelope("media screenshots upload", { data: result.resource.data }, {
          resolved: {
            versionId: ctx.args.version,
            locale: localization.locale,
            localizationId: localization.localizationId,
            displayType,
            setId: ensured.set.id,
            setCreated: ensured.created,
            ...uploadResultFields(result, STATUS_COMMAND2)
          },
          ...rateLimit !== void 0 && { rateLimit }
        }));
      }
    });
    uploadSetCommand2 = defineCommand({
      meta: {
        name: "upload-set",
        description: "Upload every image in a directory into one display type's set (appends; --reorder to lead with them)"
      },
      args: {
        ...versionLocaleArgs,
        ...displayTypeArg,
        dir: {
          type: "string",
          required: true,
          valueHint: "path",
          description: "Directory of screenshot images, uploaded in filename order"
        },
        reorder: {
          type: "boolean",
          description: "After uploading, order the set to lead with this batch"
        },
        ...waitTimeoutArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const displayType = resolveScreenshotDisplayType(ctx.args["display-type"]);
        const files = await readMediaDirectory(ctx.args.dir, SCREENSHOT_EXTENSIONS);
        const wait = resolveWaitTimeout(ctx.args);
        const client = await cli.client();
        const localization = await resolveLocalization(client, ctx.args.version, ctx.args.locale);
        const result = await uploadScreenshotSet(client, localization.localizationId, displayType, files, { ...wait, ...ctx.args.reorder === true && { reorder: true } });
        const rateLimit = cli.lastRateLimit();
        emitResult(cli.io, documentEnvelope("media screenshots upload-set", { data: result.uploads.map((upload) => upload.resource.data) }, {
          resolved: {
            versionId: ctx.args.version,
            locale: localization.locale,
            localizationId: localization.localizationId,
            displayType,
            ...uploadSetResultFields(result, STATUS_COMMAND2)
          },
          ...rateLimit !== void 0 && { rateLimit }
        }));
      }
    });
    deleteCommand2 = defineCommand({
      meta: {
        name: "delete",
        description: "Delete one screenshot (use to clear a dangling reservation)"
      },
      args: {
        screenshotId: {
          type: "positional",
          required: true,
          description: "The screenshot's ASC id (from 'list')"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        await deleteAppScreenshot(await cli.client(), ctx.args.screenshotId);
        emitResult(cli.io, {
          ok: true,
          command: "media screenshots delete",
          data: { id: ctx.args.screenshotId, deleted: true }
        });
      }
    });
    deleteSetCommand2 = defineCommand({
      meta: {
        name: "delete-set",
        description: "Delete a screenshot set (destructive: a non-empty set needs --force and takes its screenshots with it)"
      },
      args: {
        ...setArg,
        force: {
          type: "boolean",
          description: "Required to delete a set that still holds screenshots"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const client = await cli.client();
        const existing = await listAppScreenshots(client, ctx.args.set, {
          scope: "all-pages"
        });
        if (existing.items.length > 0 && ctx.args.force !== true) {
          throw new CliUsageError(`Set ${ctx.args.set} still holds ${String(existing.items.length)} screenshot(s); pass --force to delete the set and them.`);
        }
        await deleteAppScreenshotSet(client, ctx.args.set);
        emitResult(cli.io, {
          ok: true,
          command: "media screenshots delete-set",
          data: {
            id: ctx.args.set,
            deleted: true,
            deletedScreenshots: existing.items.length
          }
        });
      }
    });
    reorderCommand2 = defineCommand({
      meta: {
        name: "reorder",
        description: "Set a set's screenshot order (the list must be the set's full membership)"
      },
      args: {
        ...setArg,
        order: {
          type: "string",
          required: true,
          valueHint: "id,id,id",
          description: "Screenshot ids in the desired order (full membership)"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const order = parseOrderList(ctx.args.order);
        await reorderAppScreenshots(await cli.client(), ctx.args.set, order);
        emitResult(cli.io, {
          ok: true,
          command: "media screenshots reorder",
          data: { setId: ctx.args.set, order },
          resolved: { count: order.length }
        });
      }
    });
    statusCommand2 = defineCommand({
      meta: {
        name: "status",
        description: "Read a screenshot's processing state; --wait polls it to a terminal state"
      },
      args: {
        screenshotId: {
          type: "positional",
          required: true,
          description: "The screenshot's ASC id (from 'list' or an upload)"
        },
        wait: {
          type: "boolean",
          description: "Poll until the asset reaches COMPLETE or FAILED"
        },
        timeout: {
          type: "string",
          valueHint: "60",
          description: "Max seconds to wait when --wait is set (default 60)"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const pollTimeoutMs = resolveTimeoutMs(ctx.args.timeout);
        const result = await getScreenshotStatus(await cli.client(), ctx.args.screenshotId, {
          wait: ctx.args.wait === true,
          ...pollTimeoutMs !== void 0 && { pollTimeoutMs }
        });
        const rateLimit = cli.lastRateLimit();
        emitResult(cli.io, documentEnvelope("media screenshots status", { data: result.resource.data }, {
          resolved: statusResultFields(result),
          ...rateLimit !== void 0 && { rateLimit }
        }));
      }
    });
    mediaScreenshotsCommand = defineCommand({
      meta: {
        name: "screenshots",
        description: "App Store screenshot sets and screenshots"
      },
      subCommands: {
        "list-sets": listSetsCommand2,
        list: listCommand4,
        upload: uploadCommand2,
        "upload-set": uploadSetCommand2,
        delete: deleteCommand2,
        "delete-set": deleteSetCommand2,
        reorder: reorderCommand2,
        status: statusCommand2
      }
    });
  }
});

// dist/cli/commands/media.js
var mediaCommand;
var init_media = __esm({
  "dist/cli/commands/media.js"() {
    "use strict";
    init_dist();
    init_media_previews();
    init_media_screenshots();
    mediaCommand = defineCommand({
      meta: {
        name: "media",
        description: "Screenshot and preview (video) upload workflows"
      },
      subCommands: {
        screenshots: mediaScreenshotsCommand,
        previews: mediaPreviewsCommand
      }
    });
  }
});

// dist/cli/commands/metadata-shared.js
import { readFile as readFile2 } from "node:fs/promises";
function attributeArgs(specs) {
  const args = {};
  for (const spec of specs) {
    args[spec.flag] = { type: "string", description: spec.description };
  }
  return args;
}
async function collectAttributes(args, specs, options = {}) {
  const attributes = {};
  const fromJsonPath = args["from-json"];
  if (typeof fromJsonPath === "string") {
    Object.assign(attributes, await readAttributeFile(fromJsonPath, specs));
  }
  for (const spec of specs) {
    const value = args[spec.flag];
    if (typeof value === "string") {
      attributes[spec.attribute] = value;
    }
  }
  if (Object.keys(attributes).length === 0 && options.allowEmpty !== true) {
    throw new CliUsageError(`Nothing to write: pass at least one field flag (${specs.map((spec) => `--${spec.flag}`).join(", ")}) or --from-json.`);
  }
  return attributes;
}
async function readAttributeFile(path, specs) {
  let raw;
  try {
    raw = await readFile2(path, "utf8");
  } catch {
    throw new CliUsageError(`Cannot read the --from-json file at "${path}".`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CliUsageError(`The --from-json file "${path}" is not valid JSON.`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new CliUsageError(`The --from-json file "${path}" must contain a JSON object of attributes.`);
  }
  const allowed = new Map(specs.map((spec) => [spec.attribute, spec]));
  const attributes = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!allowed.has(key)) {
      throw new CliUsageError(`Unknown attribute "${key}" in "${path}"; allowed: ${[...allowed.keys()].join(", ")}.`);
    }
    if (value !== null && typeof value !== "string") {
      throw new CliUsageError(`Attribute "${key}" in "${path}" must be a string or null (null clears the field).`);
    }
    attributes[key] = value;
  }
  return attributes;
}
function requireLocaleMatch(items, locale, addCommand) {
  const match = items.find((item) => item.attributes?.locale === locale);
  if (match !== void 0) {
    return match;
  }
  const visible = items.map((item) => item.attributes?.locale).filter((value) => value !== void 0);
  throw new AscNotFoundError(`No '${locale}' localization exists (visible locales: ${visible.length > 0 ? visible.join(", ") : "none"}). Add it with '${addCommand}'.`);
}
var fromJsonArg;
var init_metadata_shared = __esm({
  "dist/cli/commands/metadata-shared.js"() {
    "use strict";
    init_errors();
    init_exit_codes();
    fromJsonArg = {
      "from-json": {
        type: "string",
        valueHint: "file.json",
        description: "JSON file of attributes (camelCase keys; null clears a field); explicit flags override it"
      }
    };
  }
});

// dist/cli/commands/metadata-app.js
async function resolveAppInfo(cli, flags) {
  const explicit = flags["app-info"];
  if (explicit !== void 0) {
    return { id: explicit };
  }
  const appId = flags.app;
  if (appId === void 0) {
    throw new CliUsageError("Pass --app <appId> (the appInfo is resolved automatically) or --app-info <id>.");
  }
  const read = await listAppInfos(await cli.client(), appId, {
    scope: "all-pages",
    fields: ["state"]
  });
  const preferences = flags.live === true ? LIVE_STATES : EDITABLE_STATES;
  for (const state of preferences) {
    const match = read.items.find((info) => info.attributes?.state === state);
    if (match !== void 0) {
      return { id: match.id, state };
    }
  }
  const seen = read.items.map((info) => `${info.id} [${info.attributes?.state ?? "?"}]`).join(", ");
  throw new AscNotFoundError(`No ${flags.live === true ? "live" : "editable"} appInfo found for app ${appId} (candidates: ${seen === "" ? "none" : seen}). Pass --app-info <id> to target one explicitly.`);
}
function resolvedBlock(info) {
  return {
    appInfo: info.id,
    ...info.state !== void 0 && { appInfoState: info.state }
  };
}
var APP_FIELD_SPECS, EDITABLE_STATES, LIVE_STATES, targetArgs, localeArg, ADD_COMMAND, listCommand5, getCommand3, updateCommand, addLocaleCommand, metadataAppCommand;
var init_metadata_app = __esm({
  "dist/cli/commands/metadata-app.js"() {
    "use strict";
    init_dist();
    init_app_info_localizations();
    init_app_infos();
    init_errors();
    init_context();
    init_exit_codes();
    init_output();
    init_read_scope();
    init_metadata_shared();
    APP_FIELD_SPECS = [
      { flag: "name", attribute: "name", description: "The app's store name" },
      {
        flag: "subtitle",
        attribute: "subtitle",
        description: "The app's store subtitle"
      },
      {
        flag: "privacy-policy-url",
        attribute: "privacyPolicyUrl",
        description: "Privacy policy URL"
      },
      {
        flag: "privacy-policy-text",
        attribute: "privacyPolicyText",
        description: "Privacy policy text (Apple TV only)"
      },
      {
        flag: "privacy-choices-url",
        attribute: "privacyChoicesUrl",
        description: "Privacy choices URL"
      }
    ];
    EDITABLE_STATES = [
      "PREPARE_FOR_SUBMISSION",
      "DEVELOPER_REJECTED",
      "REJECTED"
    ];
    LIVE_STATES = [
      "READY_FOR_DISTRIBUTION",
      "ACCEPTED",
      "PENDING_RELEASE"
    ];
    targetArgs = {
      app: {
        type: "string",
        valueHint: "appId",
        description: "The app's ASC id; the appInfo is resolved automatically"
      },
      live: {
        type: "boolean",
        description: "Target the live appInfo instead of the editable draft"
      },
      "app-info": {
        type: "string",
        valueHint: "appInfoId",
        description: "Target a specific appInfo id, bypassing resolution"
      }
    };
    localeArg = {
      locale: {
        type: "string",
        required: true,
        valueHint: "en-US",
        description: "The localization's locale (BCP-47)"
      }
    };
    ADD_COMMAND = "asc metadata app add-locale";
    listCommand5 = defineCommand({
      meta: {
        name: "list",
        description: "List app-level localizations (name, subtitle, privacy)"
      },
      args: {
        ...targetArgs,
        locale: {
          type: "string",
          valueHint: "en-US,de-DE",
          description: "Filter by locale (comma-separated)"
        },
        fields: {
          type: "string",
          valueHint: "locale,name,subtitle",
          description: "Sparse field selection (comma-separated)"
        },
        ...readScopeArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const info = await resolveAppInfo(cli, ctx.args);
        const locale = csvList(ctx.args.locale);
        const fields = csvList(ctx.args.fields);
        const read = await listAppInfoLocalizations(await cli.client(), info.id, {
          scope,
          ...pageLimit !== void 0 && { pageLimit },
          ...locale !== void 0 && { locale },
          ...fields !== void 0 && { fields }
        });
        emitResult(cli.io, listEnvelope("metadata app list", read, scope, resolvedBlock(info)));
      }
    });
    getCommand3 = defineCommand({
      meta: {
        name: "get",
        description: "Read one locale's app-level metadata"
      },
      args: { ...targetArgs, ...localeArg },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const info = await resolveAppInfo(cli, ctx.args);
        const read = await listAppInfoLocalizations(await cli.client(), info.id, {
          scope: "all-pages"
        });
        const localization = requireLocaleMatch(read.items, ctx.args.locale, ADD_COMMAND);
        emitResult(cli.io, documentEnvelope("metadata app get", { data: localization }, {
          resolved: {
            ...resolvedBlock(info),
            appInfoLocalization: localization.id
          }
        }));
      }
    });
    updateCommand = defineCommand({
      meta: {
        name: "update",
        description: "Update one locale's app-level metadata"
      },
      args: {
        ...targetArgs,
        ...localeArg,
        ...attributeArgs(APP_FIELD_SPECS),
        ...fromJsonArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const attributes = await collectAttributes(ctx.args, APP_FIELD_SPECS);
        const info = await resolveAppInfo(cli, ctx.args);
        const read = await listAppInfoLocalizations(await cli.client(), info.id, {
          scope: "all-pages"
        });
        const localization = requireLocaleMatch(read.items, ctx.args.locale, ADD_COMMAND);
        const document = await updateAppInfoLocalization(await cli.client(), localization.id, attributes);
        emitResult(cli.io, documentEnvelope("metadata app update", document, {
          resolved: {
            ...resolvedBlock(info),
            appInfoLocalization: localization.id
          }
        }));
      }
    });
    addLocaleCommand = defineCommand({
      meta: {
        name: "add-locale",
        description: "Add a language to the app-level metadata (--name required)"
      },
      args: {
        ...targetArgs,
        ...localeArg,
        ...attributeArgs(APP_FIELD_SPECS),
        ...fromJsonArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const attributes = await collectAttributes(ctx.args, APP_FIELD_SPECS, {
          allowEmpty: true
        });
        if (typeof attributes.name !== "string") {
          throw new CliUsageError("Adding an app-level locale requires --name (ASC mandates a store name per locale).");
        }
        const info = await resolveAppInfo(cli, ctx.args);
        const document = await createAppInfoLocalization(await cli.client(), info.id, {
          ...attributes,
          locale: ctx.args.locale
        });
        emitResult(cli.io, documentEnvelope("metadata app add-locale", document, {
          resolved: resolvedBlock(info)
        }));
      }
    });
    metadataAppCommand = defineCommand({
      meta: {
        name: "app",
        description: "App-level metadata: name, subtitle, privacy policy (not tied to a version)"
      },
      subCommands: {
        list: listCommand5,
        get: getCommand3,
        update: updateCommand,
        "add-locale": addLocaleCommand
      }
    });
  }
});

// dist/cli/commands/metadata-version.js
async function resolveLocalization2(cli, versionId, locale) {
  const read = await listAppStoreVersionLocalizations(await cli.client(), versionId, {
    scope: "all-pages"
  });
  return requireLocaleMatch(read.items, locale, ADD_COMMAND2);
}
var VERSION_FIELD_SPECS, versionArg, localeArg2, ADD_COMMAND2, listCommand6, getCommand4, updateCommand2, addLocaleCommand2, getRawCommand, metadataVersionCommand;
var init_metadata_version = __esm({
  "dist/cli/commands/metadata-version.js"() {
    "use strict";
    init_dist();
    init_app_store_version_localizations();
    init_context();
    init_output();
    init_read_scope();
    init_metadata_shared();
    VERSION_FIELD_SPECS = [
      {
        flag: "description",
        attribute: "description",
        description: "The store description"
      },
      {
        flag: "keywords",
        attribute: "keywords",
        description: "Search keywords (one comma-separated string)"
      },
      {
        flag: "whats-new",
        attribute: "whatsNew",
        description: "Release notes (rejected on an app's first version)"
      },
      {
        flag: "promotional-text",
        attribute: "promotionalText",
        description: "Promotional text (editable in any version state)"
      },
      {
        flag: "support-url",
        attribute: "supportUrl",
        description: "Support page URL"
      },
      {
        flag: "marketing-url",
        attribute: "marketingUrl",
        description: "Marketing page URL"
      }
    ];
    versionArg = {
      version: {
        type: "string",
        required: true,
        valueHint: "versionId",
        description: "The App Store version's ASC id (from 'asc versions list')"
      }
    };
    localeArg2 = {
      locale: {
        type: "string",
        required: true,
        valueHint: "en-US",
        description: "The localization's locale (BCP-47)"
      }
    };
    ADD_COMMAND2 = "asc metadata version add-locale";
    listCommand6 = defineCommand({
      meta: {
        name: "list",
        description: "List a version's localizations (locales and copy)"
      },
      args: {
        ...versionArg,
        locale: {
          type: "string",
          valueHint: "en-US,de-DE",
          description: "Filter by locale (comma-separated)"
        },
        fields: {
          type: "string",
          valueHint: "locale,description",
          description: "Sparse field selection (comma-separated)"
        },
        ...readScopeArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const locale = csvList(ctx.args.locale);
        const fields = csvList(ctx.args.fields);
        const read = await listAppStoreVersionLocalizations(await cli.client(), ctx.args.version, {
          scope,
          ...pageLimit !== void 0 && { pageLimit },
          ...locale !== void 0 && { locale },
          ...fields !== void 0 && { fields }
        });
        emitResult(cli.io, listEnvelope("metadata version list", read, scope));
      }
    });
    getCommand4 = defineCommand({
      meta: {
        name: "get",
        description: "Read one locale's version metadata"
      },
      args: { ...versionArg, ...localeArg2 },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const localization = await resolveLocalization2(cli, ctx.args.version, ctx.args.locale);
        emitResult(cli.io, documentEnvelope("metadata version get", { data: localization }, {
          resolved: { appStoreVersionLocalization: localization.id }
        }));
      }
    });
    updateCommand2 = defineCommand({
      meta: {
        name: "update",
        description: "Update one locale's version metadata"
      },
      args: {
        ...versionArg,
        ...localeArg2,
        ...attributeArgs(VERSION_FIELD_SPECS),
        ...fromJsonArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const attributes = await collectAttributes(ctx.args, VERSION_FIELD_SPECS);
        const localization = await resolveLocalization2(cli, ctx.args.version, ctx.args.locale);
        const document = await updateAppStoreVersionLocalization(await cli.client(), localization.id, attributes);
        emitResult(cli.io, documentEnvelope("metadata version update", document, {
          resolved: { appStoreVersionLocalization: localization.id }
        }));
      }
    });
    addLocaleCommand2 = defineCommand({
      meta: {
        name: "add-locale",
        description: "Add a language to a version (optionally with initial copy)"
      },
      args: {
        ...versionArg,
        ...localeArg2,
        ...attributeArgs(VERSION_FIELD_SPECS),
        ...fromJsonArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const attributes = await collectAttributes(ctx.args, VERSION_FIELD_SPECS, {
          allowEmpty: true
        });
        const document = await createAppStoreVersionLocalization(await cli.client(), ctx.args.version, {
          ...attributes,
          locale: ctx.args.locale
        });
        emitResult(cli.io, documentEnvelope("metadata version add-locale", document));
      }
    });
    getRawCommand = defineCommand({
      meta: {
        name: "get-by-id",
        description: "Read one localization directly by its ASC id",
        hidden: true
      },
      args: {
        localizationId: {
          type: "positional",
          required: true,
          description: "The localization's ASC id"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const document = await getAppStoreVersionLocalization(await cli.client(), ctx.args.localizationId);
        emitResult(cli.io, documentEnvelope("metadata version get-by-id", document));
      }
    });
    metadataVersionCommand = defineCommand({
      meta: {
        name: "version",
        description: "Version-level metadata: description, keywords, what's new, promotional text, URLs"
      },
      subCommands: {
        list: listCommand6,
        get: getCommand4,
        update: updateCommand2,
        "add-locale": addLocaleCommand2,
        "get-by-id": getRawCommand
      }
    });
  }
});

// dist/cli/commands/metadata.js
var metadataCommand;
var init_metadata = __esm({
  "dist/cli/commands/metadata.js"() {
    "use strict";
    init_dist();
    init_metadata_app();
    init_metadata_version();
    metadataCommand = defineCommand({
      meta: {
        name: "metadata",
        description: "Read and update store metadata and localizations (app level and version level)"
      },
      subCommands: {
        app: metadataAppCommand,
        version: metadataVersionCommand
      }
    });
  }
});

// dist/cli/commands/reports-analytics.js
async function withJsonConversion(segments, format) {
  if (format === void 0) {
    return segments;
  }
  const converted = [];
  for (const segment of segments) {
    const json = await convertDelimitedReportToJson(segment.path, jsonSiblingPath(segment.path));
    converted.push({ ...segment, convertedJsonPath: json.path });
  }
  return converted;
}
var ensureRequestCommand, listRequestsCommand, deleteRequestCommand, listReportsCommand, listInstancesCommand, listSegmentsCommand, SELECTOR_FLAGS, downloadCommand, reportsAnalyticsCommand;
var init_reports_analytics = __esm({
  "dist/cli/commands/reports-analytics.js"() {
    "use strict";
    init_dist();
    init_analytics_reports();
    init_analytics_reports2();
    init_report_files();
    init_context();
    init_exit_codes();
    init_output();
    init_read_scope();
    init_report_flags();
    ensureRequestCommand = defineCommand({
      meta: {
        name: "ensure-request",
        description: "Create the app's analytics report request, or reuse the active one (idempotent; first data takes 1-2 days)"
      },
      args: {
        app: {
          type: "string",
          required: true,
          valueHint: "appId",
          description: "The app's ASC id (from 'asc apps list')"
        },
        "access-type": {
          type: "string",
          valueHint: "ONGOING",
          description: "ONGOING (default; continuously generated reports) or ONE_TIME_SNAPSHOT (historical backfill)"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const accessType = resolveAccessType(ctx.args["access-type"]);
        const result = await ensureAnalyticsReportRequest(await cli.client(), ctx.args.app, accessType);
        const rateLimit = cli.lastRateLimit();
        emitResult(cli.io, documentEnvelope("reports analytics ensure-request", { data: result.request }, {
          resolved: {
            created: result.created,
            ...result.stoppedRequestIds.length > 0 && {
              stoppedRequestIds: result.stoppedRequestIds
            }
          },
          ...rateLimit !== void 0 && { rateLimit }
        }));
      }
    });
    listRequestsCommand = defineCommand({
      meta: {
        name: "list-requests",
        description: "List the app's analytics report requests (check stoppedDueToInactivity here)"
      },
      args: {
        app: {
          type: "string",
          required: true,
          valueHint: "appId",
          description: "The app's ASC id"
        },
        "access-type": {
          type: "string",
          valueHint: "ONGOING",
          description: "Filter by access type: ONGOING or ONE_TIME_SNAPSHOT"
        },
        ...readScopeArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const rawAccessType = ctx.args["access-type"];
        const read = await listAnalyticsReportRequests(await cli.client(), ctx.args.app, {
          scope,
          ...pageLimit !== void 0 && { pageLimit },
          ...rawAccessType !== void 0 && {
            accessType: [resolveAccessType(rawAccessType)]
          }
        });
        emitResult(cli.io, listEnvelope("reports analytics list-requests", read, scope));
      }
    });
    deleteRequestCommand = defineCommand({
      meta: {
        name: "delete-request",
        description: "Delete an analytics report request (destructive: discards its accumulated reports; a replacement waits 1-2 days for first data)"
      },
      args: {
        requestId: {
          type: "positional",
          required: true,
          description: "The report request's ASC id (from 'list-requests')"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        await deleteAnalyticsReportRequest(await cli.client(), ctx.args.requestId);
        emitResult(cli.io, {
          ok: true,
          command: "reports analytics delete-request",
          data: { id: ctx.args.requestId, deleted: true }
        });
      }
    });
    listReportsCommand = defineCommand({
      meta: {
        name: "list-reports",
        description: "List the reports Apple generates under a report request (names feed 'download')"
      },
      args: {
        request: {
          type: "string",
          required: true,
          valueHint: "requestId",
          description: "The report request's ASC id (from 'ensure-request')"
        },
        category: {
          type: "string",
          valueHint: "APP_USAGE",
          description: "Filter by category: APP_USAGE, APP_STORE_ENGAGEMENT, COMMERCE, FRAMEWORK_USAGE, PERFORMANCE"
        },
        name: {
          type: "string",
          valueHint: "name",
          description: 'Filter by exact report name, e.g. "App Downloads Standard"'
        },
        ...readScopeArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const read = await listAnalyticsReports(await cli.client(), ctx.args.request, {
          scope,
          ...pageLimit !== void 0 && { pageLimit },
          // Enum values pass through for ASC to validate: a stale local list
          // would reject categories Apple has since added.
          ...ctx.args.category !== void 0 && {
            category: [ctx.args.category]
          },
          ...ctx.args.name !== void 0 && { name: [ctx.args.name] }
        });
        emitResult(cli.io, listEnvelope("reports analytics list-reports", read, scope));
      }
    });
    listInstancesCommand = defineCommand({
      meta: {
        name: "list-instances",
        description: "List a report's dated instances (ids feed 'list-segments')"
      },
      args: {
        report: {
          type: "string",
          required: true,
          valueHint: "reportId",
          description: "The report's ASC id (from 'list-reports')"
        },
        granularity: {
          type: "string",
          valueHint: "DAILY",
          description: "Filter by granularity: DAILY, WEEKLY, or MONTHLY"
        },
        date: {
          type: "string",
          valueHint: "2026-06-10",
          description: "Filter by processing date (YYYY-MM-DD)"
        },
        ...readScopeArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        validateProcessingDate(ctx.args.date);
        const read = await listAnalyticsReportInstances(await cli.client(), ctx.args.report, {
          scope,
          ...pageLimit !== void 0 && { pageLimit },
          ...ctx.args.granularity !== void 0 && {
            granularity: [ctx.args.granularity]
          },
          ...ctx.args.date !== void 0 && {
            processingDate: [ctx.args.date]
          }
        });
        emitResult(cli.io, listEnvelope("reports analytics list-instances", read, scope));
      }
    });
    listSegmentsCommand = defineCommand({
      meta: {
        name: "list-segments",
        description: "List an instance's downloadable segments (URLs are short-lived)"
      },
      args: {
        instance: {
          type: "string",
          required: true,
          valueHint: "instanceId",
          description: "The report instance's ASC id (from 'list-instances')"
        },
        ...readScopeArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const read = await listAnalyticsReportSegments(await cli.client(), ctx.args.instance, { scope, ...pageLimit !== void 0 && { pageLimit } });
        emitResult(cli.io, listEnvelope("reports analytics list-segments", read, scope));
      }
    });
    SELECTOR_FLAGS = [
      "app",
      "name",
      "access-type",
      "category",
      "granularity",
      "date"
    ];
    downloadCommand = defineCommand({
      meta: {
        name: "download",
        description: "One-shot download: resolve request \u2192 report \u2192 instance and fetch every segment to a directory"
      },
      args: {
        app: {
          type: "string",
          valueHint: "appId",
          description: "The app's ASC id (selector mode, with --name)"
        },
        name: {
          type: "string",
          valueHint: "name",
          description: 'Exact report name, e.g. "App Downloads Standard" (see list-reports)'
        },
        "access-type": {
          type: "string",
          valueHint: "ONGOING",
          description: "Report request access type (default ONGOING)"
        },
        category: {
          type: "string",
          valueHint: "APP_USAGE",
          description: "Disambiguates when one name matches several categories"
        },
        granularity: {
          type: "string",
          valueHint: "DAILY",
          description: "Instance granularity: DAILY, WEEKLY, or MONTHLY"
        },
        date: {
          type: "string",
          valueHint: "2026-06-10",
          description: "Instance processing date (YYYY-MM-DD); omit for the latest instance"
        },
        instance: {
          type: "string",
          valueHint: "instanceId",
          description: "Download a known instance directly, skipping the selector chain"
        },
        "output-dir": {
          type: "string",
          valueHint: "dir",
          description: "Destination directory (default: analytics-<report>-<granularity>-<date> in the current directory)"
        },
        format: {
          type: "string",
          valueHint: "json",
          description: "Additionally convert each segment to a JSON file next to it"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const format = resolveReportFormat(ctx.args.format);
        const instanceId = ctx.args.instance;
        if (instanceId !== void 0) {
          const conflicting = SELECTOR_FLAGS.filter((flag) => ctx.args[flag] !== void 0);
          if (conflicting.length > 0) {
            throw new CliUsageError(`--instance addresses one instance directly; drop --${conflicting.join(", --")} (they belong to the selector mode).`);
          }
          const directory = ctx.args["output-dir"] ?? `analytics-instance-${instanceId}`;
          const result2 = await downloadAnalyticsInstance(await cli.client(), instanceId, directory);
          const rateLimit2 = cli.lastRateLimit();
          emitResult(cli.io, {
            ok: true,
            command: "reports analytics download",
            data: {
              directory: result2.directory,
              segments: await withJsonConversion(result2.segments, format)
            },
            resolved: { instanceId },
            ...rateLimit2 !== void 0 && { rateLimit: rateLimit2 }
          });
          return;
        }
        if (ctx.args.app === void 0 || ctx.args.name === void 0) {
          throw new CliUsageError("Provide --app and --name to locate the report, or --instance to download a known instance directly.");
        }
        validateProcessingDate(ctx.args.date);
        const selector = {
          appId: ctx.args.app,
          accessType: resolveAccessType(ctx.args["access-type"]),
          reportName: ctx.args.name,
          ...ctx.args.category !== void 0 && {
            category: ctx.args.category
          },
          ...ctx.args.granularity !== void 0 && {
            granularity: ctx.args.granularity
          },
          ...ctx.args.date !== void 0 && { processingDate: ctx.args.date }
        };
        const result = await downloadAnalyticsReport(await cli.client(), selector, {
          ...ctx.args["output-dir"] !== void 0 && {
            directory: ctx.args["output-dir"]
          }
        });
        const rateLimit = cli.lastRateLimit();
        emitResult(cli.io, {
          ok: true,
          command: "reports analytics download",
          data: {
            directory: result.directory,
            segments: await withJsonConversion(result.segments, format)
          },
          // The chain the CLI walked on the caller's behalf; segment URLs are
          // short-lived signed addresses and stay out of the envelope.
          resolved: {
            requestId: result.request.id,
            accessType: selector.accessType,
            reportId: result.report.id,
            reportName: result.report.attributes?.name,
            category: result.report.attributes?.category,
            instanceId: result.instance.id,
            granularity: result.instance.attributes?.granularity,
            processingDate: result.instance.attributes?.processingDate
          },
          ...rateLimit !== void 0 && { rateLimit }
        });
      }
    });
    reportsAnalyticsCommand = defineCommand({
      meta: {
        name: "analytics",
        description: "Analytics report lifecycle: report requests, reports, instances, segment downloads"
      },
      subCommands: {
        "ensure-request": ensureRequestCommand,
        "list-requests": listRequestsCommand,
        "delete-request": deleteRequestCommand,
        "list-reports": listReportsCommand,
        "list-instances": listInstancesCommand,
        "list-segments": listSegmentsCommand,
        download: downloadCommand
      }
    });
  }
});

// dist/cli/report-output.js
async function reportFileData(saved, format) {
  if (format === void 0) {
    return saved;
  }
  const converted = await convertDelimitedReportToJson(saved.path, jsonSiblingPath(saved.path));
  return { ...saved, convertedJsonPath: converted.path };
}
var init_report_output = __esm({
  "dist/cli/report-output.js"() {
    "use strict";
    init_report_files();
  }
});

// dist/cli/commands/reports-finance.js
var downloadCommand2, reportsFinanceCommand;
var init_reports_finance = __esm({
  "dist/cli/commands/reports-finance.js"() {
    "use strict";
    init_dist();
    init_finance_reports();
    init_report_files();
    init_context();
    init_output();
    init_report_flags();
    init_report_output();
    downloadCommand2 = defineCommand({
      meta: {
        name: "download",
        description: "Download one finance report as decompressed TSV (optionally also converted to JSON); needs a key with finance role access"
      },
      args: {
        vendor: {
          type: "string",
          valueHint: "number",
          description: "Vendor number; defaults to ASC_VENDOR_NUMBER (find it in App Store Connect \u2192 Payments and Financial Reports)"
        },
        region: {
          type: "string",
          required: true,
          valueHint: "ZZ",
          description: "Report region code from Payments and Financial Reports (ZZ = all regions consolidated)"
        },
        date: {
          type: "string",
          required: true,
          valueHint: "2026-05",
          description: "Apple fiscal month as YYYY-MM"
        },
        type: {
          type: "string",
          valueHint: "FINANCIAL",
          description: "FINANCIAL (default) or FINANCE_DETAIL"
        },
        output: {
          type: "string",
          valueHint: "path",
          description: "Destination file path (default: finance-<TYPE>-<REGION>-<YYYY-MM>.tsv in the current directory)"
        },
        format: {
          type: "string",
          valueHint: "json",
          description: "Additionally convert the report to a JSON file next to the TSV"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        validateFinanceReportDate(ctx.args.date);
        const format = resolveReportFormat(ctx.args.format);
        const spec = {
          vendorNumber: resolveVendorNumber(ctx.args.vendor, cli.env),
          regionCode: ctx.args.region,
          reportDate: ctx.args.date,
          // The enum value passes through for ASC to validate: a stale local
          // list would reject report types Apple has since added.
          reportType: ctx.args.type ?? "FINANCIAL"
        };
        const destination = ctx.args.output ?? defaultFinanceReportFileName(spec);
        const saved = await downloadFinanceReport(await cli.client(), spec, destination);
        const file = await reportFileData(saved, format);
        const rateLimit = cli.lastRateLimit();
        emitResult(cli.io, {
          ok: true,
          command: "reports finance download",
          data: {
            file,
            report: {
              vendorNumber: maskVendorNumber(spec.vendorNumber),
              reportType: spec.reportType,
              regionCode: spec.regionCode,
              reportDate: spec.reportDate
            }
          },
          ...rateLimit !== void 0 && { rateLimit }
        });
      }
    });
    reportsFinanceCommand = defineCommand({
      meta: {
        name: "finance",
        description: "Finance report downloads"
      },
      subCommands: {
        download: downloadCommand2
      }
    });
  }
});

// dist/cli/commands/reports-sales.js
var downloadCommand3, reportsSalesCommand;
var init_reports_sales = __esm({
  "dist/cli/commands/reports-sales.js"() {
    "use strict";
    init_dist();
    init_report_files();
    init_sales_reports();
    init_context();
    init_output();
    init_report_flags();
    init_report_output();
    downloadCommand3 = defineCommand({
      meta: {
        name: "download",
        description: "Download one sales/trends report as decompressed TSV (optionally also converted to JSON)"
      },
      args: {
        vendor: {
          type: "string",
          valueHint: "number",
          description: "Vendor number; defaults to ASC_VENDOR_NUMBER (find it in App Store Connect \u2192 Payments and Financial Reports)"
        },
        type: {
          type: "string",
          valueHint: "SALES",
          description: "Report type (default SALES); e.g. SALES, SUBSCRIPTION, SUBSCRIBER, INSTALLS"
        },
        subtype: {
          type: "string",
          valueHint: "SUMMARY",
          description: "Report sub-type (default SUMMARY); e.g. SUMMARY, DETAILED"
        },
        frequency: {
          type: "string",
          valueHint: "DAILY",
          description: "DAILY (default), WEEKLY, MONTHLY, or YEARLY"
        },
        date: {
          type: "string",
          valueHint: "2026-06-10",
          description: "Report date (DAILY/WEEKLY: YYYY-MM-DD; MONTHLY: YYYY-MM; YEARLY: YYYY). Omit for the latest available report"
        },
        "report-version": {
          type: "string",
          valueHint: "1_1",
          description: "Report format version; ASC's default applies when omitted"
        },
        output: {
          type: "string",
          valueHint: "path",
          description: "Destination file path (default: sales-<TYPE>-<SUBTYPE>-<FREQ>-<date>.tsv in the current directory)"
        },
        format: {
          type: "string",
          valueHint: "json",
          description: "Additionally convert the report to a JSON file next to the TSV"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const frequency = resolveSalesFrequency(ctx.args.frequency);
        validateSalesReportDate(frequency, ctx.args.date);
        const format = resolveReportFormat(ctx.args.format);
        const spec = {
          vendorNumber: resolveVendorNumber(ctx.args.vendor, cli.env),
          // Enum values pass through for ASC to validate: a stale local list
          // would reject report types Apple has since added.
          reportType: ctx.args.type ?? "SALES",
          reportSubType: ctx.args.subtype ?? "SUMMARY",
          frequency,
          ...ctx.args.date !== void 0 && { reportDate: ctx.args.date },
          ...ctx.args["report-version"] !== void 0 && {
            version: ctx.args["report-version"]
          }
        };
        const destination = ctx.args.output ?? defaultSalesReportFileName(spec);
        const saved = await downloadSalesReport(await cli.client(), spec, destination);
        const file = await reportFileData(saved, format);
        const rateLimit = cli.lastRateLimit();
        emitResult(cli.io, {
          ok: true,
          command: "reports sales download",
          data: {
            file,
            report: {
              vendorNumber: maskVendorNumber(spec.vendorNumber),
              reportType: spec.reportType,
              reportSubType: spec.reportSubType,
              frequency: spec.frequency,
              reportDate: spec.reportDate ?? "latest",
              ...spec.version !== void 0 && { version: spec.version }
            }
          },
          ...rateLimit !== void 0 && { rateLimit }
        });
      }
    });
    reportsSalesCommand = defineCommand({
      meta: {
        name: "sales",
        description: "Sales and trends report downloads"
      },
      subCommands: {
        download: downloadCommand3
      }
    });
  }
});

// dist/cli/commands/reports.js
var reportsCommand;
var init_reports = __esm({
  "dist/cli/commands/reports.js"() {
    "use strict";
    init_dist();
    init_reports_analytics();
    init_reports_finance();
    init_reports_sales();
    reportsCommand = defineCommand({
      meta: {
        name: "reports",
        description: "Sales, finance, and analytics report workflows"
      },
      subCommands: {
        sales: reportsSalesCommand,
        finance: reportsFinanceCommand,
        analytics: reportsAnalyticsCommand
      }
    });
  }
});

// dist/cli/commands/reviews.js
import { readFile as readFile3 } from "node:fs/promises";
var listCommand7, getCommand5, getResponseCommand, respondCommand, reviewsCommand;
var init_reviews = __esm({
  "dist/cli/commands/reviews.js"() {
    "use strict";
    init_dist();
    init_customer_reviews();
    init_context();
    init_exit_codes();
    init_output();
    init_read_scope();
    listCommand7 = defineCommand({
      meta: {
        name: "list",
        description: "List customer reviews for an app or a version"
      },
      args: {
        app: {
          type: "string",
          valueHint: "appId",
          description: "List reviews across the app (exclusive with --version)"
        },
        version: {
          type: "string",
          valueHint: "versionId",
          description: "List reviews for one version (exclusive with --app)"
        },
        rating: {
          type: "string",
          valueHint: "1,2",
          description: "Filter by star rating (comma-separated, 1-5)"
        },
        territory: {
          type: "string",
          valueHint: "USA,DEU",
          description: "Filter by storefront territory (comma-separated)"
        },
        unanswered: {
          type: "boolean",
          description: "Only reviews without a published developer response"
        },
        answered: {
          type: "boolean",
          description: "Only reviews with a published developer response"
        },
        sort: {
          type: "string",
          valueHint: "-createdDate",
          description: "Sort: rating, -rating, createdDate, -createdDate"
        },
        fields: {
          type: "string",
          valueHint: "rating,title,body",
          description: "Sparse field selection (comma-separated)"
        },
        ...readScopeArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const { app, version } = ctx.args;
        if (app === void 0 === (version === void 0)) {
          throw new CliUsageError("Pass exactly one of --app <appId> or --version <versionId>.");
        }
        if (ctx.args.unanswered === true && ctx.args.answered === true) {
          throw new CliUsageError("--unanswered and --answered are mutually exclusive.");
        }
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const rating = csvList(ctx.args.rating);
        const territory = csvList(ctx.args.territory);
        const sort = csvList(ctx.args.sort);
        const fields = csvList(ctx.args.fields);
        const options = {
          scope,
          ...pageLimit !== void 0 && { pageLimit },
          ...rating !== void 0 && { rating },
          ...territory !== void 0 && { territory },
          ...ctx.args.unanswered === true && { hasPublishedResponse: false },
          ...ctx.args.answered === true && { hasPublishedResponse: true },
          ...sort !== void 0 && { sort },
          ...fields !== void 0 && { fields }
        };
        const client = await cli.client();
        const read = app !== void 0 ? await listCustomerReviewsForApp(client, app, options) : version !== void 0 ? await listCustomerReviewsForVersion(client, version, options) : (
          // Unreachable: the exactly-one validation above already threw.
          await Promise.reject(new CliUsageError("Pass exactly one of --app <appId> or --version <versionId>."))
        );
        emitResult(cli.io, listEnvelope("reviews list", read, scope));
      }
    });
    getCommand5 = defineCommand({
      meta: {
        name: "get",
        description: "Read one customer review by its ASC id"
      },
      args: {
        reviewId: {
          type: "positional",
          required: true,
          description: "The review's ASC id (from 'asc reviews list')"
        },
        "include-response": {
          type: "boolean",
          description: "Include the developer response in the document"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const document = await getCustomerReview(await cli.client(), ctx.args.reviewId, {
          ...ctx.args["include-response"] === true && {
            include: ["response"]
          }
        });
        emitResult(cli.io, documentEnvelope("reviews get", document));
      }
    });
    getResponseCommand = defineCommand({
      meta: {
        name: "get-response",
        description: "Read the developer response to a review (not-found means no response yet)"
      },
      args: {
        review: {
          type: "string",
          required: true,
          valueHint: "reviewId",
          description: "The review's ASC id"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const document = await getCustomerReviewResponse(await cli.client(), ctx.args.review);
        emitResult(cli.io, documentEnvelope("reviews get-response", document));
      }
    });
    respondCommand = defineCommand({
      meta: {
        name: "respond",
        description: "Post the developer response to a review, replacing any existing one (publication is asynchronous)"
      },
      args: {
        review: {
          type: "string",
          required: true,
          valueHint: "reviewId",
          description: "The review's ASC id"
        },
        body: {
          type: "string",
          description: "Response text (exclusive with --body-file)"
        },
        "body-file": {
          type: "string",
          valueHint: "reply.txt",
          description: "File whose content is sent verbatim as the response (for multi-line text)"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const inline = ctx.args.body;
        const fromFile = ctx.args["body-file"];
        if (inline !== void 0 && fromFile !== void 0) {
          throw new CliUsageError("Pass exactly one of --body <text> or --body-file <file>.");
        }
        let body;
        if (inline !== void 0) {
          body = inline;
        } else if (fromFile !== void 0) {
          try {
            body = await readFile3(fromFile, "utf8");
          } catch {
            throw new CliUsageError(`Cannot read the --body-file at "${fromFile}".`);
          }
        } else {
          throw new CliUsageError("Pass exactly one of --body <text> or --body-file <file>.");
        }
        if (body.trim() === "") {
          throw new CliUsageError("The response body must not be empty.");
        }
        const document = await setCustomerReviewResponse(await cli.client(), ctx.args.review, body);
        emitResult(cli.io, documentEnvelope("reviews respond", document));
      }
    });
    reviewsCommand = defineCommand({
      meta: {
        name: "reviews",
        description: "Read customer reviews; post or replace developer responses"
      },
      subCommands: {
        list: listCommand7,
        get: getCommand5,
        "get-response": getResponseCommand,
        respond: respondCommand
      }
    });
  }
});

// dist/cli/review-detail-redaction.js
function redactReviewDetailSecrets(resource) {
  const { attributes, ...rest } = resource;
  if (attributes === void 0) {
    return {
      ...rest,
      attributes: { demoAccountPasswordSet: false }
    };
  }
  const { demoAccountPassword, ...safeAttributes } = attributes;
  return {
    ...rest,
    attributes: {
      ...safeAttributes,
      demoAccountPasswordSet: demoAccountPassword !== void 0 && demoAccountPassword !== ""
    }
  };
}
var init_review_detail_redaction = __esm({
  "dist/cli/review-detail-redaction.js"() {
    "use strict";
  }
});

// dist/cli/commands/submission-shared.js
function parseReleaseType(raw) {
  if (RELEASE_TYPES.includes(raw)) {
    return raw;
  }
  throw new CliUsageError(`--release-type expects one of ${RELEASE_TYPES.join(" | ")}, got "${raw}".`);
}
function parseIsoDateTime(raw, flag) {
  if (!ISO_DATE_TIME.test(raw) || Number.isNaN(Date.parse(raw))) {
    throw new CliUsageError(`${flag} expects a full ISO-8601 date-time with a timezone (e.g. 2026-07-01T12:00:00-07:00), got "${raw}".`);
  }
  return raw;
}
function parseExplicitBoolean(raw, flag) {
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  throw new CliUsageError(`${flag} expects true or false, got "${raw ?? "(missing)"}".`);
}
async function resolveAppId(cli, versionId, explicitAppId) {
  if (explicitAppId !== void 0) {
    return explicitAppId;
  }
  const version = await getAppStoreVersion(await cli.client(), versionId, {
    include: ["app"]
  });
  const appId = version.data.relationships?.app?.data?.id;
  if (appId === void 0) {
    throw new CliUsageError(`Could not resolve the app for version ${versionId}; pass --app <appId> explicitly.`);
  }
  return appId;
}
var RELEASE_TYPES, ISO_DATE_TIME;
var init_submission_shared = __esm({
  "dist/cli/commands/submission-shared.js"() {
    "use strict";
    init_app_store_versions_release();
    init_exit_codes();
    RELEASE_TYPES = [
      "MANUAL",
      "AFTER_APPROVAL",
      "SCHEDULED"
    ];
    ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
  }
});

// dist/cli/commands/submission-release.js
var submitCommand, cancelCommand, releaseCommand, submissionSubmitCommand, submissionCancelCommand, submissionReleaseCommand;
var init_submission_release = __esm({
  "dist/cli/commands/submission-release.js"() {
    "use strict";
    init_dist();
    init_submission_assembly();
    init_submission_assembly();
    init_context();
    init_output();
    init_submission_shared();
    init_testflight_shared();
    submitCommand = defineCommand({
      meta: {
        name: "submit",
        description: "Submit an App Store version for review. HIGH SIDE EFFECT: starts a REAL Apple App Review on the live store listing. Requires --force"
      },
      args: {
        version: {
          type: "string",
          required: true,
          valueHint: "versionId",
          description: "The App Store version's ASC id (from 'versions list')"
        },
        app: {
          type: "string",
          valueHint: "appId",
          description: "The app's ASC id (the review container is app-scoped; resolved from the version when omitted)"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        requireForce(ctx.args.force, "Submitting a version for App Review (it starts a real Apple review and goes to the public store)");
        const appId = await resolveAppId(cli, ctx.args.version, ctx.args.app);
        const result = await submitVersionForReview(await cli.client(), appId, ctx.args.version);
        emitResult(cli.io, {
          ok: true,
          command: "submission submit",
          data: {
            submissionId: result.submission.id,
            itemId: result.item.id,
            appId,
            versionId: ctx.args.version,
            containerCreated: result.containerCreated,
            itemCreated: result.itemCreated,
            submitted: result.submitted,
            accepted: true
          }
        });
      }
    });
    cancelCommand = defineCommand({
      meta: {
        name: "cancel",
        description: "Cancel (withdraw) a review submission. HIGH SIDE EFFECT: the version flips to Developer Rejected and a re-submit reviews from scratch. Requires --force"
      },
      args: {
        submissionId: {
          type: "positional",
          required: true,
          description: "The reviewSubmission's ASC id (from 'status list')"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        requireForce(ctx.args.force, "Canceling a review submission (it forces a fresh review on re-submit and cannot be un-canceled)");
        const result = await cancelReviewSubmission(await cli.client(), ctx.args.submissionId);
        emitResult(cli.io, {
          ok: true,
          command: "submission cancel",
          data: {
            submissionId: result.submission.id,
            canceled: result.canceled,
            accepted: true
          }
        });
      }
    });
    releaseCommand = defineCommand({
      meta: {
        name: "release",
        description: "Release an approved version to the public now. HIGH SIDE EFFECT: immediate public release (only for a MANUAL version pending developer release); irreversible. Requires --force"
      },
      args: {
        version: {
          type: "string",
          required: true,
          valueHint: "versionId",
          description: "The approved App Store version's ASC id"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        requireForce(ctx.args.force, "Releasing a version to the public (it goes live immediately and cannot be undone)");
        const result = await releaseVersionNow(await cli.client(), ctx.args.version);
        emitResult(cli.io, {
          ok: true,
          command: "submission release",
          data: {
            versionId: ctx.args.version,
            releaseRequestId: result.releaseRequestId,
            accepted: result.accepted
          }
        });
      }
    });
    submissionSubmitCommand = submitCommand;
    submissionCancelCommand = cancelCommand;
    submissionReleaseCommand = releaseCommand;
  }
});

// dist/cli/commands/submission-status.js
var statusListCommand, statusGetCommand, submissionStatusCommand;
var init_submission_status = __esm({
  "dist/cli/commands/submission-status.js"() {
    "use strict";
    init_dist();
    init_review_submissions();
    init_context();
    init_output();
    init_read_scope();
    statusListCommand = defineCommand({
      meta: {
        name: "list",
        description: "List an app's App Store review submissions (filter by state/platform)"
      },
      args: {
        app: {
          type: "string",
          required: true,
          valueHint: "appId",
          description: "The app's ASC id (the only lookup key; required by Apple)"
        },
        state: {
          type: "string",
          valueHint: "READY_FOR_REVIEW",
          description: "Filter by submission state"
        },
        platform: {
          type: "string",
          valueHint: "IOS",
          description: "Filter by platform"
        },
        ...readScopeArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const options = {
          appId: ctx.args.app,
          scope,
          ...pageLimit !== void 0 && { pageLimit },
          ...ctx.args.state !== void 0 && {
            state: [
              ctx.args.state
            ]
          },
          ...ctx.args.platform !== void 0 && {
            platform: [
              ctx.args.platform
            ]
          }
        };
        const read = await listReviewSubmissions(await cli.client(), options);
        emitResult(cli.io, listEnvelope("submission status list", read, scope, {
          appId: ctx.args.app
        }));
      }
    });
    statusGetCommand = defineCommand({
      meta: {
        name: "get",
        description: "Read one App Store review submission by id, with includes"
      },
      args: {
        submissionId: {
          type: "positional",
          required: true,
          description: "The reviewSubmission's ASC id (from 'status list')"
        },
        include: {
          type: "string",
          valueHint: "app,items,appStoreVersionForReview",
          description: "Related resources to include (comma-separated)"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const options = {
          ...csvList(ctx.args.include) !== void 0 && {
            include: csvList(ctx.args.include)
          }
        };
        const document = await getReviewSubmission(await cli.client(), ctx.args.submissionId, options);
        emitResult(cli.io, documentEnvelope("submission status get", document, {
          resolved: { submissionId: ctx.args.submissionId }
        }));
      }
    });
    submissionStatusCommand = defineCommand({
      meta: {
        name: "status",
        description: "App Store review submission status (read-only): list (by app), get (by id)"
      },
      subCommands: {
        list: statusListCommand,
        get: statusGetCommand
      }
    });
  }
});

// dist/cli/commands/submission.js
var preflightCommand, reviewDetailGetCommand, reviewDetailSetCommand, reviewDetailCommand, releaseConfigSetCommand, releaseConfigCommand, exportComplianceSetCommand, exportComplianceCommand, submissionCommand;
var init_submission = __esm({
  "dist/cli/commands/submission.js"() {
    "use strict";
    init_dist();
    init_app_store_review_details();
    init_app_store_versions_release();
    init_export_compliance();
    init_submission_preflight();
    init_context();
    init_exit_codes();
    init_output();
    init_review_detail_redaction();
    init_submission_release();
    init_submission_shared();
    init_submission_status();
    preflightCommand = defineCommand({
      meta: {
        name: "preflight",
        description: "Read-only submission-readiness check for a version: aggregates blockers (missing build/review-detail/age-rating, export compliance, editability, localizations)"
      },
      args: {
        version: {
          type: "string",
          required: true,
          valueHint: "versionId",
          description: "The App Store version's ASC id (from 'versions list')"
        },
        app: {
          type: "string",
          valueHint: "appId",
          description: "The app's ASC id (needed for the age-rating check; resolved from the version when omitted)"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const appId = await resolveAppId(cli, ctx.args.version, ctx.args.app);
        const result = await preflightVersionSubmission(await cli.client(), appId, ctx.args.version);
        emitResult(cli.io, {
          ok: true,
          command: "submission preflight",
          data: {
            submittable: result.submittable,
            blockers: result.blockers,
            snapshot: result.snapshot
          },
          resolved: { appId, versionId: ctx.args.version }
        });
      }
    });
    reviewDetailGetCommand = defineCommand({
      meta: {
        name: "get",
        description: "Read a version's App Store review detail (contact + demo account + notes)"
      },
      args: {
        version: {
          type: "string",
          required: true,
          valueHint: "versionId",
          description: "The App Store version's ASC id"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const detail = await getAppStoreReviewDetail(await cli.client(), ctx.args.version);
        emitResult(cli.io, documentEnvelope("submission review-detail get", { data: redactReviewDetailSecrets(detail) }, { resolved: { versionId: ctx.args.version, detailId: detail.id } }));
      }
    });
    reviewDetailSetCommand = defineCommand({
      meta: {
        name: "set",
        description: "Set a version's App Store review detail (find-or-create by version): contact + demo account + notes"
      },
      args: {
        version: {
          type: "string",
          required: true,
          valueHint: "versionId",
          description: "The App Store version's ASC id (the lookup key)"
        },
        "contact-email": { type: "string", description: "Review contact email" },
        "contact-first-name": {
          type: "string",
          description: "Review contact first name"
        },
        "contact-last-name": {
          type: "string",
          description: "Review contact last name"
        },
        "contact-phone": { type: "string", description: "Review contact phone" },
        "demo-account-name": {
          type: "string",
          description: "Demo account username for the reviewer"
        },
        "demo-account-password": {
          type: "string",
          description: "Demo account password for the reviewer"
        },
        "demo-account-required": {
          type: "string",
          valueHint: "true",
          description: "Whether a demo account is required (true/false)"
        },
        notes: { type: "string", description: "Notes for the reviewer" }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const attributes = {
          ...ctx.args["contact-email"] !== void 0 && {
            contactEmail: ctx.args["contact-email"]
          },
          ...ctx.args["contact-first-name"] !== void 0 && {
            contactFirstName: ctx.args["contact-first-name"]
          },
          ...ctx.args["contact-last-name"] !== void 0 && {
            contactLastName: ctx.args["contact-last-name"]
          },
          ...ctx.args["contact-phone"] !== void 0 && {
            contactPhone: ctx.args["contact-phone"]
          },
          ...ctx.args["demo-account-name"] !== void 0 && {
            demoAccountName: ctx.args["demo-account-name"]
          },
          ...ctx.args["demo-account-password"] !== void 0 && {
            demoAccountPassword: ctx.args["demo-account-password"]
          },
          ...ctx.args["demo-account-required"] !== void 0 && {
            demoAccountRequired: parseExplicitBoolean(ctx.args["demo-account-required"], "--demo-account-required")
          },
          ...ctx.args.notes !== void 0 && { notes: ctx.args.notes }
        };
        if (Object.keys(attributes).length === 0) {
          throw new CliUsageError("review-detail set needs at least one field (--contact-*/--demo-account-*/--notes).");
        }
        const client = await cli.client();
        const existing = await findAppStoreReviewDetail(client, ctx.args.version);
        if (existing !== void 0) {
          const document2 = await updateAppStoreReviewDetail(client, existing.id, attributes);
          emitResult(cli.io, documentEnvelope("submission review-detail set", { ...document2, data: redactReviewDetailSecrets(document2.data) }, {
            resolved: {
              versionId: ctx.args.version,
              detailId: existing.id,
              created: false
            }
          }));
          return;
        }
        const document = await createAppStoreReviewDetail(client, ctx.args.version, attributes);
        emitResult(cli.io, documentEnvelope("submission review-detail set", { ...document, data: redactReviewDetailSecrets(document.data) }, {
          resolved: {
            versionId: ctx.args.version,
            detailId: document.data.id,
            created: true
          }
        }));
      }
    });
    reviewDetailCommand = defineCommand({
      meta: {
        name: "review-detail",
        description: "App Store review detail (contact + demo account + notes), per version: get/set"
      },
      subCommands: {
        get: reviewDetailGetCommand,
        set: reviewDetailSetCommand
      }
    });
    releaseConfigSetCommand = defineCommand({
      meta: {
        name: "set",
        description: "Configure a version's release timing and attached build (releaseType / earliest date / downloadable / build)"
      },
      args: {
        version: {
          type: "string",
          required: true,
          valueHint: "versionId",
          description: "The App Store version's ASC id"
        },
        "release-type": {
          type: "string",
          valueHint: "MANUAL",
          description: "MANUAL | AFTER_APPROVAL | SCHEDULED"
        },
        "earliest-release-date": {
          type: "string",
          valueHint: "2026-07-01T12:00:00-07:00",
          description: "ISO date-time; only meaningful with SCHEDULED"
        },
        downloadable: {
          type: "string",
          valueHint: "true",
          description: "Whether the version is downloadable (true/false)"
        },
        build: {
          type: "string",
          valueHint: "buildId",
          description: "Build id to attach/swap (the version-side build relationship)"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const config = {
          ...ctx.args["release-type"] !== void 0 && {
            releaseType: parseReleaseType(ctx.args["release-type"])
          },
          ...ctx.args["earliest-release-date"] !== void 0 && {
            earliestReleaseDate: parseIsoDateTime(ctx.args["earliest-release-date"], "--earliest-release-date")
          },
          ...ctx.args.downloadable !== void 0 && {
            downloadable: parseExplicitBoolean(ctx.args.downloadable, "--downloadable")
          },
          ...ctx.args.build !== void 0 && { buildId: ctx.args.build }
        };
        if (Object.keys(config).length === 0) {
          throw new CliUsageError("release-config set needs at least one field (--release-type/--earliest-release-date/--downloadable/--build).");
        }
        const document = await updateAppStoreVersionRelease(await cli.client(), ctx.args.version, config);
        emitResult(cli.io, documentEnvelope("submission release-config set", document, {
          resolved: { versionId: ctx.args.version }
        }));
      }
    });
    releaseConfigCommand = defineCommand({
      meta: {
        name: "release-config",
        description: "Version release timing + build configuration (low side-effect): set"
      },
      subCommands: {
        set: releaseConfigSetCommand
      }
    });
    exportComplianceSetCommand = defineCommand({
      meta: {
        name: "set",
        description: "Set a build's export-compliance encryption flag (usesNonExemptEncryption)"
      },
      args: {
        build: {
          type: "string",
          required: true,
          valueHint: "buildId",
          description: "The build's ASC id (from 'builds list')"
        },
        "uses-non-exempt-encryption": {
          type: "string",
          required: true,
          valueHint: "false",
          description: "Whether the build uses non-exempt encryption (true/false)"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const usesNonExemptEncryption = parseExplicitBoolean(ctx.args["uses-non-exempt-encryption"], "--uses-non-exempt-encryption");
        const document = await setBuildExportCompliance(await cli.client(), ctx.args.build, usesNonExemptEncryption);
        emitResult(cli.io, documentEnvelope("submission export-compliance set", document, {
          resolved: { buildId: ctx.args.build, usesNonExemptEncryption }
        }));
      }
    });
    exportComplianceCommand = defineCommand({
      meta: {
        name: "export-compliance",
        description: "Build export-compliance encryption flag (low side-effect): set"
      },
      subCommands: {
        set: exportComplianceSetCommand
      }
    });
    submissionCommand = defineCommand({
      meta: {
        name: "submission",
        description: "App Store submission and release: preflight, status, review-detail, release-config, export-compliance, submit/cancel/release (high side effect)"
      },
      subCommands: {
        preflight: preflightCommand,
        status: submissionStatusCommand,
        "review-detail": reviewDetailCommand,
        "release-config": releaseConfigCommand,
        "export-compliance": exportComplianceCommand,
        submit: submissionSubmitCommand,
        cancel: submissionCancelCommand,
        release: submissionReleaseCommand
      }
    });
  }
});

// dist/cli/commands/testflight-feedback.js
function listFeedbackOptions(args, scope, pageLimit) {
  const build = csvList(args.build);
  const tester = csvList(args.tester);
  const deviceModel = csvList(args["device-model"]);
  const osVersion = csvList(args["os-version"]);
  const sort = csvList(args.sort);
  return {
    scope,
    ...pageLimit !== void 0 && { pageLimit },
    ...build !== void 0 && { build },
    ...tester !== void 0 && { tester },
    ...deviceModel !== void 0 && { deviceModel },
    ...osVersion !== void 0 && { osVersion },
    ...sort !== void 0 && { sort }
  };
}
function sanitizeScreenshotSubmission(submission) {
  const screenshots = submission.attributes?.screenshots;
  if (screenshots === void 0) {
    return submission;
  }
  return {
    ...submission,
    attributes: {
      ...submission.attributes,
      screenshots: screenshots.map((image) => {
        const { url, ...rest } = image;
        const sanitizedUrl = url === void 0 ? void 0 : sanitizeScreenshotUrl(url);
        return {
          ...rest,
          ...sanitizedUrl !== void 0 && { sanitizedUrl }
        };
      })
    }
  };
}
function parseKind(raw) {
  if (raw === "crash" || raw === "screenshot") {
    return raw;
  }
  throw new CliUsageError(`--kind expects crash, screenshot, or both, got "${raw ?? "(missing)"}".`);
}
var feedbackFilterArgs, listCrashesCommand, listScreenshotsCommand, getCrashCommand, getScreenshotCommand, downloadCommand4, testflightFeedbackCommand;
var init_testflight_feedback2 = __esm({
  "dist/cli/commands/testflight-feedback.js"() {
    "use strict";
    init_dist();
    init_testflight_feedback();
    init_feedback_files();
    init_context();
    init_exit_codes();
    init_output();
    init_read_scope();
    feedbackFilterArgs = {
      app: {
        type: "string",
        required: true,
        valueHint: "appId",
        description: "The app's ASC id (feedback is only listable per app)"
      },
      build: {
        type: "string",
        valueHint: "id,id",
        description: "Narrow to specific build id(s)"
      },
      tester: {
        type: "string",
        valueHint: "id,id",
        description: "Narrow to specific tester id(s)"
      },
      "device-model": {
        type: "string",
        valueHint: "iPhone15,3",
        description: "Filter by device model(s)"
      },
      "os-version": {
        type: "string",
        valueHint: "17.0",
        description: "Filter by OS version(s)"
      },
      sort: {
        type: "string",
        valueHint: "-createdDate",
        description: "Sort: createdDate or -createdDate (the only valid keys)"
      }
    };
    listCrashesCommand = defineCommand({
      meta: {
        name: "list-crashes",
        description: "List an app's crash feedback submissions"
      },
      args: { ...feedbackFilterArgs, ...readScopeArgs },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const read = await listCrashFeedback(await cli.client(), ctx.args.app, listFeedbackOptions(ctx.args, scope, pageLimit));
        emitResult(cli.io, listEnvelope("testflight feedback list-crashes", read, scope, {
          appId: ctx.args.app
        }));
      }
    });
    listScreenshotsCommand = defineCommand({
      meta: {
        name: "list-screenshots",
        description: "List an app's screenshot feedback submissions"
      },
      args: { ...feedbackFilterArgs, ...readScopeArgs },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const read = await listScreenshotFeedback(await cli.client(), ctx.args.app, listFeedbackOptions(ctx.args, scope, pageLimit));
        const sanitized = {
          ...read,
          items: read.items.map(sanitizeScreenshotSubmission)
        };
        emitResult(cli.io, listEnvelope("testflight feedback list-screenshots", sanitized, scope, {
          appId: ctx.args.app
        }));
      }
    });
    getCrashCommand = defineCommand({
      meta: {
        name: "get-crash",
        description: "Read one crash feedback submission (--with-log inlines the crash log text)"
      },
      args: {
        id: {
          type: "string",
          required: true,
          valueHint: "submissionId",
          description: "The crash submission's ASC id"
        },
        include: {
          type: "string",
          valueHint: "build,tester",
          description: "Related resources to include"
        },
        "with-log": {
          type: "boolean",
          description: "Also fetch the crash log text (inlined in the authenticated JSON)"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const client = await cli.client();
        const options = {
          ...csvList(ctx.args.include) !== void 0 && {
            include: csvList(ctx.args.include)
          }
        };
        const document = await getCrashFeedback(client, ctx.args.id, options);
        let logText;
        if (ctx.args["with-log"] === true) {
          const log = await getCrashLog(client, ctx.args.id);
          logText = log.data.attributes?.logText;
        }
        emitResult(cli.io, documentEnvelope("testflight feedback get-crash", document, {
          ...logText !== void 0 && { resolved: { logText } }
        }));
      }
    });
    getScreenshotCommand = defineCommand({
      meta: {
        name: "get-screenshot",
        description: "Read one screenshot feedback submission. The signed image URLs are de-queried to origin+path (sanitizedUrl); use 'download' to fetch the bytes"
      },
      args: {
        id: {
          type: "string",
          required: true,
          valueHint: "submissionId",
          description: "The screenshot submission's ASC id"
        },
        include: {
          type: "string",
          valueHint: "build,tester",
          description: "Related resources to include"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const options = {
          ...csvList(ctx.args.include) !== void 0 && {
            include: csvList(ctx.args.include)
          }
        };
        const document = await getScreenshotFeedback(await cli.client(), ctx.args.id, options);
        emitResult(cli.io, documentEnvelope("testflight feedback get-screenshot", {
          data: sanitizeScreenshotSubmission(document.data),
          ...document.included !== void 0 && { included: document.included }
        }));
      }
    });
    downloadCommand4 = defineCommand({
      meta: {
        name: "download",
        description: "Download feedback attachments to a directory (screenshots via auth-free signed URLs, crash logs from the authenticated JSON). The envelope NEVER contains a signed URL \u2014 only on-disk paths"
      },
      args: {
        id: {
          type: "string",
          valueHint: "submissionId",
          description: "A single submission id (requires --kind crash|screenshot)"
        },
        app: {
          type: "string",
          valueHint: "appId",
          description: "Enumerate an app's feedback instead of one id"
        },
        kind: {
          type: "string",
          valueHint: "both",
          description: "crash, screenshot, or both (default both in --app mode)"
        },
        output: {
          type: "string",
          required: true,
          valueHint: "dir",
          description: "Destination directory for the attachments"
        },
        build: {
          type: "string",
          valueHint: "id,id",
          description: "(--app mode) narrow to build id(s)"
        },
        tester: {
          type: "string",
          valueHint: "id,id",
          description: "(--app mode) narrow to tester id(s)"
        },
        "device-model": {
          type: "string",
          valueHint: "iPhone15,3",
          description: "(--app mode) filter by device model(s)"
        },
        "os-version": {
          type: "string",
          valueHint: "17.0",
          description: "(--app mode) filter by OS version(s)"
        },
        sort: {
          type: "string",
          valueHint: "-createdDate",
          description: "(--app mode) sort: createdDate or -createdDate (the only valid keys)"
        },
        ...readScopeArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const hasId = ctx.args.id !== void 0;
        const hasApp = ctx.args.app !== void 0;
        if (hasId === hasApp) {
          throw new CliUsageError("Pass exactly one of --id <submissionId> (+ --kind) or --app <appId> (to enumerate).");
        }
        const scope = resolveReadScope(ctx.args);
        let target;
        const id = ctx.args.id;
        const app = ctx.args.app;
        if (id !== void 0) {
          if (ctx.args.kind === void 0) {
            throw new CliUsageError("--id requires --kind crash or --kind screenshot.");
          }
          target = { id, kind: parseKind(ctx.args.kind) };
        } else if (app !== void 0) {
          const kinds = ctx.args.kind === void 0 || ctx.args.kind === "both" ? ["crash", "screenshot"] : [parseKind(ctx.args.kind)];
          const build = csvList(ctx.args.build);
          const tester = csvList(ctx.args.tester);
          const deviceModel = csvList(ctx.args["device-model"]);
          const osVersion = csvList(ctx.args["os-version"]);
          const sort = csvList(ctx.args.sort);
          const listOptions = {
            ...build !== void 0 && { build },
            ...tester !== void 0 && { tester },
            ...deviceModel !== void 0 && { deviceModel },
            ...osVersion !== void 0 && { osVersion },
            ...sort !== void 0 && { sort }
          };
          target = {
            appId: app,
            kinds,
            scope,
            ...Object.keys(listOptions).length > 0 && { listOptions }
          };
        } else {
          throw new CliUsageError("Pass exactly one of --id <submissionId> (+ --kind) or --app <appId>.");
        }
        const summary = await downloadFeedbackAttachments(await cli.client(), target, ctx.args.output);
        const rateLimit = cli.lastRateLimit();
        emitResult(cli.io, {
          ok: true,
          command: "testflight feedback download",
          data: {
            outputDir: ctx.args.output,
            // The summary items carry on-disk paths, bytes, dimensions,
            // expirationDate, and a de-queried sanitizedUrl — never the signed URL.
            submissions: summary.submissions,
            totals: summary.totals
          },
          ...rateLimit !== void 0 && { rateLimit }
        });
        const anyFailed = summary.submissions.some((item) => item.error !== void 0);
        return anyFailed ? EXIT.ascRequest : EXIT.success;
      }
    });
    testflightFeedbackCommand = defineCommand({
      meta: {
        name: "feedback",
        description: "TestFlight feedback (read-only): list-crashes/list-screenshots/get-crash/get-screenshot/download"
      },
      subCommands: {
        "list-crashes": listCrashesCommand,
        "list-screenshots": listScreenshotsCommand,
        "get-crash": getCrashCommand,
        "get-screenshot": getScreenshotCommand,
        download: downloadCommand4
      }
    });
  }
});

// dist/cli/commands/testflight-groups.js
function csvSort(raw) {
  return raw.split(",").map((value) => value.trim());
}
var listCommand8, getCommand6, createCommand, updateCommand3, deleteCommand3, testersCommand2, addTestersCommand, removeTestersCommand, buildsCommand2, publicLinkCommand, criteriaGetCommand, criteriaSetCommand, criteriaClearCommand, criteriaOptionsCommand, criteriaCommand, criteriaBuildCheckCommand, testflightGroupsCommand;
var init_testflight_groups = __esm({
  "dist/cli/commands/testflight-groups.js"() {
    "use strict";
    init_dist();
    init_beta_groups();
    init_beta_distribution();
    init_context();
    init_exit_codes();
    init_output();
    init_read_scope();
    init_read_scope();
    init_testflight_flags();
    init_testflight_shared();
    listCommand8 = defineCommand({
      meta: {
        name: "list",
        description: "List beta groups, filterable by app, name, or internal flag"
      },
      args: {
        app: {
          type: "string",
          valueHint: "appId",
          description: "Scope to one app's groups"
        },
        name: {
          type: "string",
          valueHint: "name",
          description: "Filter by exact group name"
        },
        internal: {
          type: "boolean",
          description: "Only internal groups (omit for all; --no-internal for external)"
        },
        sort: {
          type: "string",
          valueHint: "name",
          description: "Sort key, e.g. name, -name, createdDate, -createdDate"
        },
        ...readScopeArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const options = {
          scope,
          ...pageLimit !== void 0 && { pageLimit },
          ...ctx.args.app !== void 0 && { app: [ctx.args.app] },
          ...ctx.args.name !== void 0 && { name: [ctx.args.name] },
          ...ctx.args.internal !== void 0 && {
            isInternalGroup: [String(ctx.args.internal)]
          },
          ...ctx.args.sort !== void 0 && {
            sort: csvSort(ctx.args.sort)
          }
        };
        const read = await listBetaGroups(await cli.client(), options);
        emitResult(cli.io, listEnvelope("testflight groups list", read, scope));
      }
    });
    getCommand6 = defineCommand({
      meta: {
        name: "get",
        description: "Read one beta group, optionally including app/builds/testers"
      },
      args: {
        groupId: {
          type: "positional",
          required: true,
          description: "The beta group's ASC id (from 'list')"
        },
        include: {
          type: "string",
          valueHint: "app,builds,betaTesters",
          description: "Related resources to include (comma-separated)"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const options = {
          ...ctx.args.include !== void 0 && {
            include: csvSort(ctx.args.include)
          }
        };
        const document = await getBetaGroup(await cli.client(), ctx.args.groupId, options);
        emitResult(cli.io, documentEnvelope("testflight groups get", document));
      }
    });
    createCommand = defineCommand({
      meta: {
        name: "create",
        description: "Create a beta group for an app. --internal/--all-builds are create-only. Creating with testers attached (not done here) would email invitations"
      },
      args: {
        app: {
          type: "string",
          required: true,
          valueHint: "appId",
          description: "The app to create the group under"
        },
        name: {
          type: "string",
          required: true,
          valueHint: "name",
          description: "The group's display name"
        },
        internal: {
          type: "boolean",
          description: "Create an internal group (create-only; cannot be changed later)"
        },
        "all-builds": {
          type: "boolean",
          description: "Grant access to all builds (create-only; such groups reject explicit build links)"
        },
        feedback: {
          type: "boolean",
          description: "Enable tester feedback for the group"
        },
        "public-link": {
          type: "boolean",
          description: "Enable the public recruitment link (external exposure of the app)"
        },
        "public-link-limit": {
          type: "string",
          valueHint: "N",
          description: "Cap public-link installs at N (implies the limit is enabled)"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        if (ctx.args["public-link"] === true) {
          requireForce(ctx.args.force, "Creating a group with the public link enabled (it exposes the app)");
        }
        const limit = ctx.args["public-link-limit"] !== void 0 ? parsePositiveInt(ctx.args["public-link-limit"], "--public-link-limit") : void 0;
        const document = await createBetaGroup(await cli.client(), ctx.args.app, {
          name: ctx.args.name,
          ...ctx.args.internal === true && { isInternalGroup: true },
          ...ctx.args["all-builds"] === true && { hasAccessToAllBuilds: true },
          ...ctx.args.feedback !== void 0 && {
            feedbackEnabled: ctx.args.feedback
          },
          ...ctx.args["public-link"] !== void 0 && {
            publicLinkEnabled: ctx.args["public-link"]
          },
          ...limit !== void 0 && {
            publicLinkLimit: limit,
            publicLinkLimitEnabled: true
          }
        });
        emitResult(cli.io, documentEnvelope("testflight groups create", document, {
          resolved: { appId: ctx.args.app, name: ctx.args.name }
        }));
      }
    });
    updateCommand3 = defineCommand({
      meta: {
        name: "update",
        description: "Update a group's mutable attributes (name/feedback/public-link/silicon-mac/apple-vision). --internal and --all-builds are create-only and rejected here"
      },
      args: {
        groupId: {
          type: "positional",
          required: true,
          description: "The beta group's ASC id"
        },
        name: {
          type: "string",
          valueHint: "name",
          description: "New display name"
        },
        feedback: {
          type: "boolean",
          description: "Enable (--feedback) or disable (--no-feedback) tester feedback"
        },
        "public-link": {
          type: "boolean",
          description: "Enable (--public-link) or disable (--no-public-link) the public link (enabling exposes the app)"
        },
        "public-link-limit": {
          type: "string",
          valueHint: "N",
          description: "Cap public-link installs at N (implies the limit is enabled)"
        },
        "silicon-mac": {
          type: "boolean",
          description: "Whether iOS builds are available for Apple Silicon Macs"
        },
        "apple-vision": {
          type: "boolean",
          description: "Whether iOS builds are available for Apple Vision"
        },
        // Declared so a caller who passes them gets a precise rejection rather than
        // citty's generic unknown-flag error.
        internal: {
          type: "boolean",
          description: "(rejected: internal is create-only)"
        },
        "all-builds": {
          type: "boolean",
          description: "(rejected: all-builds is create-only)"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        rejectCreateOnlyGroupFlags(ctx.args);
        const limit = ctx.args["public-link-limit"] !== void 0 ? parsePositiveInt(ctx.args["public-link-limit"], "--public-link-limit") : void 0;
        const attributes = {
          ...ctx.args.name !== void 0 && { name: ctx.args.name },
          ...ctx.args.feedback !== void 0 && {
            feedbackEnabled: ctx.args.feedback
          },
          ...ctx.args["public-link"] !== void 0 && {
            publicLinkEnabled: ctx.args["public-link"]
          },
          ...limit !== void 0 && {
            publicLinkLimit: limit,
            publicLinkLimitEnabled: true
          },
          ...ctx.args["silicon-mac"] !== void 0 && {
            iosBuildsAvailableForAppleSiliconMac: ctx.args["silicon-mac"]
          },
          ...ctx.args["apple-vision"] !== void 0 && {
            iosBuildsAvailableForAppleVision: ctx.args["apple-vision"]
          }
        };
        if (Object.keys(attributes).length === 0) {
          throw new CliUsageError("update needs at least one field to change (--name/--feedback/--public-link/--public-link-limit/--silicon-mac/--apple-vision).");
        }
        const document = await updateBetaGroup(await cli.client(), ctx.args.groupId, attributes);
        emitResult(cli.io, documentEnvelope("testflight groups update", document));
      }
    });
    deleteCommand3 = defineCommand({
      meta: {
        name: "delete",
        description: "Delete a beta group (destructive: --force; a non-empty group's members are read and reported first)"
      },
      args: {
        groupId: {
          type: "positional",
          required: true,
          description: "The beta group's ASC id"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        requireForce(ctx.args.force, "Deleting a beta group");
        const client = await cli.client();
        const members = await listGroupTesters(client, ctx.args.groupId, {
          scope: "all-pages"
        });
        await deleteBetaGroup(client, ctx.args.groupId);
        emitResult(cli.io, {
          ok: true,
          command: "testflight groups delete",
          data: {
            id: ctx.args.groupId,
            deleted: true,
            memberCount: members.items.length
          }
        });
      }
    });
    testersCommand2 = defineCommand({
      meta: {
        name: "testers",
        description: "List the testers in a group (the canonical membership read)"
      },
      args: {
        groupId: {
          type: "positional",
          required: true,
          description: "The beta group's ASC id"
        },
        ...readScopeArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const read = await listGroupTesters(await cli.client(), ctx.args.groupId, {
          scope,
          ...pageLimit !== void 0 && { pageLimit }
        });
        emitResult(cli.io, listEnvelope("testflight groups testers", read, scope, {
          groupId: ctx.args.groupId
        }));
      }
    });
    addTestersCommand = defineCommand({
      meta: {
        name: "add-testers",
        description: "Add existing testers to a group. HIGH SIDE EFFECT: emails a real TestFlight invitation to each tester. Requires --force"
      },
      args: {
        groupId: {
          type: "positional",
          required: true,
          description: "The beta group's ASC id"
        },
        testers: {
          type: "string",
          required: true,
          valueHint: "id,id",
          description: "Tester ids to add (from 'asc testflight testers list')"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        requireForce(ctx.args.force, "Adding testers to a group (it emails real invitations)");
        const testerIds = requireIdList(ctx.args.testers, "--testers");
        await addTestersToGroup(await cli.client(), ctx.args.groupId, testerIds);
        emitResult(cli.io, {
          ok: true,
          command: "testflight groups add-testers",
          data: {
            groupId: ctx.args.groupId,
            added: testerIds,
            count: testerIds.length
          }
        });
      }
    });
    removeTestersCommand = defineCommand({
      meta: {
        name: "remove-testers",
        description: "Remove testers from a group (destructive: --force)"
      },
      args: {
        groupId: {
          type: "positional",
          required: true,
          description: "The beta group's ASC id"
        },
        testers: {
          type: "string",
          required: true,
          valueHint: "id,id",
          description: "Tester ids to remove"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        requireForce(ctx.args.force, "Removing testers from a group");
        const testerIds = requireIdList(ctx.args.testers, "--testers");
        await removeTestersFromGroup(await cli.client(), ctx.args.groupId, testerIds);
        emitResult(cli.io, {
          ok: true,
          command: "testflight groups remove-testers",
          data: {
            groupId: ctx.args.groupId,
            removed: testerIds,
            count: testerIds.length
          }
        });
      }
    });
    buildsCommand2 = defineCommand({
      meta: {
        name: "builds",
        description: "List the builds a group can test (visibility only; edit distribution from 'asc builds groups')"
      },
      args: {
        groupId: {
          type: "positional",
          required: true,
          description: "The beta group's ASC id"
        },
        ...readScopeArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const read = await listGroupBuilds(await cli.client(), ctx.args.groupId, {
          scope,
          ...pageLimit !== void 0 && { pageLimit }
        });
        emitResult(cli.io, listEnvelope("testflight groups builds", read, scope, {
          groupId: ctx.args.groupId
        }));
      }
    });
    publicLinkCommand = defineCommand({
      meta: {
        name: "public-link",
        description: "Enable or disable a group's public link. HIGH SIDE EFFECT: enabling publicly exposes the app for external recruitment \u2014 requires --force to confirm"
      },
      args: {
        groupId: {
          type: "positional",
          required: true,
          description: "The beta group's ASC id"
        },
        enable: {
          type: "boolean",
          description: "Enable the public link (mutually exclusive with --disable)"
        },
        disable: {
          type: "boolean",
          description: "Disable the public link"
        },
        limit: {
          type: "string",
          valueHint: "N",
          description: "Set the public-link install cap to N (enables the limit)"
        },
        "no-limit": {
          type: "boolean",
          description: "Disable the public-link install cap"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const enable = ctx.args.enable === true;
        const disable = ctx.args.disable === true;
        if (enable === disable) {
          throw new CliUsageError("public-link needs exactly one of --enable or --disable.");
        }
        if (enable) {
          requireForce(ctx.args.force, "Enabling a public link (it exposes the app for public recruitment)");
        }
        const limit = ctx.args.limit !== void 0 ? parsePositiveInt(ctx.args.limit, "--limit") : void 0;
        if (limit !== void 0 && ctx.args["no-limit"] === true) {
          throw new CliUsageError("--limit and --no-limit are mutually exclusive.");
        }
        const document = await setPublicLink(await cli.client(), ctx.args.groupId, {
          enabled: enable,
          ...limit !== void 0 && { limitEnabled: true, limit },
          ...ctx.args["no-limit"] === true && { limitEnabled: false }
        });
        emitResult(cli.io, documentEnvelope("testflight groups public-link", document, {
          resolved: { enabled: enable }
        }));
      }
    });
    criteriaGetCommand = defineCommand({
      meta: {
        name: "get",
        description: "Read a group's recruitment criteria (device/OS filters)"
      },
      args: {
        groupId: {
          type: "positional",
          required: true,
          description: "The beta group's ASC id"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const document = await readRecruitmentCriteria(await cli.client(), ctx.args.groupId);
        emitResult(cli.io, documentEnvelope("testflight groups criteria get", document, {
          resolved: { groupId: ctx.args.groupId }
        }));
      }
    });
    criteriaSetCommand = defineCommand({
      meta: {
        name: "set",
        description: "Set a group's recruitment criteria from --filter deviceFamily:minOs:maxOs (repeatable; upserts the per-group singleton)"
      },
      args: {
        groupId: {
          type: "positional",
          required: true,
          description: "The beta group's ASC id"
        },
        filter: {
          type: "string",
          required: true,
          valueHint: "IPHONE:15.0:17.0",
          description: "Device/OS filter deviceFamily:minOs:maxOs (OS bounds optional); pass --filter multiple times"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const filters = parseRecruitmentFilters(ctx.args.filter);
        const client = await cli.client();
        const existingId = await findRecruitmentCriterionId(client, ctx.args.groupId);
        const document = await setRecruitmentCriteria(client, ctx.args.groupId, filters, existingId);
        emitResult(cli.io, documentEnvelope("testflight groups criteria set", document, {
          resolved: {
            groupId: ctx.args.groupId,
            updated: existingId !== void 0,
            filterCount: filters.length
          }
        }));
      }
    });
    criteriaClearCommand = defineCommand({
      meta: {
        name: "clear",
        description: "Clear a group's recruitment criteria (destructive: --force)"
      },
      args: {
        groupId: {
          type: "positional",
          required: true,
          description: "The beta group's ASC id"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        requireForce(ctx.args.force, "Clearing recruitment criteria");
        const client = await cli.client();
        const existingId = await findRecruitmentCriterionId(client, ctx.args.groupId);
        if (existingId === void 0) {
          emitResult(cli.io, {
            ok: true,
            command: "testflight groups criteria clear",
            data: { groupId: ctx.args.groupId, cleared: false },
            resolved: { reason: "no criteria configured" }
          });
          return;
        }
        await clearRecruitmentCriteria(client, existingId);
        emitResult(cli.io, {
          ok: true,
          command: "testflight groups criteria clear",
          data: {
            groupId: ctx.args.groupId,
            cleared: true,
            criterionId: existingId
          }
        });
      }
    });
    criteriaOptionsCommand = defineCommand({
      meta: {
        name: "options",
        description: "List the legal device-family / OS-version matrix for criteria"
      },
      args: { ...readScopeArgs },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const read = await listRecruitmentCriterionOptions(await cli.client(), {
          scope,
          ...pageLimit !== void 0 && { pageLimit }
        });
        emitResult(cli.io, listEnvelope("testflight groups criteria options", read, scope));
      }
    });
    criteriaCommand = defineCommand({
      meta: {
        name: "criteria",
        description: "Read, set, clear, or list the matrix for recruitment criteria"
      },
      subCommands: {
        get: criteriaGetCommand,
        set: criteriaSetCommand,
        clear: criteriaClearCommand,
        options: criteriaOptionsCommand
      }
    });
    criteriaBuildCheckCommand = defineCommand({
      meta: {
        name: "criteria-build-check",
        description: "Preflight: does the group's criteria currently match at least one compatible build?"
      },
      args: {
        groupId: {
          type: "positional",
          required: true,
          description: "The beta group's ASC id"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const document = await checkRecruitmentCompatibleBuild(await cli.client(), ctx.args.groupId);
        emitResult(cli.io, documentEnvelope("testflight groups criteria-build-check", document, {
          resolved: {
            groupId: ctx.args.groupId,
            hasCompatibleBuild: document.data.attributes?.hasCompatibleBuild ?? null
          }
        }));
      }
    });
    testflightGroupsCommand = defineCommand({
      meta: {
        name: "groups",
        description: "Beta groups: list/get/create/update/delete, membership, public link, criteria"
      },
      subCommands: {
        list: listCommand8,
        get: getCommand6,
        create: createCommand,
        update: updateCommand3,
        delete: deleteCommand3,
        testers: testersCommand2,
        "add-testers": addTestersCommand,
        "remove-testers": removeTestersCommand,
        builds: buildsCommand2,
        "public-link": publicLinkCommand,
        criteria: criteriaCommand,
        "criteria-build-check": criteriaBuildCheckCommand
      }
    });
  }
});

// dist/cli/commands/testflight-review.js
var testInfoListCommand, testInfoSetCommand, testInfoDeleteCommand, testflightTestInfoCommand, reviewDetailGetCommand2, reviewDetailSetCommand2, testflightReviewDetailCommand;
var init_testflight_review = __esm({
  "dist/cli/commands/testflight-review.js"() {
    "use strict";
    init_dist();
    init_beta_localizations();
    init_beta_review();
    init_beta_distribution();
    init_context();
    init_exit_codes();
    init_output();
    init_read_scope();
    init_review_detail_redaction();
    init_testflight_shared();
    testInfoListCommand = defineCommand({
      meta: {
        name: "list",
        description: "List an app's TestFlight metadata localizations"
      },
      args: {
        app: {
          type: "string",
          required: true,
          valueHint: "appId",
          description: "The app's ASC id"
        },
        locale: {
          type: "string",
          valueHint: "en-US",
          description: "Filter to one locale"
        },
        ...readScopeArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const read = await listBetaAppLocalizations(await cli.client(), {
          scope,
          ...pageLimit !== void 0 && { pageLimit },
          app: [ctx.args.app],
          ...ctx.args.locale !== void 0 && { locale: [ctx.args.locale] }
        });
        emitResult(cli.io, listEnvelope("testflight test-info list", read, scope, {
          appId: ctx.args.app
        }));
      }
    });
    testInfoSetCommand = defineCommand({
      meta: {
        name: "set",
        description: "Set an app's TestFlight metadata for a locale (upserts: creates the locale or patches it)"
      },
      args: {
        app: {
          type: "string",
          required: true,
          valueHint: "appId",
          description: "The app's ASC id"
        },
        locale: {
          type: "string",
          required: true,
          valueHint: "en-US",
          description: "The locale (BCP-47)"
        },
        description: {
          type: "string",
          description: "The beta app description shown to testers"
        },
        "feedback-email": {
          type: "string",
          valueHint: "beta@x.com",
          description: "Where tester feedback is sent"
        },
        "marketing-url": {
          type: "string",
          description: "Marketing URL"
        },
        "privacy-policy-url": {
          type: "string",
          description: "Privacy policy URL"
        },
        "tvos-privacy-policy": {
          type: "string",
          description: "tvOS privacy policy text"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const attributes = {
          ...ctx.args.description !== void 0 && {
            description: ctx.args.description
          },
          ...ctx.args["feedback-email"] !== void 0 && {
            feedbackEmail: ctx.args["feedback-email"]
          },
          ...ctx.args["marketing-url"] !== void 0 && {
            marketingUrl: ctx.args["marketing-url"]
          },
          ...ctx.args["privacy-policy-url"] !== void 0 && {
            privacyPolicyUrl: ctx.args["privacy-policy-url"]
          },
          ...ctx.args["tvos-privacy-policy"] !== void 0 && {
            tvOsPrivacyPolicy: ctx.args["tvos-privacy-policy"]
          }
        };
        if (Object.keys(attributes).length === 0) {
          throw new CliUsageError("test-info set needs at least one field (--description/--feedback-email/--marketing-url/--privacy-policy-url/--tvos-privacy-policy).");
        }
        const result = await upsertBetaAppLocalization(await cli.client(), ctx.args.app, ctx.args.locale, attributes);
        emitResult(cli.io, documentEnvelope("testflight test-info set", { data: result.localization }, {
          resolved: {
            appId: ctx.args.app,
            locale: ctx.args.locale,
            created: result.created
          }
        }));
      }
    });
    testInfoDeleteCommand = defineCommand({
      meta: {
        name: "delete",
        description: "Delete an app's TestFlight metadata localization (destructive: --force)"
      },
      args: {
        localizationId: {
          type: "positional",
          required: true,
          description: "The betaAppLocalization id (from 'list')"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        requireForce(ctx.args.force, "Deleting a TestFlight metadata localization");
        await deleteBetaAppLocalization(await cli.client(), ctx.args.localizationId);
        emitResult(cli.io, {
          ok: true,
          command: "testflight test-info delete",
          data: { id: ctx.args.localizationId, deleted: true }
        });
      }
    });
    testflightTestInfoCommand = defineCommand({
      meta: {
        name: "test-info",
        description: "App-level TestFlight metadata localizations: list/set/delete"
      },
      subCommands: {
        list: testInfoListCommand,
        set: testInfoSetCommand,
        delete: testInfoDeleteCommand
      }
    });
    reviewDetailGetCommand2 = defineCommand({
      meta: {
        name: "get",
        description: "Read an app's beta app review detail (contact + demo account info for external beta review)"
      },
      args: {
        app: {
          type: "string",
          required: true,
          valueHint: "appId",
          description: "The app's ASC id (the only lookup key; not-found means none yet)"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const detail = await getBetaAppReviewDetail(await cli.client(), {
          appId: ctx.args.app
        });
        emitResult(cli.io, documentEnvelope("testflight review-detail get", { data: redactReviewDetailSecrets(detail) }, { resolved: { appId: ctx.args.app, detailId: detail.id } }));
      }
    });
    reviewDetailSetCommand2 = defineCommand({
      meta: {
        name: "set",
        description: "Update the beta app review detail by its id (contact + demo account fields)"
      },
      args: {
        detailId: {
          type: "positional",
          required: true,
          description: "The betaAppReviewDetail id (from 'get')"
        },
        "contact-email": { type: "string", description: "Review contact email" },
        "contact-first-name": {
          type: "string",
          description: "Review contact first name"
        },
        "contact-last-name": {
          type: "string",
          description: "Review contact last name"
        },
        "contact-phone": { type: "string", description: "Review contact phone" },
        "demo-account-name": {
          type: "string",
          description: "Demo account username for the reviewer"
        },
        "demo-account-password": {
          type: "string",
          description: "Demo account password for the reviewer"
        },
        "demo-account-required": {
          type: "boolean",
          description: "Whether a demo account is required to review"
        },
        notes: {
          type: "string",
          description: "Notes for the reviewer"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const attributes = {
          ...ctx.args["contact-email"] !== void 0 && {
            contactEmail: ctx.args["contact-email"]
          },
          ...ctx.args["contact-first-name"] !== void 0 && {
            contactFirstName: ctx.args["contact-first-name"]
          },
          ...ctx.args["contact-last-name"] !== void 0 && {
            contactLastName: ctx.args["contact-last-name"]
          },
          ...ctx.args["contact-phone"] !== void 0 && {
            contactPhone: ctx.args["contact-phone"]
          },
          ...ctx.args["demo-account-name"] !== void 0 && {
            demoAccountName: ctx.args["demo-account-name"]
          },
          ...ctx.args["demo-account-password"] !== void 0 && {
            demoAccountPassword: ctx.args["demo-account-password"]
          },
          ...ctx.args["demo-account-required"] !== void 0 && {
            demoAccountRequired: ctx.args["demo-account-required"]
          },
          ...ctx.args.notes !== void 0 && { notes: ctx.args.notes }
        };
        if (Object.keys(attributes).length === 0) {
          throw new CliUsageError("review-detail set needs at least one field (--contact-*/--demo-account-*/--notes).");
        }
        const document = await updateBetaAppReviewDetail(await cli.client(), ctx.args.detailId, attributes);
        emitResult(cli.io, documentEnvelope("testflight review-detail set", {
          ...document,
          data: redactReviewDetailSecrets(document.data)
        }));
      }
    });
    testflightReviewDetailCommand = defineCommand({
      meta: {
        name: "review-detail",
        description: "Beta app review detail (contact + demo account info): get/set"
      },
      subCommands: {
        get: reviewDetailGetCommand2,
        set: reviewDetailSetCommand2
      }
    });
  }
});

// dist/cli/commands/testflight-testers.js
import { readFile as readFile4 } from "node:fs/promises";
var listCommand9, getCommand7, createCommand2, bulkAddCommand, deleteCommand4, removeFromAppCommand, testflightTestersCommand;
var init_testflight_testers = __esm({
  "dist/cli/commands/testflight-testers.js"() {
    "use strict";
    init_dist();
    init_beta_testers();
    init_beta_distribution();
    init_context();
    init_exit_codes();
    init_output();
    init_read_scope();
    init_testflight_shared();
    listCommand9 = defineCommand({
      meta: {
        name: "list",
        description: "List beta testers, filterable by app, group, build, email, or invite type"
      },
      args: {
        app: {
          type: "string",
          valueHint: "appId",
          description: "Restrict to testers of these app id(s) (comma-separated)"
        },
        group: {
          type: "string",
          valueHint: "groupId",
          description: "Restrict to members of these group id(s)"
        },
        build: {
          type: "string",
          valueHint: "buildId",
          description: "Restrict to testers of these build id(s)"
        },
        email: {
          type: "string",
          valueHint: "a@x.com",
          description: "Exact email match (the lookup key for a known tester)"
        },
        "invite-type": {
          type: "string",
          valueHint: "EMAIL",
          description: "Filter by invite type: EMAIL or PUBLIC_LINK"
        },
        sort: {
          type: "string",
          valueHint: "-state",
          description: "Sort key (e.g. email, -email, state, -state; also firstName/lastName/inviteType)"
        },
        ...readScopeArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const options = {
          scope,
          ...pageLimit !== void 0 && { pageLimit },
          ...csvList(ctx.args.app) !== void 0 && {
            apps: csvList(ctx.args.app)
          },
          ...csvList(ctx.args.group) !== void 0 && {
            betaGroups: csvList(ctx.args.group)
          },
          ...csvList(ctx.args.build) !== void 0 && {
            builds: csvList(ctx.args.build)
          },
          ...ctx.args.email !== void 0 && { email: [ctx.args.email] },
          ...ctx.args["invite-type"] !== void 0 && {
            // Enum passes through for ASC to validate.
            inviteType: [ctx.args["invite-type"]]
          },
          ...csvList(ctx.args.sort) !== void 0 && {
            sort: csvList(ctx.args.sort)
          }
        };
        const read = await listBetaTesters(await cli.client(), options);
        emitResult(cli.io, listEnvelope("testflight testers list", read, scope));
      }
    });
    getCommand7 = defineCommand({
      meta: {
        name: "get",
        description: "Read one beta tester, optionally including apps/groups/builds"
      },
      args: {
        testerId: {
          type: "positional",
          required: true,
          description: "The tester's ASC id (from 'list')"
        },
        include: {
          type: "string",
          valueHint: "apps,betaGroups,builds",
          description: "Related resources to include (comma-separated)"
        }
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const options = {
          ...csvList(ctx.args.include) !== void 0 && {
            include: csvList(ctx.args.include)
          }
        };
        const document = await getBetaTester(await cli.client(), ctx.args.testerId, options);
        emitResult(cli.io, documentEnvelope("testflight testers get", document));
      }
    });
    createCommand2 = defineCommand({
      meta: {
        name: "create",
        description: "Create a beta tester. HIGH SIDE EFFECT: linking to a group with a distributable build emails a real TestFlight invitation. Requires --force"
      },
      args: {
        email: {
          type: "string",
          required: true,
          valueHint: "a@x.com",
          description: "The tester's email (fixed at creation; betaTesters have no update)"
        },
        "first-name": {
          type: "string",
          valueHint: "Ada",
          description: "First name (optional; fixed at creation)"
        },
        "last-name": {
          type: "string",
          valueHint: "Lovelace",
          description: "Last name (optional; fixed at creation)"
        },
        group: {
          type: "string",
          valueHint: "id,id",
          description: "Group id(s) to link at creation (this is what emails invitations)"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        requireForce(ctx.args.force, "Creating a tester (it may email a real invitation)");
        const groupIds = csvList(ctx.args.group);
        const document = await createBetaTester(await cli.client(), {
          email: ctx.args.email,
          ...ctx.args["first-name"] !== void 0 && {
            firstName: ctx.args["first-name"]
          },
          ...ctx.args["last-name"] !== void 0 && {
            lastName: ctx.args["last-name"]
          }
        }, { ...groupIds !== void 0 && { betaGroupIds: groupIds } });
        emitResult(cli.io, documentEnvelope("testflight testers create", document, {
          resolved: {
            email: ctx.args.email,
            ...groupIds !== void 0 && { linkedGroups: groupIds }
          }
        }));
      }
    });
    bulkAddCommand = defineCommand({
      meta: {
        name: "bulk-add",
        description: "Find-or-create a tester per email and add them all to a group in one batch. HIGH SIDE EFFECT: emails a real invitation per tester. Requires --force"
      },
      args: {
        group: {
          type: "string",
          required: true,
          valueHint: "groupId",
          description: "The group to add the testers to"
        },
        emails: {
          type: "string",
          valueHint: "a@x,b@y",
          description: "Comma-separated emails (exclusive with --emails-file)"
        },
        "emails-file": {
          type: "string",
          valueHint: "path",
          description: "File with one email per line (exclusive with --emails)"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        requireForce(ctx.args.force, "Bulk-adding testers to a group (it emails real invitations)");
        const inline = csvList(ctx.args.emails);
        const fromFile = ctx.args["emails-file"];
        if (inline !== void 0 && fromFile !== void 0) {
          throw new CliUsageError("Pass exactly one of --emails <list> or --emails-file <path>.");
        }
        let emails;
        if (inline !== void 0) {
          emails = [...inline];
        } else if (fromFile !== void 0) {
          let content;
          try {
            content = await readFile4(fromFile, "utf8");
          } catch {
            throw new CliUsageError(`Cannot read --emails-file at "${fromFile}".`);
          }
          emails = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "");
        } else {
          throw new CliUsageError("Pass exactly one of --emails <list> or --emails-file <path>.");
        }
        if (emails.length === 0) {
          throw new CliUsageError("No emails to add.");
        }
        const result = await bulkAddTestersToGroup(await cli.client(), ctx.args.group, emails);
        emitResult(cli.io, {
          ok: true,
          command: "testflight testers bulk-add",
          data: {
            groupId: ctx.args.group,
            testerIds: result.testerIds,
            createdEmails: result.createdEmails,
            linkageBatches: result.linkageBatches,
            count: result.testerIds.length
          }
        });
      }
    });
    deleteCommand4 = defineCommand({
      meta: {
        name: "delete",
        description: "Delete a tester at the account level (destructive: --force; the removal is asynchronous, so the result is 'accepted', not 'gone')"
      },
      args: {
        testerId: {
          type: "positional",
          required: true,
          description: "The tester's ASC id"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        requireForce(ctx.args.force, "Deleting a tester");
        await deleteBetaTester(await cli.client(), ctx.args.testerId);
        emitResult(cli.io, {
          ok: true,
          command: "testflight testers delete",
          // 202/204 async (live-verify #4): "accepted", not asserting immediate gone.
          data: { id: ctx.args.testerId, deleteAccepted: true }
        });
      }
    });
    removeFromAppCommand = defineCommand({
      meta: {
        name: "remove-from-app",
        description: "Revoke a tester's access to specific apps (destructive: --force; asynchronous)"
      },
      args: {
        testerId: {
          type: "positional",
          required: true,
          description: "The tester's ASC id"
        },
        app: {
          type: "string",
          required: true,
          valueHint: "id,id",
          description: "App id(s) to revoke access from"
        },
        ...forceArg
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        requireForce(ctx.args.force, "Removing a tester from apps");
        const appIds = requireIdList(ctx.args.app, "--app");
        await removeTesterFromApp(await cli.client(), ctx.args.testerId, appIds);
        emitResult(cli.io, {
          ok: true,
          command: "testflight testers remove-from-app",
          data: {
            testerId: ctx.args.testerId,
            apps: appIds,
            removeAccepted: true
          }
        });
      }
    });
    testflightTestersCommand = defineCommand({
      meta: {
        name: "testers",
        description: "Beta testers: list/get/create/bulk-add/delete/remove-from-app"
      },
      subCommands: {
        list: listCommand9,
        get: getCommand7,
        create: createCommand2,
        "bulk-add": bulkAddCommand,
        delete: deleteCommand4,
        "remove-from-app": removeFromAppCommand
      }
    });
  }
});

// dist/cli/commands/testflight.js
var testflightCommand;
var init_testflight = __esm({
  "dist/cli/commands/testflight.js"() {
    "use strict";
    init_dist();
    init_testflight_feedback2();
    init_testflight_groups();
    init_testflight_review();
    init_testflight_testers();
    testflightCommand = defineCommand({
      meta: {
        name: "testflight",
        description: "TestFlight: beta groups, testers, test info, beta review detail, and feedback"
      },
      subCommands: {
        groups: testflightGroupsCommand,
        testers: testflightTestersCommand,
        "test-info": testflightTestInfoCommand,
        "review-detail": testflightReviewDetailCommand,
        feedback: testflightFeedbackCommand
      }
    });
  }
});

// dist/cli/commands/versions.js
var listCommand10, versionsCommand;
var init_versions = __esm({
  "dist/cli/commands/versions.js"() {
    "use strict";
    init_dist();
    init_app_store_versions();
    init_context();
    init_output();
    init_read_scope();
    listCommand10 = defineCommand({
      meta: {
        name: "list",
        description: "List an app's App Store versions (find the editable one via --state PREPARE_FOR_SUBMISSION)"
      },
      args: {
        app: {
          type: "string",
          required: true,
          valueHint: "appId",
          description: "The app's ASC id (from 'asc apps list')"
        },
        platform: {
          type: "string",
          valueHint: "IOS",
          description: "Filter by platform: IOS, MAC_OS, TV_OS, VISION_OS"
        },
        state: {
          type: "string",
          valueHint: "PREPARE_FOR_SUBMISSION",
          description: "Filter by current version state (comma-separated)"
        },
        fields: {
          type: "string",
          valueHint: "versionString,appVersionState",
          description: "Sparse field selection for versions (comma-separated)"
        },
        ...readScopeArgs
      },
      async run(ctx) {
        const cli = cliContextOf(ctx.data);
        const scope = resolveReadScope(ctx.args);
        const pageLimit = resolvePageLimit(ctx.args);
        const platform = csvList(ctx.args.platform);
        const appVersionState = csvList(ctx.args.state);
        const fields = csvList(ctx.args.fields);
        const read = await listAppStoreVersions(await cli.client(), ctx.args.app, {
          scope,
          ...pageLimit !== void 0 && { pageLimit },
          ...platform !== void 0 && { platform },
          ...appVersionState !== void 0 && { appVersionState },
          ...fields !== void 0 && { fields }
        });
        emitResult(cli.io, listEnvelope("versions list", read, scope));
      }
    });
    versionsCommand = defineCommand({
      meta: {
        name: "versions",
        description: "List an app's App Store versions"
      },
      subCommands: {
        list: listCommand10
      }
    });
  }
});

// dist/cli/root.js
var CLI_VERSION, rootCommand;
var init_root = __esm({
  "dist/cli/root.js"() {
    "use strict";
    init_dist();
    init_apps2();
    init_auth();
    init_builds2();
    init_capabilities();
    init_doctor();
    init_media();
    init_metadata();
    init_reports();
    init_reviews();
    init_submission();
    init_testflight();
    init_versions();
    CLI_VERSION = "0.2.0";
    rootCommand = defineCommand({
      meta: {
        name: "asc",
        version: CLI_VERSION,
        description: "App Store Connect operations for agents: apps, versions, store metadata, customer reviews"
      },
      subCommands: {
        apps: appsCommand,
        versions: versionsCommand,
        metadata: metadataCommand,
        reviews: reviewsCommand,
        doctor: doctorCommand,
        auth: authCommand,
        capabilities: capabilitiesCommand,
        reports: reportsCommand,
        media: mediaCommand,
        testflight: testflightCommand,
        builds: buildsCommand,
        submission: submissionCommand
      }
    });
  }
});

// dist/cli/main.js
var main_exports = {};
__export(main_exports, {
  runCli: () => runCli
});
function resolveChain(root, rawArgs, options) {
  let command = root;
  let parent;
  let rest = [...rawArgs];
  for (; ; ) {
    const subCommands = command.subCommands;
    if (subCommands === void 0) {
      return { command, parent, rest };
    }
    const index = rest.findIndex((token) => !token.startsWith("-"));
    const name = index === -1 ? void 0 : rest[index];
    if (name === void 0) {
      return { command, parent, rest };
    }
    const next = subCommands[name];
    if (next === void 0) {
      if (options.lenient) {
        return { command, parent, rest };
      }
      throw new CliUsageError(`Unknown command '${name}' under '${commandName(command)}'. Run 'asc ${parent === void 0 ? "" : `${commandName(command)} `}--help' for the available commands.`);
    }
    parent = command;
    command = next;
    rest = rest.slice(index + 1);
  }
}
function commandName(command) {
  const meta = command.meta;
  return meta?.name ?? "asc";
}
async function runCli(rawArgs, io, env = process.env) {
  try {
    if (rawArgs.some((token) => HELP_FLAGS.has(token))) {
      const tokens = rawArgs.filter((token) => !token.startsWith("-"));
      const { command: command2, parent } = resolveChain(rootCommand, tokens, {
        lenient: true
      });
      io.out(await renderUsage(command2, parent));
      return EXIT.success;
    }
    if (rawArgs[0] === "--version") {
      io.out(CLI_VERSION);
      return EXIT.success;
    }
    const { command, rest } = resolveChain(rootCommand, rawArgs, {
      lenient: false
    });
    const context = createCliContext(io, env);
    const { result } = await runCommand(command, {
      rawArgs: [...rest],
      data: context
    });
    return typeof result === "number" ? result : EXIT.success;
  } catch (error) {
    return renderFailure(io, error);
  }
}
function renderFailure(io, error) {
  if (error instanceof CliUsageError || isCittyUsageError(error)) {
    io.err(`error[usage]: ${error.message}`);
    io.err("hint: every command answers --help with its flags and arguments.");
    return EXIT.usage;
  }
  if (error instanceof NotImplementedError) {
    io.err(`error[not-implemented]: ${error.message}`);
    io.err("hint: run 'asc capabilities' for the authoritative map of what works today.");
    return EXIT.notImplemented;
  }
  if (error instanceof UnsupportedByApiError) {
    io.err(`error[unsupported-by-api]: ${error.message}`);
    io.err(`hint: ${error.guidance}`);
    return EXIT.unsupportedByApi;
  }
  if (error instanceof AscError) {
    renderAscError(io, error);
    return mapAscErrorToExit(error.category);
  }
  io.err(`error[unexpected]: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  return EXIT.unexpected;
}
var HELP_FLAGS;
var init_main = __esm({
  "dist/cli/main.js"() {
    "use strict";
    init_dist();
    init_errors();
    init_context();
    init_exit_codes();
    init_output();
    init_root();
    HELP_FLAGS = /* @__PURE__ */ new Set(["--help", "-h"]);
  }
});

// dist/cli/index.js
var MIN_NODE = [22, 12, 0];
function nodeVersionSatisfied() {
  const parts = process.versions.node.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < MIN_NODE.length; index += 1) {
    const current = parts[index] ?? 0;
    const required = MIN_NODE[index] ?? 0;
    if (current !== required) {
      return current > required;
    }
  }
  return true;
}
if (!nodeVersionSatisfied()) {
  console.error(`error[preflight]: Node ${MIN_NODE.join(".")} or newer is required; found ${process.versions.node}.`);
  console.error("hint: install Node 24 LTS (or any release >= 22.12) and re-run.");
  process.exitCode = 2;
} else {
  try {
    const { runCli: runCli2 } = await Promise.resolve().then(() => (init_main(), main_exports));
    process.exitCode = await runCli2(process.argv.slice(2), {
      out: (text) => {
        console.log(text);
      },
      err: (text) => {
        console.error(text);
      }
    });
  } catch (error) {
    const code = error.code;
    if (code === "ERR_MODULE_NOT_FOUND") {
      console.error("error[preflight]: a required module could not be loaded; the install is missing or incomplete.");
      console.error("hint: run `npm ci` and `npm run build` in the repository root, then retry.");
      process.exitCode = 2;
    } else {
      console.error(`error[unexpected]: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
}
