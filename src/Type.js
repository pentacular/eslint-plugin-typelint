const fileInfoCache = require('./fileInfoCache');
const doctrine = require('doctrine');

function strip(string) {
  return string.replace(/\s/g, '');
}


const ignore = (consumed, type) => type;

// A base type accepts nothing.
class Type {
    isOfType(otherType) {
        return otherType.isSupertypeOf(this);
    }

    isSupertypeOf(otherType) {
      return false;
    }

    getPropertyNames() {
      return [];
    }

    getProperty(name) {
      return Type.invalid;
    }

    getReturn() {
      return Type.invalid;
    }

    getArgumentCount() {
      return undefined;
    }

    getArgument(index) {
      return Type.invalid;
    }

    getParameter(name) {
      return Type.invalid;
    }

    hasParameter(name) {
      return false;
    }

    toString() {
      return '<invalid>';
    }

    instanceOf(kind) {
      return this instanceof kind;
    }

    getPrimitive() {
      return undefined;
    }
}

class AnyType extends Type {
    // * can violate any type other than *.
    isOfType(otherType) {
      return otherType === Type.any;
    }

    toString() {
      return '*';
    }

    isSupertypeOf(otherType) {
      return true;
    }

    // It might be an object with properties.
    getProperty(name) {
      return Type.any;
    }

    // It might be a function that returns something.
    getReturn() {
      return Type.any;
    }

    // But we don't know how many arguments it wants.
    getArgumentCount() {
      return undefined;
    }

    // We can't tell what it may expect.
    getArgument(index) {
      return Type.any;
    }
}

// A primitive type accepts only itself.
class PrimitiveType extends Type {
    constructor(primitive) {
      super();
      // Remove spaces to normalize.
      this.primitive = strip(primitive);
    }

    toString() {
      return this.primitive;
    }

    isOfType(otherType) {
      if (otherType.instanceOf(PrimitiveType)) {
        return this.getPrimitive() === otherType.getPrimitive();
      } else {
        // We don't understand this relationship. Invert it.
        return otherType.isSupertypeOf(this);
      }
    }

    isSupertypeOf(otherType) {
      if (otherType.instanceOf(PrimitiveType)) {
        return this.getPrimitive() === otherType.getPrimitive();
      } else {
        // We don't understand this relationship. Invert it.
        return otherType.isOfType(this);
      }
    }

    getPrimitive() {
      return this.primitive;
    }
}

// An alias is a reference to another type, ala typedef.
class AliasType extends Type {
    constructor(name, type) {
      super();
      this.name = name;
      this.type = type;
    }

    toString() {
      return this.name;
    }

    isOfType(otherType) {
      return this.type.isOfType(otherType);
    }

    isSupertypeOf(otherType) {
      return this.type.isSupertypeOf(otherType);
    }

    getPropertyNames() {
      return this.type.getPropertyNames();
    }

    getProperty(name) {
      return this.type.getProperty(name);
    }

    getReturn() {
      return this.type.getReturn();
    }

    getArgumentCount() {
      return this.type.getArgumentCount();
    }

    getArgument(index) {
      return this.type.getArgument(index);
    }

    getParameter(name) {
      return this.type.getParameter(name);
    }

    hasParameter(name) {
      return this.type.hasParameter(name);
    }

    instanceOf(kind) {
      return this.type instanceof kind;
    }
}

PrimitiveType.fromDoctrineType = (type, rec, typedefs) => {
  switch (type.type) {
    case 'NameExpression':
      // TODO: Whitelist?
      const typedef = typedefs[type.name];
      if (typedef) {
        return new AliasType(type.name, typedef);
      } else {
        return new PrimitiveType(type.name);
      }
    case 'UndefinedLiteral':
      return Type.undefined;
    default:
      return new Type();
  }
}

// A union type accepts any type in its set.
class UnionType extends Type {
    constructor(...union) {
      super();
      this.union = union;
    }

    /**
     * @description returns true if this Type describes an allowed value for `otherType`
     * @param {Type} otherType
     * @return {boolean}
     */
    isOfType(otherType) {
        for (const type of this.union) {
          if (!type.isOfType(otherType)) {
            return false;
          }
        }
        return true;
    }

    isSupertypeOf(otherType) {
        for (const type of this.union) {
          if (type.isSupertypeOf(otherType)) {
            return true;
          }
        }
        return false;
    }

    toString() {
        return this.union.map(type => type.toString()).join('|');
    }
}

UnionType.fromDoctrineType = (type, rec, typedefs) =>
  new UnionType(...type.elements.map(element => Type.fromDoctrineType(element, {}, typedefs)));

// A record type accepts any record type whose properties are accepted by all of its properties.
class RecordType extends Type {
    constructor(record) {
      super();
      this.record = record;
    }

    getPropertyNames(name) {
      return Object.keys(this.record);
    }

    getProperty(name) {
      if (this.record.hasOwnProperty(name)) {
        return this.record[name];
      } else {
        return Type.any;
      }
    }

    /**
     * @description returns true if this Type describes an allowed value for `otherType`
     * @param {Type} otherType
     * @return {boolean}
     */
    isOfType(otherType) {
        if (otherType.instanceOf(PrimitiveType)) {
          return false;
        }
        if (!otherType.instanceOf(RecordType)) {
          // We don't understand this relationship, so invert it.
          return otherType.isSupertypeOf(this);
        }
        for (const name of otherType.getPropertyNames()) {
            if (!this.getProperty(name).isOfType(otherType.getProperty(name))) {
                return false;
            }
        }
        return true;
    }

