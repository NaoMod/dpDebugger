# dpDebugger

Typescript implementation of a domain-parametric debugger.

## Requirements

- [Node.js](https://nodejs.org) 18.0+
- [TypeScript](https://www.typescriptlang.org/) 4.8+

## Build

From the root folder:
- `npm i`
- `tsc`

## Run

From the root folder:
- `node out/main.js --port=<PORT>` where PORT is the number of the port at which the debugger will listen (usually 49153).