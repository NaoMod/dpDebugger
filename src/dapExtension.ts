export interface GetBreakpointTypesResponse {
    /** Breakpoint types defined by the language runtime. */
    breakpointTypes: BreakpointType[];
}

/**
 * Breakpoint type defined by the language runtime.
 */
export interface BreakpointType {
    /** Unique identifier of the breakpoint type. */
    id: string;

    /** Human-readable name of the breakpoint type. */
    name: string;

    /** Type of the elements targeted by this breakpoint type. */
    targetElementTypeId: string;

    /** Human-readable description of the breakpoint type. */
    description: string;

    /** True if this breakpoint type is currently enabled, false otherwise. */
    isEnabled: boolean;
}