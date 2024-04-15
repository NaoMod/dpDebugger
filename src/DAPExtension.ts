type Arguments = {
    /** Source file targeted by the service call. */
    sourceFile: string;
}

/**
 * Item represented as a leaf in a tree view.
 */
type Leaf = {
    /** Unique identifier of the item. */
    id: string;

    /** Human-readable name of the item. */
    name: string;

    /** Human-readable description of the item. */
    description?: string;

    /** True if this item is currently enabled, false otherwise. */
    isEnabled: boolean;
}

/**
 * Arguments for the 'getBreakpointTypes' cDAP request.
*/
export type EnableBreakpointTypesArguments = Arguments & {
    /** Breakpoint types to enable. */
    breakpointTypeIds: string[];
}

/**
 * Response to the 'getBreakpointTypes' cDAP request.
 */
export type GetBreakpointTypesResponse = {
    /** Breakpoint types defined by the language runtime. */
    breakpointTypes: BreakpointType[];
}

/**
 * Breakpoint type defined by the language runtime.
 */
export type BreakpointType = Leaf & {
    /** Type of the element targeted by this breakpoint type. */
    targetElementTypeId?: string;
}

/**
 * Arguments for the 'enableStep' cDAP request.
*/
export type EnableStepArguments = Arguments & {
    /** Id of the step to enable. */
    stepId: string;
}

/**
 * Response to the 'enableStep' cDAP request.
*/
export type GetAvailableStepsResponse = {
    /** Currently available steps. */
    availableSteps: Step[];
}

/**
 * Execution step listed by the language runtime.
*/
export type Step = Leaf;