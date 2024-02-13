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
    description: string;

    /** True if this item is currently enabled, false otherwise. */
    isEnabled: boolean;
}

/**
 * Breakpoint type defined by the language runtime.
 */
export type BreakpointType = Leaf & {
    /** Type of the element targeted by this breakpoint type. */
    targetElementTypeId?: string;
}

export type GetBreakpointTypesResponse = {
    /** Breakpoint types defined by the language runtime. */
    breakpointTypes: BreakpointType[];
}

/**
 * Arguments to request the enablement of certain breakpoint types.
 */
export type EnableBreakpointTypesArguments = Arguments & {
    /** Breakpoint types to enable. */
    breakpointTypeIds: string[];
}

export type Step = Leaf;

/**
 * Arguments to request the enablement of a certain step.
 */
export type EnableStepArguments = Arguments & {
    stepId: string;
}

export type GetAvailableStepsResponse = {
    availableSteps: Step[];
}