import { isAbsolute, relative } from 'node:path';
import type { GenerateDiagnostic } from '../generate.js';

export interface DiagnosticFormatOptions {
  readonly cwd: string;
  readonly color: boolean;
}

export function formatDiagnostic(
  diagnostic: GenerateDiagnostic,
  options: DiagnosticFormatOptions,
): string {
  const file = diagnosticFile(diagnostic);
  const location = 'location' in diagnostic ? diagnostic.location : undefined;
  const displayedFile =
    file === undefined
      ? '<project>'
      : isAbsolute(file)
        ? relative(options.cwd, file) || file
        : file;
  const prefix = `${displayedFile}:${location?.line ?? 1}:${location?.column ?? 1}`;
  const code = options.color
    ? `\u001b[36m[${diagnostic.code}]\u001b[0m`
    : `[${diagnostic.code}]`;
  const suggestion =
    'suggestion' in diagnostic && diagnostic.suggestion !== undefined
      ? `\n  suggestion: ${diagnostic.suggestion}`
      : '';
  const affectedPath =
    'path' in diagnostic && diagnostic.path ? `path ${diagnostic.path}: ` : '';
  return `${prefix} ${code} ${affectedPath}${diagnostic.message}${suggestion}`;
}

function diagnosticFile(diagnostic: GenerateDiagnostic): string | undefined {
  if ('location' in diagnostic) return diagnostic.location.file;
  if ('file' in diagnostic) return diagnostic.file;
  return undefined;
}
