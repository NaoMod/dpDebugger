interface Arguments {
    sourceFile: string;
}

export interface ParseArguments extends Arguments { }

export interface ParseResponse {
    astRoot: ModelElement;
}

export interface InitArguments extends Arguments {
    [additionalArg: string]: unknown;
}

export interface InitResponse {
    isExecutionDone: boolean;
}

export interface GetBreakpointTypesResponse {
    breakpointTypes: BreakpointType[];
}

export interface StepArguments extends Arguments { }

export interface StepResponse {
    isExecutionDone: boolean;
}

export interface GetRuntimeStateArguments extends Arguments { }

export interface GetRuntimeStateResponse {
    runtimeStateRoot: ModelElement;
}

export interface CheckBreakpointArguments extends Arguments {
    typeId: string;
    elementId: string;
}

export interface CheckBreakpointResponse {
    isActivated: boolean;
    message?: string;
}

export interface ModelElement {
    id: string;
    type: string;
    children: { [key: string]: ModelElement | ModelElement[]; };
    refs: { [key: string]: string | string[]; };
    attributes: { [key: string]: any; };
    location?: Location;
}

export interface Location {
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
}

export interface BreakpointType {
    id: string;
    name: string;
    description: string;
    parameters: BreakpointParameter[];
}

export interface BreakpointParameter {
    name: string;
    isMultivalued: boolean;
    primitiveType?: PrimitiveType;
    objectType?: string;
}

export enum PrimitiveType {
    BOOLEAN = 'boolean',
    STRING = 'string', 
    NUMBER = 'number'
}