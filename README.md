# <sup>RunRun</sup>Types

`RunRunTypes` is a simple runtime-only type checker. It's a fairly specific and simple library
and it might be for you if:

- You're trying to write a build-step-less app and need type checking in development
- Your types are not simple and you prefer Flow-like definitions for them
- You don't care about Flow's comment-only syntax much

Well, if you belong to this small exclusive club, then **Welcome!**

> **Disclaimer:** This is frankly a horrible idea that's not meant for real world stuff, but
> it's been quite fun to write.

## Getting Started

You can install `RunRunTypes` like any other npm package:

```sh
yarn add --dev runruntypes
# or
npm install --save-dev runruntypes
```

> **NOTE:** It's recommended to not ship this package in production as it pulls
> in `@babel/parser` as a dependency, which is really not that small. It's fairly
> simple to stub out this library's API though.

## Usage

`RunRunTypes` consists of two easy to use functions, `gen` and `type`.

```js
import { gen, type } from 'runruntypes';
```

The `gen` function is used to attach a type signature to your function. Using this signature
you can constrain the arguments' types and the function's return type. The `gen` function will
wrap your function and return one that performs the checks when called. A signature is basically
a Flow type annotation:

```js
const fn = gen`
  (string, number, number) => [string, number]
`((str, a, b) => [str, a + b])

fn('test', 1, 2) // returns: ['test', 3]
fn('test', 1) // error!
fn(1, 1, 1) // error!
```

The above example shows a simple definition and how arguments are checked.
Similarly the return types are checked when your function completes:

```js
const fn = gen`
  (string, number, number) => [string, number]
`((str, a, b) => null)

fn('test', 1, 2) // error!
```

The second function, `type` is used to alias type signatures to a variable. It can be used to predefine
some types which can then be interpolated into your `gen` definition.

```js
import { gen, type } from 'runruntypes';

const Errorish = type`
  { message: ?string }
`;

const isError = gen`(${Errorish} | void) => bool`(err => {
  return err !== undefined && !!err.message;
});
```

This extracts an object definition type outside of the `gen` definition. For comparison, without a type alias
you'd simply write this definition inline, which can become tedious if it's being used and repeated quite often:

```js
import { gen } from 'runruntypes';

const isError = gen`
  ({ message: ?string } | void) => bool
`(err => {
  return err !== undefined && !!err.message;
});
```

`RunRunTypes` uses the `@babel/parser` to parse any input to it. A large subset of Flow type annotations
will be parsed without a problem and will be correctly check. You can always expect this library
to throw a `TypeError` when it either:

- doesn't understand your type definition
- or; has caught a type error

[Feel free to read more about Flow type annotations here](https://flow.org/en/docs/types/)

## API

### `type`

A [tagged template literal](https://www.styled-components.com/docs/advanced#tagged-template-literals) that accepts
a Flow type definition consisting of any of the supported types and syntax.

This will return a function that checks the first argument against the type definition and returns `true` if it
passes the type checks and `false` if it doesn't.

```js
type`string`('test') // true
type`{ x: 1 }`({ x: 2 }) // false
```

### `gen`

A [tagged template literal](https://www.styled-components.com/docs/advanced#tagged-template-literals) that accepts
a Flow arrow function type definition consisting of any of the supported types and syntax.

It expects any number of arguments and a return type. Normal type definitions that are not function definitions
will cause it to throw an error.

It returns a factory function that wraps any function passed as the first argument in a new type checked and
guarded function, i.e. it'll expect the argument to comply to the type definition that has been defined
and will enforce it.

```js
gen`string => string`(x => 'Hello, ' + x)('Luke')
gen`(number, 4) => string`((a, b) => '' + a + b)(2, 4)
```

### Supported Types

Currently the following types are supported:

- primitive types (`bool`, `number`, `string`, `null`, `void`, `any`)
- literal types (e.g. `true`, `false`, `2`, `"hello"`)
- nullables (`?number`, i.e. `null`, `undefined`, `number`)
- arrays (`number[]`)
- tuples (`[number, number]`)
- objects (`{ x: number }` without support for optionals nor methods)
- unions (`number | string` meaning that both are allowed)
- intersections (`{ x: 1 } & { y: 2 }` meaning that both must match)
- generic constructors (e.g. `Date` or `Element` which will simply check the constructor's name)
- "any" functions or objects (write `Object` to match any object, `Function` to match any function)

You can mix and combine the types as you'd expect in a real typed language.
Remember that `gen` expects a function definition and `type` any of the above.
