import ts from 'typescript';
import { validateTypedValue, type FieldKind } from 'typespun/schema';
import type {
  AnalyzeResult,
  Diagnostic,
  FieldIR,
  RootExport,
} from '../contracts.js';
import {
  readAnnotations,
  resolveAlias,
  typespunSymbols,
  type AnnotationContext,
  type Annotations,
} from './annotations.js';
import { locationOf, sortDiagnostics } from './diagnostic.js';
import { evaluateDefault } from './default-expression.js';

/** State shared by every step of one `analyzeProgram` run. */
interface Analysis extends AnnotationContext {
  readonly program: ts.Program;
  readonly envPrefix: string;
  readonly diagnostics: Diagnostic[];
  readonly fields: FieldIR[];
  readonly invalidMembers: Set<ts.Node>;
  readonly validatedHeritage: Set<ts.Declaration>;
  readonly activeTypes: Set<ts.Type>;
  readonly activeProperties: Set<ts.Node>;
  readonly envNames: Set<string>;
  readonly defaultsPaths: Set<string>;
}

/** Where a visited type sits in the schema. */
interface Scope {
  readonly propertyPath: string[];
  readonly defaultsPath: string[];
  readonly optionalParents: string[][];
  readonly secret: boolean;
  readonly parentDefault?: unknown;
}

type RootDeclaration = (ts.InterfaceDeclaration | ts.ClassDeclaration) & {
  readonly name: ts.Identifier;
};

type DataProperty = ts.PropertySignature | ts.PropertyDeclaration;

interface PropertyInput {
  readonly node: DataProperty;
  readonly name: string;
  readonly annotations: Annotations;
  readonly scope: Scope;
}

interface FieldInput {
  readonly node: DataProperty;
  readonly annotations: Annotations;
  readonly scope: Scope;
  readonly type: ts.Type;
  readonly path: string[];
  readonly defaultsPath: string[];
  readonly optional: boolean;
}

type ArrayElement = Extract<FieldKind, { type: 'array' }>['element'];

const UNSAFE_NAMES = ['__proto__', 'constructor', 'prototype'];

const ARRAY_ELEMENTS: readonly string[] = [
  'string',
  'number',
  'boolean',
] satisfies ArrayElement[];

const HIDDEN_CLASS_MODIFIERS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.StaticKeyword,
  ts.SyntaxKind.PrivateKeyword,
  ts.SyntaxKind.ProtectedKeyword,
]);

const HIDDEN_MODIFIER_FLAGS =
  ts.ModifierFlags.Private |
  ts.ModifierFlags.Protected |
  ts.ModifierFlags.Static;

const isJavaScriptSource = (node: ts.Node): boolean =>
  /\.(?:[cm]?js|jsx)$/i.test(node.getSourceFile().fileName);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isDefaultsObject = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && !Array.isArray(value);

const isArrayElement = (type: string): type is ArrayElement =>
  ARRAY_ELEMENTS.includes(type);

const hasTypeFlag = (type: ts.Type, flag: ts.TypeFlags): boolean =>
  (type.flags & flag) !== 0;

// `Type.symbol` is typed as present but is undefined for primitive types.
const declarationsOf = (type: ts.Type): ts.Declaration[] =>
  type.getSymbol()?.declarations ?? [];

const referencedSymbol = (node: ts.Node, checker: ts.TypeChecker) => {
  const symbol = checker.getSymbolAtLocation(node);
  return symbol === undefined ? symbol : resolveAlias(symbol, checker);
};

// `isArrayType` is true only for references to `Array` or `ReadonlyArray`.
const isArrayReference = (
  type: ts.Type,
  checker: ts.TypeChecker,
): type is ts.TypeReference => checker.isArrayType(type);

const mergeInlineDefaults = (lower: unknown, upper: unknown): unknown => {
  if (!isDefaultsObject(lower) || !isDefaultsObject(upper)) return upper;
  return Object.fromEntries(
    [...new Set([...Object.keys(lower), ...Object.keys(upper)])].map((key) => [
      key,
      Object.hasOwn(upper, key)
        ? mergeInlineDefaults(lower[key], upper[key])
        : lower[key],
    ]),
  );
};

