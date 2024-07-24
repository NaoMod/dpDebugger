# dpDebugger

Typescript implementation of a domain-parametric debugger.

> **Warning**
>
> This repository stores the live version of dpDebugger, as well as different versions referenced in multiple papers.
>
> To access the live version of dpDebugger, refer to the [main](https://github.com/NaoMod/dpDebugger/tree/main) branch.
> 
> To access the version referenced in the paper *dpDebugger: a Domain-parametric Debugger for DSLs
using DAP and Language Protocols* submitted to the Tools and Demonstrations track at MODELS 2024, go to the [toolsMODELS2024](https://github.com/NaoMod/dpDebugger/tree/toolsMODELS2024) tag.
>
> Similarly, to access the version referenced in the paper *Language Protocols for Domain-Specific Interactive Debugging* submitted to the SoSym journal, go to the [sosym2024](https://github.com/NaoMod/dpDebugger/tree/sosym2024) tag.


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