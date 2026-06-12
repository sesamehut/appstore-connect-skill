import { renderUsage, runCommand } from "citty";
import type { CommandDef } from "citty";

import { AscError } from "../errors.js";
import { createCliContext } from "./context.js";
import type { CliIo } from "./context.js";
import {
  CliUsageError,
  EXIT,
  isCittyUsageError,
  mapAscErrorToExit,
  NotImplementedError,
  UnsupportedByApiError,
} from "./exit-codes.js";
import { renderAscError } from "./output.js";
import { CLI_VERSION, rootCommand } from "./root.js";

// The command tree is built from plain object literals, so subCommands need
// no Resolvable unwrapping here.
type CliCommand = CommandDef;

interface ResolvedChain {
  readonly command: CliCommand;
  readonly parent: CliCommand | undefined;
  /** Arguments left for the resolved command (its flags and positionals). */
  readonly rest: readonly string[];
}

/**
 * Walks the command tree along leading bare tokens, mirroring citty's
 * sub-command matching. Dispatch is done here, not via citty's recursive
 * subCommands handling, because the recursion drops the `data` slot (the CLI
 * context) and the run() result (the doctor exit code) — runCommand is only
 * ever invoked on the resolved leaf.
 */
function resolveChain(
  root: CliCommand,
  rawArgs: readonly string[],
  options: { readonly lenient: boolean },
): ResolvedChain {
  let command = root;
  let parent: CliCommand | undefined;
  let rest = [...rawArgs];

  for (;;) {
    const subCommands = command.subCommands as
      | Record<string, CliCommand>
      | undefined;
    if (subCommands === undefined) {
      return { command, parent, rest };
    }
    const index = rest.findIndex((token) => !token.startsWith("-"));
    const name = index === -1 ? undefined : rest[index];
    if (name === undefined) {
      return { command, parent, rest };
    }
    const next = subCommands[name];
    if (next === undefined) {
      if (options.lenient) {
        return { command, parent, rest };
      }
      throw new CliUsageError(
        `Unknown command '${name}' under '${commandName(command)}'. Run 'asc ${
          parent === undefined ? "" : `${commandName(command)} `
        }--help' for the available commands.`,
      );
    }
    parent = command;
    command = next;
    rest = rest.slice(index + 1);
  }
}

function commandName(command: CliCommand): string {
  const meta = command.meta as { name?: string } | undefined;
  return meta?.name ?? "asc";
}

const HELP_FLAGS = new Set(["--help", "-h"]);

/**
 * The CLI driver and single error funnel: every command handler just throws,
 * and this is the one place errors become exit codes plus actionable stderr
 * diagnostics. stdout stays empty on every failure path.
 */
export async function runCli(
  rawArgs: readonly string[],
  io: CliIo,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<number> {
  try {
    if (rawArgs.some((token) => HELP_FLAGS.has(token))) {
      const tokens = rawArgs.filter((token) => !token.startsWith("-"));
      const { command, parent } = resolveChain(rootCommand, tokens, {
        lenient: true,
      });
      io.out(await renderUsage(command, parent));
      return EXIT.success;
    }
    if (rawArgs[0] === "--version") {
      io.out(CLI_VERSION);
      return EXIT.success;
    }

    const { command, rest } = resolveChain(rootCommand, rawArgs, {
      lenient: false,
    });
    const context = createCliContext(io, env);
    const { result } = await runCommand(command, {
      rawArgs: [...rest],
      data: context,
    });
    return typeof result === "number" ? result : EXIT.success;
  } catch (error) {
    return renderFailure(io, error);
  }
}

function renderFailure(io: CliIo, error: unknown): number {
  if (error instanceof CliUsageError || isCittyUsageError(error)) {
    io.err(`error[usage]: ${error.message}`);
    io.err("hint: every command answers --help with its flags and arguments.");
    return EXIT.usage;
  }
  if (error instanceof NotImplementedError) {
    io.err(`error[not-implemented]: ${error.message}`);
    io.err(
      "hint: run 'asc capabilities' for the authoritative map of what works today.",
    );
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
  io.err(
    `error[unexpected]: ${
      error instanceof Error ? (error.stack ?? error.message) : String(error)
    }`,
  );
  return EXIT.unexpected;
}