const containsIntersection = (
  node: ts.TypeNode | ts.ExpressionWithTypeArguments | undefined,
  checker: ts.TypeChecker,
  seen = new Set<ts.Symbol>(),
): boolean => {
  if (node === undefined) return false;
  if (ts.isIntersectionTypeNode(node)) return true;
  if (ts.isParenthesizedTypeNode(node))
    return containsIntersection(node.type, checker, seen);
  if (!ts.isTypeReferenceNode(node) && !ts.isExpressionWithTypeArguments(node))
    return false;

  const symbol = referencedSymbol(
    ts.isTypeReferenceNode(node) ? node.typeName : node.expression,
    checker,
  );
  if (symbol === undefined || seen.has(symbol)) return false;
  seen.add(symbol);
  return (
    symbol.declarations?.some(
      (declaration) =>
        ts.isTypeAliasDeclaration(declaration) &&
        containsIntersection(declaration.type, checker, seen),
    ) ?? false
  );
};

const hasConditionalType = (
  node: ts.Node,
  checker: ts.TypeChecker,
  seen = new Set<ts.Symbol>(),
): boolean => {
  if (ts.isConditionalTypeNode(node)) return true;

  if (ts.isTypeReferenceNode(node)) {
    const symbol = referencedSymbol(node.typeName, checker);

    if (symbol !== undefined && !seen.has(symbol)) {
      seen.add(symbol);
      const aliasesConditional = symbol.declarations?.some(
        (declaration) =>
          ts.isTypeAliasDeclaration(declaration) &&
          hasConditionalType(declaration.type, checker, seen),
      );
      if (aliasesConditional === true) return true;
    }
  }

  return (
    ts.forEachChild(
      node,
      (child) => hasConditionalType(child, checker, seen) || undefined,
    ) ?? false
  );
};

const canChangeShape = (
  node: DataProperty,
  checker: ts.TypeChecker,
): boolean => {
  if (node.type !== undefined && hasConditionalType(node.type, checker))
    return true;

  for (
    let parent: ts.Node = node.parent;
    !ts.isSourceFile(parent);
    parent = parent.parent
  ) {
    if (ts.isConditionalTypeNode(parent)) return true;
  }

  return false;
};

const arrayKindOf = (
  type: ts.TypeReference,
  checker: ts.TypeChecker,
): FieldKind | undefined => {
  const [element] = checker.getTypeArguments(type);
  const kind = element === undefined ? element : kindOf(element, checker);

  if (kind === undefined || !isArrayElement(kind.type)) return undefined;
  return { type: 'array', element: kind.type };
};

const kindOf = (
  type: ts.Type,
  checker: ts.TypeChecker,
): FieldKind | undefined => {
  if (hasTypeFlag(type, ts.TypeFlags.String)) return { type: 'string' };
  if (hasTypeFlag(type, ts.TypeFlags.Number)) return { type: 'number' };
  if (hasTypeFlag(type, ts.TypeFlags.Boolean)) return { type: 'boolean' };
  if (type.isStringLiteral()) return { type: 'enum', values: [type.value] };

  if (type.isUnion()) {
    const values = type.types.flatMap((item) =>
      item.isStringLiteral() ? [item.value] : [],
    );
    if (values.length === type.types.length) return { type: 'enum', values };
  }

  return isArrayReference(type, checker)
    ? arrayKindOf(type, checker)
    : undefined;
};

const isObjectShape = (
  type: ts.Type,
  { program, checker }: Analysis,
): boolean =>
  hasTypeFlag(type, ts.TypeFlags.Object) &&
  !checker.isArrayType(type) &&
  !checker.isTupleType(type) &&
  checker.getIndexInfosOfType(type).length === 0 &&
  type.getCallSignatures().length === 0 &&
  type.getConstructSignatures().length === 0 &&
  !declarationsOf(type).some((declaration) =>
    program.isSourceFileDefaultLibrary(declaration.getSourceFile()),
  );

const validateHeritage = (type: ts.Type, analysis: Analysis): void => {
  const declarations = declarationsOf(type);
  const javaScriptDeclaration = declarations.find(isJavaScriptSource);

  if (javaScriptDeclaration !== undefined) {
    analysis.report(
      'javascript_schema',
      'JavaScript schema declarations are not supported.',
      javaScriptDeclaration,
    );
    return;
  }

  for (const declaration of declarations) {
    if (!ts.isInterfaceDeclaration(declaration)) continue;
    if (analysis.validatedHeritage.has(declaration)) continue;
    analysis.validatedHeritage.add(declaration);

    for (const clause of declaration.heritageClauses ?? []) {
      for (const base of clause.types) validateHeritageBase(base, analysis);
    }
  }
};