    isSupertypeOf(otherType) {
        if (otherType.instanceOf(PrimitiveType)) {
          return false;
        }
        if (!otherType.instanceOf(RecordType)) {
          // We don't understand this relationship, so invert it.
          return otherType.isOfType(this);
        }
        for (const name of this.getPropertyNames()) {
            if (!this.getProperty(name).isSupertypeOf(otherType.getProperty(name))) {
                return false;
            }
        }
        return true;
    }

    toString() {
        return `{${this.getPropertyNames().map(name => `${name}:${this.getProperty(name)}`).join(', ')}}`;
    }
}

RecordType.fromDoctrineType = (type, rec, typedefs) => {
  if (type.type === 'NameExpression' && type.name === 'object') {
    const record = {};
    for (let i = 0; i < rec.tags.length; i++) {
      const tag = rec.tags[i];
      if (tag.title === 'property') {
        record[tag.name] = Type.fromDoctrineType(tag.type, rec, typedefs);
      }
    }
    return new RecordType(record);
  }
  return Type.invalid;
}

// A function type accepts a function whose return and parameters are accepted.
class FunctionType extends Type {
    constructor(returnType, argumentTypes = [], parameterTypes = {}) {
      super();
      this.returnType = returnType;
      this.argumentTypes = argumentTypes;
      this.parameterTypes = parameterTypes;
    }

    getReturn() {
      return this.returnType;
    }

    getArgumentCount() {
      return this.argumentTypes.length;
    }

    // Arguments are indexed and include undefined for optionals.
    // These are used for calls.
    getArgument(index) {
      return this.argumentTypes[index] || Type.invalid;
    }

    // Parameters are named and include the default value type.
    // These are used to resolve identifier bindings.
    getParameter(name) {
      return this.parameterTypes[name] || Type.any;
    }

    hasParameter(name) {
      return this.parameterTypes.hasOwnProperty(name);
    }

    isSupertypeOf(otherType) {
      if (!this.getReturnType().isSupertypeOf(otherType.returnType())) {
        return false;
      }
      // The type relationship is upon the external argument interface.
      for (const index = 0; index < this.argumentTypes.length; index++) {
        if (!this.getArgument(index).isSupertypeOf(otherType.getArgument(index))) {
          return false;
        }
      }
    }

    toString() {
      return `function(${this.argumentTypes.join(',')}):${this.getReturn()}`;
    }
}

FunctionType.fromDoctrineType = (type, rec, typedefs) => {
  const returnType = type.result ? Type.fromDoctrineType(type.result, rec, typedefs) : Type.any;
  const paramTypes = type.params.map(param => Type.fromDoctrineType(param, rec, typedefs));
  return new FunctionType(returnType, paramTypes);
}

FunctionType.fromDoctrine = (rec, typedefs) => {
  let returnType = Type.any;
  const argumentTypes = [];
  const parameterTypes = {};
  // FIX: Handle undeclared arguments?
  for (let i = 0; i < rec.tags.length; i++) {
    const tag = rec.tags[i];
    if (tag.title === 'return' || tag.title === 'returns') {
      returnType = Type.fromDoctrineType(tag.type, rec, typedefs);
    } else if (tag.title === 'param') {
      const argumentType = Type.fromDoctrineType(tag.type, rec, typedefs);
      argumentTypes.push(argumentType);
      parameterTypes[tag.name] = argumentType;
    }
  }
  const type = new FunctionType(returnType, argumentTypes, parameterTypes);
  return type;
}

Type.any = new AnyType();
Type.undefined = new PrimitiveType('undefined');
Type.invalid = new Type();
Type.string = new PrimitiveType('string');
Type.number = new PrimitiveType('number');
Type.boolean = new PrimitiveType('boolean');
Type.object = new RecordType({});
Type.null = new PrimitiveType('null');
Type.RegExp = new PrimitiveType('RegExp');

Type.fromDoctrine = (rec, typedefs) => {
  for (let i = 0; i < rec.tags.length; i++) {
    const tag = rec.tags[i];
    switch (tag.title) {
      case 'typedef': {
        const type = RecordType.fromDoctrineType(tag.type, rec, typedefs)
        typedefs[tag.name] = type;
        return Type.any;
      }
      case 'type':
        return Type.fromDoctrineType(tag.type, rec, typedefs);
      case 'return':
      case 'returns':
      case 'param':
        return FunctionType.fromDoctrine(rec, typedefs);
    }
  }
  return Type.any;
};

Type.fromDoctrineType = (type, rec, typedefs) => {
   switch (type.type) {
     case 'FunctionType':
       return FunctionType.fromDoctrineType(type, rec, typedefs)
     case 'RecordType':
       return RecordType.fromDoctrineType(type, rec, typedefs)
     case 'UnionType':
       return UnionType.fromDoctrineType(type, rec, typedefs)
     case 'NameExpression':
       if (type.name === 'object') {
         return RecordType.fromDoctrineType(type, rec, typedefs);
       } else {
         return PrimitiveType.fromDoctrineType(type, rec, typedefs)
       }
     case 'UndefinedLiteral':
       return PrimitiveType.fromDoctrineType(type, rec, typedefs)
     default:
       throw Error(`Die: Unknown type ${JSON.stringify(type)}`);
  }
}

Type.fromString = (string, typedefs) =>
  Type.fromDoctrineType(doctrine.parseType(string), {}, typedefs);

module.exports.Type = Type;
module.exports.PrimitiveType = PrimitiveType;
module.exports.UnionType = UnionType;
module.exports.RecordType = RecordType;
module.exports.FunctionType = FunctionType;
