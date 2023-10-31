interface Arguments {
    /** Source file targeted by the service call. */
    sourceFile: string;
}

/**
 * Item represented as a leaf in a tree view.
 */
interface Leaf {
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
 export interface BreakpointType extends Leaf {
    /** Type of the elements targeted by this breakpoint type. */
    targetElementTypeId: string;
}

export interface GetBreakpointTypesResponse {
    /** Breakpoint types defined by the language runtime. */
    breakpointTypes: BreakpointType[];
}

/**
 * Arguments to request the enablement of certain breakpoint types.
 */
export interface EnableBreakpointTypesArgs extends Arguments {
    /** Breakpoint types to enable. */
    breakpointTypeIds: string[];
}

/**
 * Stepping modes defined by the language runtime.
 */
export interface SteppingMode extends Leaf { }

/**
 * Response containing the stepping modes defined by the language runtime.
 */
export interface GetSteppingModesResponse {
    /** Stepping modes defined by the language runtime. */
    steppingModes: SteppingMode[];
}

export interface Step extends Leaf { }

export interface GetAvailableStepsResponse {
    availableSteps: Step[];
}