const validateHeritageBase = (
  base: ts.ExpressionWithTypeArguments,
  analysis: Analysis,
): void => {
  if (containsIntersection(base, analysis.checker)) {
    analysis.report(
      'unsupported_type',
      'Intersections are not supported in heritage.',
      base,
    );
  } else {
    validateHeritage(analysis.checker.getTypeAtLocation(base), analysis);
  }
};

const isPublicDataMember = (member: ts.ClassElement): boolean => {
  if (!ts.isPropertyDeclaration(member)) return false;
  if (ts.isPrivateIdentifier(member.name)) return false;
  return !(
    member.modifiers?.some((modifier) =>
      HIDDEN_CLASS_MODIFIERS.has(modifier.kind),
    ) ?? false
  );
};

const isHiddenClassProperty = (node: DataProperty): boolean => {
  if (!ts.isPropertyDeclaration(node)) return false;
  return (
    ts.isPrivateIdentifier(node.name) ||
    (ts.getCombinedModifierFlags(node) & HIDDEN_MODIFIER_FLAGS) !== 0
  );
};

const isUnsafeKey = (key: string | undefined): boolean => {
  if (key === undefined) return false;
  return key === '' || key.includes('.') || UNSAFE_NAMES.includes(key);
};

const toEnvSegment = (part: string): string =>
  part
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toUpperCase();

const defaultEnvName = (path: string[], envPrefix: string): string => {
  const snake = path.map(toEnvSegment).join('_');
  const prefix = envPrefix.replace(/_+$/, '');
  return prefix === '' ? snake : `${prefix}_${snake}`;
};

const findRoots = (
  source: ts.SourceFile,
  moduleExports: ts.Symbol[],
  analysis: Analysis,
): RootDeclaration[] => {
  const { checker } = analysis;
  const exportedSymbols = new Set<ts.Symbol | undefined>(
    moduleExports.map((symbol) => resolveAlias(symbol, checker)),
  );

  const isMarkedRoot = (node: ts.Statement): node is RootDeclaration => {
    const isDeclaration =
      ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node);
    if (!isDeclaration || node.name === undefined) return false;
    if (!exportedSymbols.has(checker.getSymbolAtLocation(node.name)))
      return false;
    return readAnnotations(node, analysis).root;
  };

  return source.statements.filter(isMarkedRoot);
};

const rootExportOf = (
  root: RootDeclaration,
  moduleExports: ts.Symbol[],
  checker: ts.TypeChecker,
): RootExport => {
  const rootSymbol = checker.getSymbolAtLocation(root.name);
  const exportNames = moduleExports
    .filter((symbol) => resolveAlias(symbol, checker) === rootSymbol)
    .map((symbol) => symbol.name);
  exportNames.sort();
  const exportName =
    exportNames.find((name) => name === root.name.text) ??
    exportNames.find((name) => name !== 'default') ??
    'default';
  return exportName === 'default'
    ? { kind: 'default' }
    : { kind: 'named', name: exportName };
};

/** Reports a root that cannot be analyzed further; returns true if it did. */
const rejectRoot = (
  root: RootDeclaration,
  rootType: ts.Type,
  analysis: Analysis,
): boolean => {
  if ((root.typeParameters?.length ?? 0) > 0) {
    analysis.report(
      'generic_schema',
      'Configuration roots cannot have type parameters.',
      root.name,
    );
    return true;
  }

  if (declarationsOf(rootType).length > 1) {
    analysis.report(
      'declaration_merging',
      'Configuration roots cannot use declaration merging.',
      root.name,
    );
    return true;
  }

  return false;
};

