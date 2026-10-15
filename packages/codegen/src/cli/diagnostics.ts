import { isAbsolute, relative } from 'node:path';
import type { GenerateDiagnostic } from '../generate.js';

export interface DiagnosticFormatOptions {
  readonly cwd: string;
  readonly color: boolean;
}

const diagnosticFile = (diagnostic: GenerateDiagnostic): string | undefined => {
  if ('location' in diagnostic) return diagnostic.location.file;
  if ('file' in diagnostic) return diagnostic.file;
  return undefined;
};

const displayFile = (file: string | undefined, cwd: string): string => {
  if (file === undefined) return '<project>';
  if (!isAbsolute(file)) return file;
  const relativeFile = relative(cwd, file);
  return relativeFile === '' ? file : relativeFile;
};

export const formatDiagnostic = (
  diagnostic: GenerateDiagnostic,
  options: DiagnosticFormatOptions,
): string => {
  const analyzed = 'location' in diagnostic ? diagnostic : undefined;
  const location = analyzed?.location;
  const prefix = `${displayFile(diagnosticFile(diagnostic), options.cwd)}:${location?.line ?? 1}:${location?.column ?? 1}`;
  const code = options.color
    ? `\u001b[36m[${diagnostic.code}]\u001b[0m`
    : `[${diagnostic.code}]`;
  const suggestion =
    analyzed?.suggestion === undefined
      ? ''
      : `\n  suggestion: ${analyzed.suggestion}`;
  const affectedPath =
    'path' in diagnostic && diagnostic.path !== ''
      ? `path ${diagnostic.path}: `
      : '';
  return `${prefix} ${code} ${affectedPath}${diagnostic.message}${suggestion}`;
};
