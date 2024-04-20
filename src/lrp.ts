/**
 * Arguments to a LRP request.
 */
type Arguments = {
    /** Source file targeted by the request. */
    sourceFile: string;
}

/**
 * Arguments for the 'parse' LRP request.
*/
export type ParseArguments = Arguments;

/**
 * Response to the 'parse' LRP request.
 */
export type ParseResponse = {
    /** Root of the AST. */
    astRoot: ModelElement;
}

/**
 * Arguments for the 'initializeExecution' LRP request.
*/
export type InitializeExecutionArguments = Arguments & {
    /** Arbitrary arguments necessary for the initialization of a runtime state. */
    bindings: Bindings;
}

/**
 * Response to the 'initializeExecution' LRP request.
 */
export type InitializeExecutionResponse = {};

/**
 * Bindings to model elements or literal values. 
 */
export type Bindings = {
    /** Properties with arbitrary key and value. */
    [key: string]: unknown;
}

/**
 * Response to the 'getBreakpointTypes' LRP request.
 */
export type GetBreakpointTypesResponse = {
    /** Breakpoint types defined by the language runtime. */
    breakpointTypes: BreakpointType[];
}

/**
 * Arguments for the 'executeAtomicStep' LRP request.
*/
export type ExecuteAtomicStepArguments = Arguments & {
    /** Identifier of the atomic step to execute. */
    stepId: string;
}

/**
 * Response to the 'executeAtomicStep' LRP request.
 */
export type ExecuteAtomicStepResponse = {
    /** Identifiers of the steps completed after the execution of the atomic step. */
    completedSteps: string[];
}

/**
 * Arguments for the 'getRuntimeState' LRP request.
*/
export type GetRuntimeStateArguments = Arguments;

/**
 * Response to the 'getRuntimeState' LRP request.
 */
export type GetRuntimeStateResponse = {
    /** Root of the runtime state. */
    runtimeStateRoot: ModelElement;
}

/**
 * Arguments for the 'checkBreakpoint' LRP request.
*/
export type CheckBreakpointArguments = Arguments & {
    /** Identifier of the step on which to check the breakpoint. */
    stepId: string;

    /** Identifier of the breakpoint type. */
    typeId: string;

    /** Arbitrary arguments required to check the breakpoint. */
    bindings: Bindings;
}

/**
 * Response to the 'checkBreakpoint' LRP request.
 */
export type CheckBreakpointResponse = PositiveCheckBreakpointResponse | NegativeCheckBreakpointResponse;

/**
 * Positive response to the 'checkBreakpoint' LRP request.
 */
type PositiveCheckBreakpointResponse = {
    /** True if the breakpoint is activated, false otherwise. */
    isActivated: true;

    /** Human-readable message to describe the cause of activation. */
    message: string;
}

/**
 * Negative response to the 'checkBreakpoint' LRP request.
 */
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
    description?: string;

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
type PrimitiveBreakpointParameter = {
    /** Type of the parameter. */
    type: 'primitive';

    /** Primitive type of the primitive parameter. */
    primitiveType: PrimitiveType;
}

/**
 * Object breakpoint parameter.
 */
type ObjectBreakpointParameter = {
    /** Type of the parameter. */
    type: 'object';

    /**
     * Object type of the object parameter.
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

/**
 * Arguments for the 'getAvailableSteps' LRP request.
*/
export type GetAvailableStepsArguments = Arguments;

/**
 * Response to the 'getAvailableSteps' LRP request.
 */
export type GetAvailableStepsResponse = {
    /** Currently available steps. */
    availableSteps: Step[];
}

/**
 * Arguments for the 'enterCompositeStep' LRP request.
*/
export type EnterCompositeStepArguments = Arguments & {
    /** Identifier of the composite step to enter. */
    stepId: string;
};

/**
 * Response to the 'enterCompositeStep' LRP request.
 */
export type EnterCompositeStepResponse = {};

/**
 * Execution step.
 */
export type Step = {
    /** Unique identifier of the step. */
    id: string;

    /** Human-readable name of the step. */
    name: string;

    /** True if the step is composite, false otherwise. */
    isComposite: boolean;

    /** Human-readable description of the step. */
    description?: string;
}

/**
 * Arguments for the 'getStepLocation' LRP request.
*/
export type GetStepLocationArguments = Arguments & {
    /** Identifier of the step for which to retrieve the location. */
    stepId: string;
}

/**
 * Response to the 'getStepLocation' LRP request.
 */
export type GetStepLocationResponse = {
    /** Location of the step. */
    location?: Location;
}