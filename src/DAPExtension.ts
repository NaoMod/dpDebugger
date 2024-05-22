/**
 * Arguments of a cDAP request.
 */
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
}

/**
 * Leaf which can be enabled or disabled.
 */
type EnablableLeaf = Leaf & {
    /** True if this item is currently enabled, false otherwise. */
    isEnabled: boolean;
}

/**
 * Arguments for the 'getBreakpointTypes' cDAP request.
*/
export type GetBreakpointTypesArguments = Arguments;

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
    targetElementType?: string;
}

/**
 * Arguments for the 'getEnabledStandaloneBreakpointTypes' cDAP request.
*/
export type GetEnabledStandaloneBreakpointTypesArguments = Arguments;

/**
 * Response to the 'getEnabledStandaloneBreakpointTypes' cDAP request.
 */
export type GetEnabledStandaloneBreakpointTypesResponse = {
    /** IDs of the currently enabled standalone breakpoint types. */
    enabledStandaloneBreakpointTypesIds: string[];
}

/**
 * Arguments for the 'enableStandaloneBreakpointTypes' cDAP request.
*/
export type EnableStandaloneBreakpointTypesArguments = Arguments & {
    /** IDs of the standalone breakpoint types to enable. */
    breakpointTypesIds: string[];
}

/**
 * Arguments for the 'getSourceBreakpointsTargetTypes' cDAP request.
*/
export type GetSourceBreakpointsTargetTypesArguments = Arguments & {
    /** IDs of the source breakpoints for which to retrieve target types. */
    sourceBreakpointsIds: number[];
};

/**
 * Response to the 'getSourceBreakpointsTargetTypes' cDAP request.
*/
export type GetSourceBreakpointsTargetTypesResponse = {
    /** Types of the elements targeted by different source breakpoints. */
    sourceBreakpointTargetTypes: SourceBreakpointTargetTypes[];
};

/**
 * Types of the element targeted by a source breakpoint.
 */
export type SourceBreakpointTargetTypes = {
    /** ID of the source breakpoint. */
    sourceBreakpointId: number;

    /** Types of the element targeted by the source breakpoint. */
    types: string[];
}

/**
 * Arguments for the 'getDomainSpecificBreakpoints' cDAP request.
 */
export type GetDomainSpecificBreakpointsArguments = Arguments;

/**
 * Response to the 'getDomainSpecificBreakpoints' cDAP request.
 */
export type GetDomainSpecificBreakpointsResponse = {
    /** Domain-specific breakpoints currently enabled. */
    breakpoints: DomainSpecificBreakpointsFromSourceBreakpoint[];
}

/**
 * Arguments for the 'setDomainSpecificBreakpoints' cDAP request.
*/
export type SetDomainSpecificBreakpointsArguments = Arguments & {
    /** Domain-specific breakpoints to create. */
    breakpoints: DomainSpecificBreakpointsCreationInfo[];
}

/** Domain-specific breakpoints associated to a source breakpoint. */
export type DomainSpecificBreakpointsFromSourceBreakpoint = {
    /** ID of the source breakpoint from which the domain-specific breakpoints are created. */
    sourceBreakpointId: number;

    /** IDs of the parameterized breakpoint types to enable for this domain-specific breakpoint. */
    enabledBreakpointTypesIds: string[];
}

/** Information necessary to create domain-specific breakpoints from a source breakpoint. */
export type DomainSpecificBreakpointsCreationInfo = Omit<DomainSpecificBreakpointsFromSourceBreakpoint, 'targetElementTypes'>;

/**
 * Arguments for the 'getAvailableSteps' cDAP request.
*/
export type GetAvailableStepsArguments = Arguments;

/**
 * Response to the 'getAvailableSteps' cDAP request.
*/
export type GetAvailableStepsResponse = {
    /** Currently available steps. */
    availableSteps: Step[];
}

/**
 * Arguments for the 'enableStep' cDAP request.
*/
export type EnableStepArguments = Arguments & {
    /** ID of the step to enable. */
    stepId: string;
}

/**
 * Execution step listed by the language runtime.
*/
export type Step = EnablableLeaf;