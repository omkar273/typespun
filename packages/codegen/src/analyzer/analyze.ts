import path from 'node:path';
import ts from 'typescript';
import type { FieldKind } from 'typespun/generated';
import { validateTypedValue } from 'typespun/generated';
import type {
  AnalyzeResult,
  Diagnostic,
  FieldIR,
  RootExport,
} from '../contracts.js';
import { readAnnotations, typespunSymbols } from './annotations.js';
import { locationOf, sortDiagnostics } from './diagnostic.js';
import { evaluateDefault } from './default-expression.js';

function isJavaScriptSource(node: ts.Node): boolean {
  return /\.(?:[cm]?js|jsx)$/i.test(node.getSourceFile().fileName);
}

export function analyzeProgram(
  program: ts.Program,
  inputPath: string,
  envPrefix = '',
): AnalyzeResult {
  const checker = program.getTypeChecker();
  const diagnostics: Diagnostic[] = [];
  const fields: FieldIR[] = [];
  const report = (code: string, message: string, node: ts.Node) =>
    diagnostics.push({ code, message, location: locationOf(node) });
  const symbols = typespunSymbols(program);
  const annotationsFor = (node: ts.Node) =>
    readAnnotations(node, report, checker, symbols);
  const source = program.getSourceFile(path.resolve(inputPath));
  if (!source)
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
    report(
      'javascript_schema',
      'JavaScript schema declarations are not supported.',
      source,
    );
    return { inputPath, fields, diagnostics: sortDiagnostics(diagnostics) };
  }
  const moduleSymbol = checker.getSymbolAtLocation(source);
  const moduleExports = moduleSymbol
    ? checker.getExportsOfModule(moduleSymbol)
    : [];
  const exportedSymbols = new Set(
    moduleExports.map((symbol) =>
      symbol.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(symbol)
        : symbol,
    ),
  );
  const roots = source.statements.filter(
    (node): node is ts.InterfaceDeclaration | ts.ClassDeclaration =>
      (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node)) &&
      !!node.name &&
      exportedSymbols.has(checker.getSymbolAtLocation(node.name)!) &&
      annotationsFor(node).root,
  );
  if (roots.length !== 1) {
    report(
      'root_count',
      'The input must export exactly one marked configuration root.',
      source,
    );
    return { inputPath, fields, diagnostics };
  }
  const root = roots[0]!;
  const rootSymbol = checker.getSymbolAtLocation(root.name!);
  const exportNames = moduleExports
    .filter(
      (symbol) =>
        (symbol.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(symbol)
          : symbol) === rootSymbol,
    )
    .map((symbol) => symbol.name)
    .sort();
  const exportName =
    exportNames.find((name) => name === root.name!.text) ??
    exportNames.find((name) => name !== 'default') ??
    'default';
  const rootExport: RootExport =
    exportName === 'default'
      ? { kind: 'default' }
      : { kind: 'named', name: exportName };
  if (root.typeParameters?.length) {
    report(
      'generic_schema',
      'Configuration roots cannot have type parameters.',
      root.name ?? root,
    );
    return { inputPath, fields, diagnostics: sortDiagnostics(diagnostics) };
  }
  const rootType = checker.getTypeAtLocation(root);
  if ((rootType.symbol?.declarations?.length ?? 0) > 1) {
    report(
      'declaration_merging',
      'Configuration roots cannot use declaration merging.',
      root.name ?? root,
    );
    return { inputPath, fields, diagnostics: sortDiagnostics(diagnostics) };
  }
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
  const invalidMembers = new Set<ts.Node>();
  if (ts.isClassDeclaration(root)) {
    for (const heritage of root.heritageClauses ?? [])
      report(
        'class_inheritance',
        'Configuration classes cannot inherit other classes.',
        heritage,
      );
    for (const member of root.members) {
      if (
        !ts.isPropertyDeclaration(member) ||
        ts.isPrivateIdentifier(member.name) ||
        member.modifiers?.some((modifier) =>
          [
            ts.SyntaxKind.StaticKeyword,
            ts.SyntaxKind.PrivateKeyword,
            ts.SyntaxKind.ProtectedKeyword,
          ].includes(modifier.kind),
        )
      ) {
        report(
          'invalid_class_member',
          'Configuration classes allow only public instance data properties.',
          member,
        );
        invalidMembers.add(member);
      }
    }
  }
  function containsIntersection(
    node: ts.TypeNode | ts.ExpressionWithTypeArguments | undefined,
    seen = new Set<ts.Symbol>(),
  ): boolean {
    if (!node) return false;
    if (ts.isIntersectionTypeNode(node)) return true;
    if (ts.isParenthesizedTypeNode(node))
      return containsIntersection(node.type, seen);
    if (
      ts.isTypeReferenceNode(node) ||
      ts.isExpressionWithTypeArguments(node)
    ) {
      let symbol = checker.getSymbolAtLocation(
        ts.isTypeReferenceNode(node) ? node.typeName : node.expression,
      );
      if (symbol?.flags && symbol.flags & ts.SymbolFlags.Alias)
        symbol = checker.getAliasedSymbol(symbol);
      if (!symbol || seen.has(symbol)) return false;
      seen.add(symbol);
      return (
        symbol.declarations?.some(
          (declaration) =>
            ts.isTypeAliasDeclaration(declaration) &&
            containsIntersection(declaration.type, seen),
        ) ?? false
      );
    }
    return false;
  }
  const validatedHeritage = new Set<ts.Declaration>();
  function validateHeritage(type: ts.Type): void {
    const javaScriptDeclaration =
      type.symbol?.declarations?.find(isJavaScriptSource);
    if (javaScriptDeclaration) {
      report(
        'javascript_schema',
        'JavaScript schema declarations are not supported.',
        javaScriptDeclaration,
      );
      return;
    }
    for (const declaration of type.symbol?.declarations ?? []) {
      if (
        !ts.isInterfaceDeclaration(declaration) ||
        validatedHeritage.has(declaration)
      )
        continue;
      validatedHeritage.add(declaration);
      for (const clause of declaration.heritageClauses ?? []) {
        for (const base of clause.types) {
          if (containsIntersection(base)) {
            report(
              'unsupported_type',
              'Intersections are not supported in heritage.',
              base,
            );
          } else {
            validateHeritage(checker.getTypeAtLocation(base));
          }
        }
      }
    }
  }
  validateHeritage(rootType);
  function kindOf(type: ts.Type): FieldKind | undefined {
    if (type.flags & ts.TypeFlags.String) return { type: 'string' };
    if (type.flags & ts.TypeFlags.Number) return { type: 'number' };
    if (type.flags & ts.TypeFlags.Boolean) return { type: 'boolean' };
    if (type.flags & ts.TypeFlags.StringLiteral)
      return { type: 'enum', values: [(type as ts.StringLiteralType).value] };
    if (
      type.isUnion() &&
      type.types.every((item) => item.flags & ts.TypeFlags.StringLiteral)
    ) {
      return {
        type: 'enum',
        values: type.types.map((item) => (item as ts.StringLiteralType).value),
      };
    }
    if (checker.isArrayType(type)) {
      const element = checker.getTypeArguments(type as ts.TypeReference)[0];
      const kind = element && kindOf(element);
      if (kind && ['string', 'number', 'boolean'].includes(kind.type))
        return {
          type: 'array',
          element: kind.type as 'string' | 'number' | 'boolean',
        };
    }
    return undefined;
  }
  const activeTypes = new Set<ts.Type>();
  const activeProperties = new Set<ts.Node>();
  function hasConditionalType(
    node: ts.Node,
    seen = new Set<ts.Symbol>(),
  ): boolean {
    if (ts.isConditionalTypeNode(node)) return true;
    if (ts.isTypeReferenceNode(node)) {
      let symbol = checker.getSymbolAtLocation(node.typeName);
      if (symbol?.flags && symbol.flags & ts.SymbolFlags.Alias)
        symbol = checker.getAliasedSymbol(symbol);
      if (symbol && !seen.has(symbol)) {
        seen.add(symbol);
        if (
          symbol.declarations?.some(
            (declaration) =>
              ts.isTypeAliasDeclaration(declaration) &&
              hasConditionalType(declaration.type, seen),
          )
        )
          return true;
      }
    }
    return (
      ts.forEachChild(
        node,
        (child) => hasConditionalType(child, seen) || undefined,
      ) ?? false
    );
  }
  function canChangeShape(
    node: ts.PropertySignature | ts.PropertyDeclaration,
  ): boolean {
    if (node.type && hasConditionalType(node.type)) return true;
    for (
      let parent: ts.Node | undefined = node.parent;
      parent && !ts.isSourceFile(parent);
      parent = parent.parent
    ) {
      if (ts.isConditionalTypeNode(parent)) return true;
    }
    return false;
  }
  const envNames = new Set<string>();
  const defaultsPaths = new Set<string>();
  function mergeInlineDefaults(lower: unknown, upper: unknown): unknown {
    if (
      !lower ||
      !upper ||
      typeof lower !== 'object' ||
      typeof upper !== 'object' ||
      Array.isArray(lower) ||
      Array.isArray(upper)
    )
      return upper;
    const lowerObject = lower as Record<string, unknown>;
    const upperObject = upper as Record<string, unknown>;
    return Object.fromEntries(
      [
        ...new Set([...Object.keys(lowerObject), ...Object.keys(upperObject)]),
      ].map((key) => [
        key,
        Object.hasOwn(upperObject, key)
          ? mergeInlineDefaults(lowerObject[key], upperObject[key])
          : lowerObject[key],
      ]),
    );
  }
  function isObjectShape(type: ts.Type): boolean {
    return (
      !!(type.flags & ts.TypeFlags.Object) &&
      !checker.isArrayType(type) &&
      !checker.isTupleType(type) &&
      checker.getIndexInfosOfType(type).length === 0 &&
      type.getCallSignatures().length === 0 &&
      type.getConstructSignatures().length === 0 &&
      !(
        type.symbol?.declarations?.some((declaration) =>
          program.isSourceFileDefaultLibrary(declaration.getSourceFile()),
        ) ?? false
      )
    );
  }
  function visit(
    type: ts.Type,
    propertyPath: string[],
    defaultsPath: string[],
    optionalParents: string[][],
    secret: boolean,
    parentDefault?: unknown,
  ): void {
    activeTypes.add(type);
    for (const property of checker.getPropertiesOfType(type)) {
      const node = property.valueDeclaration ?? property.declarations?.[0];
      if (!node || invalidMembers.has(node)) continue;
      if (isJavaScriptSource(node)) {
        report(
          'javascript_schema',
          'JavaScript schema declarations are not supported.',
          node,
        );
        continue;
      }
      const annotations = annotationsFor(node);
      if (annotations.ignore) continue;
      const name = property.getName();
      if (!(ts.isPropertySignature(node) || ts.isPropertyDeclaration(node))) {
        report('unsupported_type', 'Only data properties are supported.', node);
        continue;
      }
      if (
        ts.isPropertyDeclaration(node) &&
        (ts.isPrivateIdentifier(node.name) ||
          !!(
            ts.getCombinedModifierFlags(node) &
            (ts.ModifierFlags.Private |
              ts.ModifierFlags.Protected |
              ts.ModifierFlags.Static)
          ))
      ) {
        report(
          'invalid_class_member',
          'Configuration classes allow only public instance data properties.',
          node,
        );
        continue;
      }
      // Generic types can keep producing fresh identities forever, including
      // inheritance that substitutes a fresh type into a type-parameter field.
      // Bound that undecidable expansion separately from proven type cycles.
      if (activeProperties.has(node) && propertyPath.length >= 128) {
        report(
          'schema_too_deep',
          'Generic type expansion exceeds the supported analysis depth of 128.',
          node,
        );
        continue;
      }
      if (
        !ts.isIdentifier(node.name) ||
        ['__proto__', 'constructor', 'prototype'].includes(name)
      ) {
        report(
          'invalid_property',
          'Properties must use safe identifier names.',
          node,
        );
        continue;
      }
      if (containsIntersection(node.type)) {
        report('unsupported_type', 'Intersections are not supported.', node);
        continue;
      }
      if (
        annotations.key !== undefined &&
        (!annotations.key ||
          annotations.key.includes('.') ||
          ['__proto__', 'constructor', 'prototype'].includes(annotations.key))
      ) {
        report(
          'invalid_annotation',
          'Key must be one nonempty, safe path segment.',
          node,
        );
        continue;
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
        continue;
      }
      if (ts.isPropertyDeclaration(node) && node.initializer) {
        const result = evaluateDefault(node.initializer, checker);
        if (!result.ok) {
          report(
            'invalid_default',
            'Initializers must be supported static values.',
            node,
          );
          continue;
        }
        if (!annotations.hasDefault) {
          annotations.hasDefault = true;
          annotations.defaultValue = result.value;
        }
      }
      if (
        parentDefault &&
        typeof parentDefault === 'object' &&
        Object.hasOwn(parentDefault, name)
      ) {
        annotations.hasDefault = true;
        annotations.defaultValue = mergeInlineDefaults(
          annotations.defaultValue,
          (parentDefault as Record<string, unknown>)[name],
        );
      }
      const currentPath = [...propertyPath, name];
      const currentDefaultsPath = [...defaultsPath, annotations.key ?? name];
      const optional = !!(property.flags & ts.SymbolFlags.Optional);
      let propertyType = checker.getTypeOfSymbolAtLocation(property, node);
      if (
        propertyType.isUnion() &&
        propertyType.types.some((item) => item.flags & ts.TypeFlags.Null)
      ) {
        report('unsupported_type', 'Nullable unions are not supported.', node);
        continue;
      }
      if (optional) propertyType = checker.getNonNullableType(propertyType);
      const javaScriptDeclaration =
        propertyType.symbol?.declarations?.find(isJavaScriptSource);
      if (javaScriptDeclaration) {
        report(
          'javascript_schema',
          'JavaScript schema declarations are not supported.',
          javaScriptDeclaration,
        );
        continue;
      }
      const kind = kindOf(propertyType);
      const defaultsKey = JSON.stringify(currentDefaultsPath);
      if (defaultsPaths.has(defaultsKey)) {
        report(
          'duplicate_defaults_path',
          'Multiple fields resolve to conflicting defaults paths.',
          node,
        );
      }
      defaultsPaths.add(defaultsKey);
      if (!kind && isObjectShape(propertyType)) {
        validateHeritage(propertyType);
        if (annotations.env !== undefined)
          report('object_env', 'Env annotations apply only to leaves.', node);
        const resolvesTypeParameter =
          node.type &&
          !!(
            checker.getTypeFromTypeNode(node.type).flags &
            ts.TypeFlags.TypeParameter
          );
        if (
          activeTypes.has(propertyType) ||
          (activeProperties.has(node) &&
            !resolvesTypeParameter &&
            !canChangeShape(node))
        ) {
          report(
            'recursive_type',
            'Circular configuration shapes are not supported.',
            node,
          );
          continue;
        }
        if (checker.getPropertiesOfType(propertyType).length === 0) {
          report(
            'unsupported_type',
            'Empty object configuration shapes are not supported.',
            node,
          );
          continue;
        }
        if (
          annotations.hasDefault &&
          (!annotations.defaultValue ||
            typeof annotations.defaultValue !== 'object' ||
            Array.isArray(annotations.defaultValue))
        ) {
          report(
            'invalid_default',
            'Object fields require object defaults.',
            node,
          );
          continue;
        }
        if (
          annotations.hasDefault &&
          Object.keys(annotations.defaultValue as object).some(
            (key) =>
              ['__proto__', 'constructor', 'prototype'].includes(key) ||
              !checker.getPropertyOfType(propertyType, key),
          )
        ) {
          report(
            'invalid_default',
            'Object defaults contain unknown or unsafe properties.',
            node,
          );
          continue;
        }
        const alreadyActive = activeProperties.has(node);
        activeProperties.add(node);
        const fieldsBeforeVisit = fields.length;
        const diagnosticsBeforeVisit = diagnostics.length;
        visit(
          propertyType,
          currentPath,
          currentDefaultsPath,
          optional ? [...optionalParents, currentPath] : optionalParents,
          secret || annotations.secret,
          annotations.defaultValue,
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
        continue;
      }
      if (!kind) {
        report('unsupported_type', 'This field type is not supported.', node);
        continue;
      }
      if (
        annotations.hasDefault &&
        validateTypedValue(kind, annotations.defaultValue) !== undefined
      ) {
        report(
          'invalid_default',
          'The inline default does not match its field type.',
          node,
        );
        continue;
      }
      const snake = currentPath
        .map((part) =>
          part
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
            .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
            .toUpperCase(),
        )
        .join('_');
      const prefix = envPrefix.replace(/_+$/, '');
      const envName =
        annotations.env ?? (prefix ? `${prefix}_${snake}` : snake);
      if (envNames.has(envName))
        report(
          'duplicate_env',
          'Multiple fields resolve to the same environment name.',
          node,
        );
      envNames.add(envName);
      fields.push({
        propertyPath: currentPath,
        defaultsPath: currentDefaultsPath,
        envName,
        kind,
        required: !optional,
        secret: secret || annotations.secret,
        hasDefault: annotations.hasDefault,
        ...(annotations.hasDefault
          ? { defaultValue: annotations.defaultValue }
          : {}),
        optionalParents,
        location: locationOf(node),
      });
    }
    activeTypes.delete(type);
  }
  visit(rootType, [], [], [], false);
  if (fields.length === 0 && diagnostics.length === 0) {
    report(
      'unsupported_type',
      'Configuration roots must contain at least one included leaf.',
      root,
    );
  }
  return {
    ...(diagnostics.length === 0 && root.name
      ? { rootName: root.name.text, rootExport }
      : {}),
    inputPath,
    fields,
    diagnostics: sortDiagnostics(diagnostics),
  };
}
