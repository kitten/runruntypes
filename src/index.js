import { parse } from '@babel/parser';

const genTypeOfInvariant = type => x => typeof x === type;
const genEqualityInvariant = expected => x => x === expected;

const typeOfString = genTypeOfInvariant('string');
const typeOfNumber = genTypeOfInvariant('number');
const typeOfBoolean = genTypeOfInvariant('boolean');
const typeOfObject = genTypeOfInvariant('object');
const typeOfFunction = genTypeOfInvariant('function');

const isNull = genEqualityInvariant(null);
const isVoid = genEqualityInvariant(undefined);
const isNullable = val => isNull(val) || isVoid(val);
const isAny = () => true;
const isArray = Array.isArray;

const genNodeInvariant = (invariantRefs, node) => {
  switch (node.type) {
    case 'BooleanLiteralTypeAnnotation':
    case 'StringLiteralTypeAnnotation':
    case 'NumberLiteralTypeAnnotation':
      return genEqualityInvariant(node.value);

    case 'StringTypeAnnotation':
      return typeOfString;
    case 'NumberTypeAnnotation':
      return typeOfNumber;
    case 'BooleanTypeAnnotation':
      return typeOfBoolean;

    case 'NullLiteralTypeAnnotation':
      return isNull;
    case 'VoidTypeAnnotation':
      return isVoid;
    case 'AnyTypeAnnotation':
      return isAny;

    case 'NullableTypeAnnotation': {
      const inner = genNodeInvariant(invariantRefs, node.typeAnnotation);
      return val => isNullable(val) || inner(val);
    }

    case 'ArrayTypeAnnotation': {
      const inner = genNodeInvariant(invariantRefs, node.elementType);
      return val => isArray(val) && val.every(inner);
    }

    case 'IntersectionTypeAnnotation': {
      const inner = node.types.map(genMappedNodeInvariant(invariantRefs));
      return val => inner.every(i => i(val));
    }

    case 'UnionTypeAnnotation': {
      const inner = node.types.map(genMappedNodeInvariant(invariantRefs));
      return val => inner.some(i => i(val));
    }

    case 'TupleTypeAnnotation': {
      const inner = node.types.map(genMappedNodeInvariant(invariantRefs));

      return val =>
        isArray(val) && val.length === inner.length && val.every((x, i) => inner[i](x));
    }

    case 'ObjectTypeAnnotation': {
      const properties = node.properties.filter(n => {
        if (n.optional) {
          throw new TypeError(`ObjectTypeProperty optional fields are unsupported`);
        }

        return n.type === 'ObjectTypeProperty' && !n.method && !n.proto;
      });

      const keys = properties.map(n => n.key.name);
      const inner = properties.map(n => genNodeInvariant(invariantRefs, n.value));

      return val =>
        typeOfObject(val) && keys.every((key, i) => inner[i](val[key]));
    }

    case 'GenericTypeAnnotation': {
      const { name } = node.id;

      if (name === 'Function') {
        return typeOfFunction;
      } else if (name === 'Object') {
        return typeOfObject;
      } else if (name in invariantRefs) {
        return invariantRefs[name];
      }

      return val =>
        typeOfObject(val) && typeOfFunction(val.constructor) && val.constructor.name === name;
    }

    default:
      throw new TypeError(`Unsupported type annotation ${node.type}`);
  }
};

const stringifyNode = node => {
  switch (node.type) {
    case 'BooleanLiteralTypeAnnotation':
    case 'StringLiteralTypeAnnotation':
    case 'NumberLiteralTypeAnnotation':
      return node.value;

    case 'StringTypeAnnotation':
      return 'string';
    case 'NumberTypeAnnotation':
      return 'number';
    case 'BooleanTypeAnnotation':
      return 'bool';
    case 'NullLiteralTypeAnnotation':
      return 'null';
    case 'VoidTypeAnnotation':
      return 'void';
    case 'AnyTypeAnnotation':
      return 'any';

    case 'NullableTypeAnnotation':
      return '?' + stringifyNode(node.typeAnnotation);
    case 'ArrayTypeAnnotation':
      return `Array<${stringifyNode(node.elementType)}>`;
    case 'IntersectionTypeAnnotation':
      return node.types.map(stringifyNode).join(' & ');
    case 'UnionTypeAnnotation':
      return node.types.map(stringifyNode).join(' | ');
    case 'TupleTypeAnnotation':
      return `[${node.types.map(stringifyNode).join(', ')}]`;
    case 'GenericTypeAnnotation':
      return node.id.name;
    case 'ObjectTypeAnnotation':
      const entries = node.properties.map(n => {
        return `"${n.key.name}": ${stringifyNode(n.value)}`;
      }).join(', ');

      return `{ ${entries} }`;
    default:
      return '<unknown>';
  }
};

const genMappedNodeInvariant = invariantRefs => node => genNodeInvariant(invariantRefs, node);

const genFunInvariant = (invariantRefs, paramTypes, returnType) => {
  const paramSize = paramTypes.length;
  const paramInvariants = paramTypes.map(genMappedNodeInvariant(invariantRefs));
  const returnInvariant = genNodeInvariant(invariantRefs, returnType);

  return fn => {
    const arity = fn.length;
    if (paramSize !== arity) {
      throw new TypeError(`sig expected function of arity ${paramSize} but received arity ${arity}`);
    }

    return (...args) => {
      const argsSize = args.length;
      if (paramSize !== argsSize) {
        throw new TypeError(`Expected function to be called with ${paramSize} arguments but received ${argsSize}`);
      }

      for (let i = 0; i < paramSize; i++) {
        if (!paramInvariants[i](args[i])) {
          const type = stringifyNode(paramTypes[i]);
          throw new TypeError(`Invalid ${i + 1}. argument, expected ${type}.`);
        }
      }

      const res = fn(...args);
      if (!returnInvariant(res)) {
        throw new TypeError(`Invalid return value, expected ${stringifyNode(returnType)}.`);
      }

      return res;
    };
  };
};

function template(def, ...typeRefs) {
  const invariantRefs = Object.create(null);
  let input = 'type x = ' + def[0];

  for (let i = 0, l = typeRefs.length; i < l; i++) {
    const refName = '$Ref' + i;
    invariantRefs[refName] = typeRefs[i];
    input += refName + def[i + 1];
  }

  const ast = parse(input, { plugins: ['flow'] });
  const { program: { body } } = ast;
  const node = body[0];
  if (body.length !== 1 || !node || !node.right) {
    return null;
  }

  return [invariantRefs, node.right];
}

export function type(...args) {
  const [invariantRefs, node] = template(...args);
  if (!node) {
    throw new TypeError('Expected valid Flow type definition');
  }

  return genNodeInvariant(invariantRefs, node);
}

export function sig(...args) {
  const [invariantRefs, node] = template(...args);
  if (!node || node.type !== 'FunctionTypeAnnotation') {
    throw new TypeError('Expected valid Flow function definition');
  }

  const { params, returnType } = node;
  const paramTypes = params.map(n => n.typeAnnotation);
  return genFunInvariant(invariantRefs, paramTypes, returnType);
}