const reportRootMembers = (
  root: RootDeclaration,
  rootType: ts.Type,
  analysis: Analysis,
): void => {
  const { checker, report } = analysis;

  for (const index of checker.getIndexInfosOfType(rootType)) {
    report(
      'unsupported_type',
      'Index signatures are not supported.',
      index.declaration ?? root,
    );
  }

  for (const signature of [
    ...rootType.getCallSignatures(),
    ...rootType.getConstructSignatures(),
  ]) {
    report(
      'unsupported_type',
      'Call and construct signatures are not supported.',
      signature.declaration ?? root,
    );
  }

  if (!ts.isClassDeclaration(root)) return;

  for (const heritage of root.heritageClauses ?? [])
    report(
      'class_inheritance',
      'Configuration classes cannot inherit other classes.',
      heritage,
    );

  for (const member of root.members) {
    if (isPublicDataMember(member)) continue;
    report(
      'invalid_class_member',
      'Configuration classes allow only public instance data properties.',
      member,
    );
    analysis.invalidMembers.add(member);
  }
};

/** Reports a property that cannot become a field; returns true if it did. */
const rejectProperty = (
  { node, name, annotations, scope }: PropertyInput,
  analysis: Analysis,
): boolean => {
  const { report } = analysis;

  if (isHiddenClassProperty(node)) {
    report(
      'invalid_class_member',
      'Configuration classes allow only public instance data properties.',
      node,
    );
    return true;
  }

  // Generic types can keep producing fresh identities forever, including
  // inheritance that substitutes a fresh type into a type-parameter field.
  // Bound that undecidable expansion separately from proven type cycles.
  if (analysis.activeProperties.has(node) && scope.propertyPath.length >= 128) {
    report(
      'schema_too_deep',
      'Generic type expansion exceeds the supported analysis depth of 128.',
      node,
    );
    return true;
  }

  if (!ts.isIdentifier(node.name) || UNSAFE_NAMES.includes(name)) {
    report(
      'invalid_property',
      'Properties must use safe identifier names.',
      node,
    );
    return true;
  }

  if (containsIntersection(node.type, analysis.checker)) {
    report('unsupported_type', 'Intersections are not supported.', node);
    return true;
  }

  if (isUnsafeKey(annotations.key)) {
    report(
      'invalid_annotation',
      'Key must be one nonempty, safe path segment.',
      node,
    );
    return true;
  }

  if (
    annotations.env !== undefined &&
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(annotations.env)
  ) {
    report(
      'invalid_annotation',
      'Env must be a valid complete environment name.',
      node,
    );
    return true;
  }

  return false;
};

/** Applies initializer and parent defaults; undefined when they are invalid. */
const withDefaults = (
  { node, name, annotations, scope }: PropertyInput,
  analysis: Analysis,
): Annotations | undefined => {
  let result = annotations;

  if (ts.isPropertyDeclaration(node) && node.initializer !== undefined) {
    const value = evaluateDefault(node.initializer, analysis.checker);

    if (!value.ok) {
      analysis.report(
        'invalid_default',
        'Initializers must be supported static values.',
        node,
      );
      return undefined;
    }

    if (!result.hasDefault)
      result = { ...result, hasDefault: true, defaultValue: value.value };
  }

  const { parentDefault } = scope;

  if (isRecord(parentDefault) && Object.hasOwn(parentDefault, name)) {
    result = {
      ...result,
      hasDefault: true,
      defaultValue: mergeInlineDefaults(
        result.defaultValue,
        parentDefault[name],
      ),
    };
  }

  return result;
};

/** Reports an object default that cannot fill the shape; returns true if it did. */
const rejectObjectDefault = (
  { node, annotations, type }: FieldInput,
  { checker, report }: Analysis,
): boolean => {
  if (!annotations.hasDefault) return false;
  const { defaultValue } = annotations;

  if (!isDefaultsObject(defaultValue)) {
    report('invalid_default', 'Object fields require object defaults.', node);
    return true;
  }

  const hasForeignKey = Object.keys(defaultValue).some(
    (key) =>
      UNSAFE_NAMES.includes(key) ||
      checker.getPropertyOfType(type, key) === undefined,
  );
  if (!hasForeignKey) return false;
  report(
    'invalid_default',
    'Object defaults contain unknown or unsafe properties.',
    node,
  );
  return true;
};

