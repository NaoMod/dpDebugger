/**
 * Arguments of a dpDAP request.
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
 * Leaf which can be selected.
 */
type SelectedLeaf = Leaf & {
    /** True if this item is currently selected, false otherwise. */
    isSelected: boolean;
}

/**
 * Arguments for the 'getBreakpointTypes' dpDAP request.
*/
export type GetBreakpointTypesArguments = Arguments;

/**
 * Response to the 'getBreakpointTypes' dpDAP request.
 */
export type GetBreakpointTypesResponse = {
    /** Breakpoint types defined by the language runtime. */
    breakpointTypes: BreakpointType[];
}

/**
 * Breakpoint type defined by the language runtime.
 */
export type BreakpointType = Leaf & {
    /** Parameters needed to evaluate a breakpoint of this type. */
    parameters: BreakpointParameter[];
}

/**
 * Parameter required by a breakpoint type.
 */
export type BreakpointParameter = PrimitiveBreakpointParameter | ElementBreakpointParameter;

/**
 * Primitive breakpoint parameter.
 */
export type PrimitiveBreakpointParameter = {
    /** Type of the parameter. */
    type: 'primitive';

    /** Name of the parameter. */
    name: string;

    /** True is the parameter is a collection, false otherwise. */
    isMultivalued: boolean;

    /** Primitive type of the primitive parameter. */
    primitiveType: 'boolean' | 'number' | 'string';
}

/**
 * Reference breakpoint parameter.
 */
export type ElementBreakpointParameter = {
    /** Type of the parameter. */
    type: 'element';

    /** Name of the parameter. */
    name: string;

    /** True is the parameter is a collection, false otherwise. */
    isMultivalued: boolean;

    /** Type of the target model element, as defined in {@link ModelElement.types}. */
    elementType: string;
}

/**
 * Arguments for the 'setDomainSpecificBreakpoints' dpDAP request.
*/
export type SetDomainSpecificBreakpointsArguments = Arguments & {
    /** Domain-specific breakpoints to create. */
    breakpoints: DomainSpecificBreakpoint[];
}

/**
 * Response to the 'setDomainSpecificBreakpoints' dpDAP request.
*/
export type SetDomainSpecificBreakpointsResponse = {
    /** Domain-specific breakpoints to create. */
    breakpoints: DomainSpecificBreakpointCreationInformation[];
}

/** Domain-specific breakpoint. */
export type DomainSpecificBreakpoint = {
    /** Arguments required by the breakpoint type. */
    entries: Entries;

    /** Breakpoint type to create an instance of. */
    breakpointTypeId: string;
}

/** Domain-specific breakpoint creation information. */
export type DomainSpecificBreakpointCreationInformation = {
    /** True if the breakpoint could be set, false otherwise. */
    verified: boolean;
}

/**
 * Arbitrary entries for model elements or literal values. 
 */
export type Entries = {
    /** Properties with arbitrary key and value. */
    [key: string]: unknown;
}

/**
 * Arguments for the 'getAvailableSteps' dpDAP request.
*/
export type GetAvailableStepsArguments = Arguments;

/**
 * Response to the 'getAvailableSteps' dpDAP request.
*/
export type GetAvailableStepsResponse = {
    /** Currently available steps. */
    availableSteps: Step[];
}

/**
 * Arguments for the 'selectStep' dpDAP request.
*/
export type SelectStepArguments = Arguments & {
    /** ID of the step to enable. */
    stepId: string;
}

/**
 * Response to the 'selectStep' dpDAP request.
*/
export type SelectStepResponse = { };


/**
 * Execution step listed by the language runtime.
*/
export type Step = SelectedLeaf;

/**
 * Arguments for the 'getModelElementsReferences' dpDAP request.
*/
export type GetModelElementsReferencesArguments = Arguments & {
    /** Type of the elements to retrieve. */
    type: string;
}

/**
 * Response to the 'getModelElementsReferences' dpDAP request.
*/
export type GetModelElementsReferencesResponse = {
    /** Model elements with the specified type. */
    elements: ModelElementReference[];
}

/** Reference to a model element. */
export type ModelElementReference = {
    /** Unique identifier of the element. */
    id: string;

    /** Types of the element. At least one type must be specified. */
    types: string[];

    /** Textual representation of the element. */
    label: string;
}

/**
 * Arguments for the 'getModelElementReferenceFromSource' dpDAP request.
*/
export type GetModelElementReferenceFromSourceArguments = Arguments & {
    /** Line at which to look for an element. */
    line: number;

    /** Column at which to look for an element. */
    column: number;
}

/**
 * Response to the 'getModelElementReferenceFromSource' dpDAP request.
*/
export type GetModelElementReferenceFromSourceResponse = {
    /** Element located at the specificed source location. */
    element?: ModelElementReference;
}