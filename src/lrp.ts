type Arguments = {
    /** Source file targeted by the service call. */
    sourceFile: string;
}

export type ParseArguments = Arguments;

export type ParseResponse = {
    /** Root of the AST. */
    astRoot: ModelElement;
}

export type InitializeExecutionArguments = Arguments & {
    /** Arbitrary arguments necessary for the initialization of a runtime state. */
    bindings: Bindings;
}

export type InitializeExecutionResponse = {};

/**
 * Bindings to model elements or literal values. 
 */
export type Bindings = {
    /** Properties with arbitrary key and value. */
    [key: string]: unknown;
}

export type GetBreakpointTypesResponse = {
    /** Breakpoint types defined by the language runtime. */
    breakpointTypes: BreakpointType[];
}

export type ExecuteAtomicStepArguments = Arguments & {
    /** Identifier of the step. */
    stepId: string;
}

export type ExecuteAtomicStepResponse = {
    completedSteps: string[];
}

export type GetRuntimeStateArguments = Arguments;

export type GetRuntimeStateResponse = {
    /** Root of the runtime state. */
    runtimeStateRoot: ModelElement;
}

export type CheckBreakpointArguments = Arguments & {
    /** Identifier of the step. */
    stepId: string;

    /** Identifier of the breakpoint type. */
    typeId: string;

    /** Arbitrary arguments required to check the breakpoint. */
    bindings: Bindings;
}

export type CheckBreakpointResponse = PositiveCheckBreakpointResponse | NegativeCheckBreakpointResponse;

type PositiveCheckBreakpointResponse = {
    /** True if the breakpoint is activated, false otherwise. */
    isActivated: true;

    /** Human-readable message to describe the cause of activation. */
    message: string;
}

type NegativeCheckBreakpointResponse = {
    /** True if the breakpoint is activated, false otherwise. */
    isActivated: false;
}

/**
 * Element of the AST or runtime state.
 */
export type ModelElement = {
    /** Unique identifier of the element. */
    id: string;

    /** Types of the element. At least one type must be specified. */
    types: string[];

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
export type Location = {
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
export type BreakpointType = {
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
export type BreakpointParameter = {
    /** Name of the parameter. */
    name: string;

    /** True is the parameter is a collection, false otherwise. */
    isMultivalued: boolean;
} & (PrimitiveBreakpointParameter | ObjectBreakpointParameter);

/**
 * Primitive breakpoint parameter.
 */
export type PrimitiveBreakpointParameter = {
    type: 'primitive';

    /** Primitive type of the parameter. */
    primitiveType: PrimitiveType;
}

/**
 * Object breakpoint parameter.
 */
export type ObjectBreakpointParameter = {
    type: 'object';

    /**
     * Object type of the parameter.
     * If the object is a model element, the type is the same as defined in {@link ModelElement.type}.
     */
    objectType: string;
}

/**
 * Primitive type of a value.
 */
export enum PrimitiveType {
    BOOLEAN = 'boolean',
    STRING = 'string',
    NUMBER = 'number'
}

export type GetAvailableStepsArguments = Arguments;

export type GetAvailableStepsResponse = {
    parentStepId?: string;
    availableSteps: Step[];
}

export type EnterCompositeStepArguments = Arguments & {
    stepId: string;
};

export type EnterCompositeStepResponse = {};

export type Step = {
    id: string;
    name: string;
    isComposite: boolean;
    description?: string;
}

export type GetStepLocationArguments = Arguments & {
    stepId: string;
}

export type GetStepLocationResponse = {
    location?: Location;
}