const visitObjectField = (field: FieldInput, analysis: Analysis): void => {
  const { node, annotations, scope, type } = field;
  const { checker, report, activeProperties, fields, diagnostics } = analysis;
  validateHeritage(type, analysis);
  if (annotations.env !== undefined)
    report('object_env', 'Env annotations apply only to leaves.', node);
  const resolvesTypeParameter =
    node.type !== undefined &&
    hasTypeFlag(
      checker.getTypeFromTypeNode(node.type),
      ts.TypeFlags.TypeParameter,
    );
  const repeatsProperty = activeProperties.has(node) && !resolvesTypeParameter;
  const isRecursive =
    analysis.activeTypes.has(type) ||
    (repeatsProperty && !canChangeShape(node, checker));

  if (isRecursive) {
    report(
      'recursive_type',
      'Circular configuration shapes are not supported.',
      node,
    );
    return;
  }

  if (checker.getPropertiesOfType(type).length === 0) {
    report(
      'unsupported_type',
      'Empty object configuration shapes are not supported.',
      node,
    );
    return;
  }

  if (rejectObjectDefault(field, analysis)) return;

  const alreadyActive = activeProperties.has(node);
  activeProperties.add(node);
  const fieldsBeforeVisit = fields.length;
  const diagnosticsBeforeVisit = diagnostics.length;
  visitType(
    type,
    {
      propertyPath: field.path,
      defaultsPath: field.defaultsPath,
      optionalParents: field.optional
        ? [...scope.optionalParents, field.path]
        : scope.optionalParents,
      secret: scope.secret || annotations.secret,
      parentDefault: annotations.defaultValue,
    },
    analysis,
  );
  if (!alreadyActive) activeProperties.delete(node);

  if (
    fields.length === fieldsBeforeVisit &&
    diagnostics.length === diagnosticsBeforeVisit
  ) {
    report(
      'unsupported_type',
      'Configuration object shapes must contain at least one included leaf.',
      node,
    );
  }
};

const addLeafField = (
  field: FieldInput,
  kind: FieldKind,
  analysis: Analysis,
): void => {
  const { node, annotations, scope } = field;

  if (
    annotations.hasDefault &&
    validateTypedValue(kind, annotations.defaultValue) !== undefined
  ) {
    analysis.report(
      'invalid_default',
      'The inline default does not match its field type.',
      node,
    );
    return;
  }

  const envName =
    annotations.env ?? defaultEnvName(field.path, analysis.envPrefix);
  if (analysis.envNames.has(envName))
    analysis.report(
      'duplicate_env',
      'Multiple fields resolve to the same environment name.',
      node,
    );
  analysis.envNames.add(envName);
  analysis.fields.push({
    propertyPath: field.path,
    defaultsPath: field.defaultsPath,
    envName,
    kind,
    required: !field.optional,
    secret: scope.secret || annotations.secret,
    hasDefault: annotations.hasDefault,
    ...(annotations.hasDefault
      ? { defaultValue: annotations.defaultValue }
      : {}),
    optionalParents: scope.optionalParents,
    location: locationOf(node),
  });
};

const visitDataProperty = (
  property: ts.Symbol,
  input: PropertyInput,
  analysis: Analysis,
): void => {
  const { checker, report } = analysis;
  const { node, name, scope } = input;
  if (rejectProperty(input, analysis)) return;
  const annotations = withDefaults(input, analysis);
  if (annotations === undefined) return;

  const path = [...scope.propertyPath, name];
  const defaultsPath = [...scope.defaultsPath, annotations.key ?? name];
  const optional = (property.flags & ts.SymbolFlags.Optional) !== 0;
  const declaredType = checker.getTypeOfSymbolAtLocation(property, node);
  const isNullableUnion =
    declaredType.isUnion() &&
    declaredType.types.some((item) => hasTypeFlag(item, ts.TypeFlags.Null));

  if (isNullableUnion) {
    report('unsupported_type', 'Nullable unions are not supported.', node);
    return;
  }

  const type = optional
    ? checker.getNonNullableType(declaredType)
    : declaredType;
  const javaScriptDeclaration = declarationsOf(type).find(isJavaScriptSource);

  if (javaScriptDeclaration !== undefined) {
    report(
      'javascript_schema',
      'JavaScript schema declarations are not supported.',
      javaScriptDeclaration,
    );
    return;
  }

  const kind = kindOf(type, checker);
  const defaultsKey = JSON.stringify(defaultsPath);

  if (analysis.defaultsPaths.has(defaultsKey)) {
    report(
      'duplicate_defaults_path',
      'Multiple fields resolve to conflicting defaults paths.',
      node,
    );
  }

  analysis.defaultsPaths.add(defaultsKey);
  const field = {
    node,
    annotations,
    scope,
    type,
    path,
    defaultsPath,
    optional,
  };

  if (kind === undefined && isObjectShape(type, analysis)) {
    visitObjectField(field, analysis);
    return;
  }

  if (kind === undefined) {
    report('unsupported_type', 'This field type is not supported.', node);
    return;
  }

  addLeafField(field, kind, analysis);
};

