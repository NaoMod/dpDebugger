interface Arguments {
    /** Source file targeted by the service call. */
    sourceFile: string;
}

export interface ParseArguments extends Arguments { }

export interface ParseResponse {
    /** Root of the AST. */
    astRoot: ModelElement;
}

export interface InitArguments extends Arguments {
    /** Arbitrary argument necessary for the initialization of a runtime state. */
    [additionalArg: string]: unknown;
}

export interface InitResponse {
    /** True if the execution is done, false otherwise. */
    isExecutionDone: boolean;
}

export interface GetBreakpointTypesResponse {
    /** Breakpoint types defined by the language runtime. */
    breakpointTypes: BreakpointType[];
}

export interface StepArguments extends Arguments { }

export interface StepResponse {
    /** True if the execution is done, false otherwise. */
    isExecutionDone: boolean;
}

export interface GetRuntimeStateArguments extends Arguments { }

export interface GetRuntimeStateResponse {
    /** Root of the runtime state. */
    runtimeStateRoot: ModelElement;
}

export interface CheckBreakpointArguments extends Arguments {
    /** Identifier of the breakpoint type. */
    typeId: string;

    /** Identifier of the model element. */
    elementId: string;
}

export interface CheckBreakpointResponse {
    /** True if the breakpoint is activated, false otherwise. */
    isActivated: boolean;

    /** 
     * Human-readable message to describe the cause of activation.
     * Should only be set if `isActivated` is true.
     */
    message?: string;
}

/**
 * Element of the AST or runtime state.
 */
export interface ModelElement {
    /** Unique identifier of the element. */
    id: string;

    /** Type of the element. */
    type: string;

    /** Containment relations with other elements. */
    children: { [key: string]: ModelElement | ModelElement[]; };

    /** References to other elements. */
    refs: { [key: string]: string | string[]; };

    /** Attributes with primitive values. */
    attributes: { [key: string]: any; };

    /** Location of the element in its original source file. */
    location?: Location;
}

/**
 * Location in a textual source file.
 */
export interface Location {
    /** Starting line. */
    line: number;

    /** Starting column. */
    column: number;

    /** End line. */
    endLine: number;

    /** End column. */
    endColumn: number;
}

/**
 * Breakpoint type defined by the language runtime.
 */
export interface BreakpointType {
    /** Unique identifier of the breakpoint type. */
    id: string;

    /** Human-readable name of the breakpoint type. */
    name: string;

    /** Human-readable description of the breakpoint type. */
    description: string;

    /** Parameters needed to evaluate a breakpoint of this type. */
    parameters: BreakpointParameter[];
}

/**
 * Parameter required by a breakpoint type.
 */
export interface BreakpointParameter {
    /** Name of the parameter. */
    name: string;

    /** True is the parameter is a collection, false otherwise. */
    isMultivalued: boolean;

    /**
     * Primitive type of the parameter.
     * Exactly one of `primitiveType` and `objectType` must be set.
     */
    primitiveType?: PrimitiveType;

    /**
     * Object type of the parameter, as defined in {@link ModelElement.type}.
     * Exactly one of `primitiveType` and `objectType` must be set.
     */
    objectType?: string;
}

/**
 * Primitive type of a value.
 */
export enum PrimitiveType {
    BOOLEAN = 'boolean',
    STRING = 'string',
    NUMBER = 'number'
}