const visitProperty = (
  property: ts.Symbol,
  scope: Scope,
  analysis: Analysis,
): void => {
  const node = property.valueDeclaration ?? property.declarations?.[0];
  if (node === undefined) return;
  if (analysis.invalidMembers.has(node)) return;

  if (isJavaScriptSource(node)) {
    analysis.report(
      'javascript_schema',
      'JavaScript schema declarations are not supported.',
      node,
    );
    return;
  }

  const annotations = readAnnotations(node, analysis);
  if (annotations.ignore) return;
  const name = property.getName();

  if (!ts.isPropertySignature(node) && !ts.isPropertyDeclaration(node)) {
    analysis.report(
      'unsupported_type',
      'Only data properties are supported.',
      node,
    );
    return;
  }

  visitDataProperty(property, { node, name, annotations, scope }, analysis);
};

const visitType = (type: ts.Type, scope: Scope, analysis: Analysis): void => {
  analysis.activeTypes.add(type);

  for (const property of analysis.checker.getPropertiesOfType(type))
    visitProperty(property, scope, analysis);

  analysis.activeTypes.delete(type);
};

export const analyzeProgram = (
  program: ts.Program,
  inputPath: string,
  envPrefix = '',
): AnalyzeResult => {
  const checker = program.getTypeChecker();
  const diagnostics: Diagnostic[] = [];
  const fields: FieldIR[] = [];
  const analysis: Analysis = {
    program,
    checker,
    envPrefix,
    diagnostics,
    fields,
    report: (code, message, node) =>
      diagnostics.push({ code, message, location: locationOf(node) }),
    symbols: typespunSymbols(program),
    invalidMembers: new Set(),
    validatedHeritage: new Set(),
    activeTypes: new Set(),
    activeProperties: new Set(),
    envNames: new Set(),
    defaultsPaths: new Set(),
  };
  // `getSourceFile` normalises the name and resolves relative paths against the
  // compiler host's current directory, so no `node:path` resolution is needed.
  const source = program.getSourceFile(inputPath);
  if (source === undefined)
    return {
      inputPath,
      fields,
      diagnostics: [
        {
          code: 'input_not_found',
          message: 'Schema input is not in the TypeScript program.',
          location: { file: inputPath, line: 1, column: 1 },
        },
      ],
    };

  if (isJavaScriptSource(source)) {
    analysis.report(
      'javascript_schema',
      'JavaScript schema declarations are not supported.',
      source,
    );
    return { inputPath, fields, diagnostics: sortDiagnostics(diagnostics) };
  }

  const moduleSymbol = checker.getSymbolAtLocation(source);
  const moduleExports =
    moduleSymbol === undefined ? [] : checker.getExportsOfModule(moduleSymbol);
  const [root, ...otherRoots] = findRoots(source, moduleExports, analysis);

  if (root === undefined || otherRoots.length > 0) {
    analysis.report(
      'root_count',
      'The input must export exactly one marked configuration root.',
      source,
    );
    return { inputPath, fields, diagnostics };
  }

  const rootExport = rootExportOf(root, moduleExports, checker);
  const rootType = checker.getTypeAtLocation(root);

  if (rejectRoot(root, rootType, analysis))
    return { inputPath, fields, diagnostics: sortDiagnostics(diagnostics) };

  reportRootMembers(root, rootType, analysis);
  validateHeritage(rootType, analysis);
  visitType(
    rootType,
    { propertyPath: [], defaultsPath: [], optionalParents: [], secret: false },
    analysis,
  );

  if (fields.length === 0 && diagnostics.length === 0) {
    analysis.report(
      'unsupported_type',
      'Configuration roots must contain at least one included leaf.',
      root,
    );
  }

  return {
    ...(diagnostics.length === 0
      ? { rootName: root.name.text, rootExport }
      : {}),
    inputPath,
    fields,
    diagnostics: sortDiagnostics(diagnostics),
  };
};
