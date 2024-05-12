import { Breakpoint } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import * as DAPExtension from "./DAPExtension";
import { LanguageRuntimeProxy } from "./lrProxy";
import * as LRP from "./lrp";

/**
 * Manages breakpoints set through cDAP.
 */
export class CDAPBreakpointManager {

    /** Registry of all AST elements. */
    private astElementRegistry: ASTElementRegistry;

    /** Available parameterized breakpoint types defined by the language runtime. element type -> breakpoint types */
    private _availableParameterizedBreakpointTypes: Map<string, Set<LRP.BreakpointType>>;

    /** Available standalone breakpoint types defined by the language runtime. type ID -> breakpoint type*/
    private _availableStandaloneBreakpointTypes: Map<string, LRP.BreakpointType>;

    private defaultParameterizedBreakpointTypes: Set<LRP.BreakpointType>;

    private _domainSpecificBreakpoints: Map<number, DomainSpecificBreakpoint>;

    private elementsWithBreakpoints: Set<LRP.ModelElement>;

    /** Previously activated breakpoints targeting an AST element. */
    private activatedDomainSpecificBreakpoints: Set<DomainSpecificBreakpoint>;

    /** Currently enabled breakpoints not targeting any AST element. */
    private _enabledStandaloneBreakpoints: Set<LRP.BreakpointType>;

    /** Previously activated breakpoints not targeting any AST element. */
    private activatedStandaloneBreakpoints: Set<LRP.BreakpointType>;

    /** Line offset of the IDE. */
    private lineOffset: number;

    /** Column offset of the IDE. */
    private columnOffset: number;

    constructor(private sourceFile: string, private lrProxy: LanguageRuntimeProxy, astRoot: LRP.ModelElement, availableBreakpointTypes: LRP.BreakpointType[]) {
        this.astElementRegistry = new ASTElementRegistry(astRoot);

        this._availableParameterizedBreakpointTypes = new Map();
        this._availableStandaloneBreakpointTypes = new Map();
        this.defaultParameterizedBreakpointTypes = new Set();

        this._domainSpecificBreakpoints = new Map();
        this.elementsWithBreakpoints = new Set();
        this.activatedDomainSpecificBreakpoints = new Set();

        this._enabledStandaloneBreakpoints = new Set();
        this.activatedStandaloneBreakpoints = new Set();

        this.lineOffset = 0;
        this.columnOffset = 0;

        for (const breakpointType of availableBreakpointTypes) {
            if (breakpointType.parameters.length === 0) {
                this._availableStandaloneBreakpointTypes.set(breakpointType.id, breakpointType);
                continue;
            }

            if (breakpointType.parameters.length !== 1 || breakpointType.parameters[0].type === 'primitive' || breakpointType.parameters[0].isMultivalued) continue;

            const targetElementType: string = breakpointType.parameters[0].objectType;
            const breakpointTypesForType: Set<LRP.BreakpointType> = this._availableParameterizedBreakpointTypes.has(targetElementType) ? this._availableParameterizedBreakpointTypes.get(targetElementType)! : new Set();
            breakpointTypesForType.add(breakpointType);
            this._availableParameterizedBreakpointTypes.set(targetElementType, breakpointTypesForType);
        }
    }

    /**
     * Checks if any breakpoint is activated based on the current state of the program and information on the next step
     * performed by the language (either composite or atomic).
     * 
     * @param stepId ID of the step on which to check breakpoints.  
     * @returns The breakpoint that activated first, or undefined if no breakpoint was activated.
     */
    public async checkBreakpoints(stepId: string): Promise<ActivatedBreakpoint | undefined> {
        for (const enabledStandaloneBreakpointType of this._enabledStandaloneBreakpoints) {
            if (this.activatedStandaloneBreakpoints.has(enabledStandaloneBreakpointType)) continue;

            const args: LRP.CheckBreakpointArguments = {
                sourceFile: this.sourceFile,
                typeId: enabledStandaloneBreakpointType.id,
                bindings: {},
                stepId: stepId
            };

            const checkBreakpointResponse: LRP.CheckBreakpointResponse = await this.lrProxy.checkBreakpoint(args);

            if (checkBreakpointResponse.isActivated) {
                this.activatedStandaloneBreakpoints.add(enabledStandaloneBreakpointType);
                return {
                    message: checkBreakpointResponse.message
                };
            }
        }

        for (const domainSpecificBreakpoint of this._domainSpecificBreakpoints.values()) {
            if (this.activatedDomainSpecificBreakpoints.has(domainSpecificBreakpoint)) continue;

            for (const enabledBreakpointType of domainSpecificBreakpoint.enabledBreakpointTypes) {
                const args: LRP.CheckBreakpointArguments = {
                    sourceFile: this.sourceFile,
                    typeId: enabledBreakpointType.id,
                    bindings: {
                        [enabledBreakpointType.parameters[0].name]: domainSpecificBreakpoint.targetElement.id
                    },
                    stepId: stepId
                };

                const checkBreakpointResponse: LRP.CheckBreakpointResponse = await this.lrProxy.checkBreakpoint(args);

                if (checkBreakpointResponse.isActivated) {
                    this.activatedDomainSpecificBreakpoints.add(domainSpecificBreakpoint);
                    return {
                        message: checkBreakpointResponse.message
                    };
                }
            }
        }

        this.activatedStandaloneBreakpoints.clear();
        this.activatedDomainSpecificBreakpoints.clear();
        return undefined;
    }

    /**
     * Sets multiple domain-specific breakpoints from source breakpoints.
     * Previously set breakpoints are removed.
     * 
     * @param sourceBreakpoints Source breakpoints to be set.
     * @returns Information about the result of setting each breakpoint.
     */
    public setBreakpoints(sourceBreakpoints: DebugProtocol.SourceBreakpoint[]): DebugProtocol.Breakpoint[] {
        this.elementsWithBreakpoints.clear();
        const previousDomainSpecificBreakpoints: Map<number, DomainSpecificBreakpoint> = this._domainSpecificBreakpoints;
        const newDomainSpecificBreakpoints: Map<number, DomainSpecificBreakpoint> = new Map();
        const setBreakpoints: DebugProtocol.Breakpoint[] = [];
        let currentId: number = 0;

        for (const sourceBreakpoint of sourceBreakpoints) {
            const previousDomainSpecificBreakpoint: DomainSpecificBreakpoint | undefined = this.retrieveDomainSpecificBreakpointFromSourceBreakpoint(sourceBreakpoint, previousDomainSpecificBreakpoints);

            // source breakpoint already used in an existing domain-specific breakpoint
            if (previousDomainSpecificBreakpoint !== undefined) {
                previousDomainSpecificBreakpoint.id = currentId;
                newDomainSpecificBreakpoints.set(previousDomainSpecificBreakpoint.id, previousDomainSpecificBreakpoint);
                setBreakpoints.push({ id: previousDomainSpecificBreakpoint.id, verified: true });

                this.elementsWithBreakpoints.add(previousDomainSpecificBreakpoint.targetElement);
                currentId++;
                continue;
            }

            if (sourceBreakpoint.column === undefined) {
                setBreakpoints.push(new Breakpoint(false));
                continue;
            }

            const element: LRP.ModelElement | undefined = this.astElementRegistry.getElementFromPosition(sourceBreakpoint.line + this.lineOffset, sourceBreakpoint.column + this.columnOffset);
            if (element === undefined || element.location === undefined || this.elementsWithBreakpoints.has(element) || !this.hasPossibleBreakpointType(element)) {
                setBreakpoints.push(new Breakpoint(false));
                continue;
            }

            const defaultEnabledBreakpointTypes: LRP.BreakpointType[] = this.findDefaultEnabledBreakpointTypes(element);
            const domainSpecificBreakpoint: DomainSpecificBreakpoint = {
                id: currentId,
                sourceBreakpoint: sourceBreakpoint,
                enabledBreakpointTypes: defaultEnabledBreakpointTypes,
                targetElement: element
            }
            newDomainSpecificBreakpoints.set(domainSpecificBreakpoint.id, domainSpecificBreakpoint);
            setBreakpoints.push({ id: domainSpecificBreakpoint.id, verified: true });

            this.elementsWithBreakpoints.add(element);
            currentId++;
        }

        this._domainSpecificBreakpoints = newDomainSpecificBreakpoints;

        return setBreakpoints;
    }

    // TODO: what happens when not all existing domain-specific breakpoints are passed?
    public setDomainSpecificBreakpoints(breakpoints: DAPExtension.DomainSpecificBreakpoint[]): void {
        for (const breakpoint of breakpoints) {
            const domainSpecificBreakpoint: DomainSpecificBreakpoint | undefined = this._domainSpecificBreakpoints.get(breakpoint.sourceBreakpointId);
            if (domainSpecificBreakpoint === undefined) continue;

            domainSpecificBreakpoint.enabledBreakpointTypes = [];
            for (const breakpointTypeId of breakpoint.enabledBreakpointTypeIds) {
                const breakpointType: LRP.BreakpointType | undefined = this.findParameterizedBreakpointType(breakpointTypeId);
                if (breakpointType === undefined) continue;

                domainSpecificBreakpoint.enabledBreakpointTypes.push(breakpointType);
            }
        }
    }

    /**
     * Sets the format of lines and columns manipulated by the editor.
     * 
     * @param linesStartAt1 True if the lines start at one, false if they start at 0.
     * @param columnsStartAt1 True if the columns start at one, false if they start at 0.
     */
    public setFormat(linesStartAt1: boolean, columnsStartAt1: boolean): void {
        this.lineOffset = -!!(!linesStartAt1);
        this.columnOffset = -!!(!columnsStartAt1);
    }

    public enableStandaloneBreakpointTypes(breakpointTypeIds: string[]): void {
        this._enabledStandaloneBreakpoints.clear();

        for (const breakpointTypeId of breakpointTypeIds) {
            const breakpointType: LRP.BreakpointType | undefined = this._availableStandaloneBreakpointTypes.get(breakpointTypeId);
            if (breakpointType !== undefined) this._enabledStandaloneBreakpoints.add(breakpointType);
        }
    }

    public registerDefaultBreakpointTypes(breakpointTypeIds: string[]): void {
        this.defaultParameterizedBreakpointTypes.clear();
        this._enabledStandaloneBreakpoints.clear();

        for (const breakpointTypeId of breakpointTypeIds) {
            let breakpointType: LRP.BreakpointType | undefined = this._availableStandaloneBreakpointTypes.get(breakpointTypeId);

            if (breakpointType !== undefined) {
                this._enabledStandaloneBreakpoints.add(breakpointType);
                continue;
            }

            breakpointType = this.findParameterizedBreakpointType(breakpointTypeId);
            if (breakpointType !== undefined) this.defaultParameterizedBreakpointTypes.add(breakpointType);
        }
    }

    /** cDAP-compatible representation of available breakpoint types. */
    public get availableBreakpointTypes(): DAPExtension.BreakpointType[] {
        const availableBreakpointTypes: LRP.BreakpointType[] = Array.from(this._availableStandaloneBreakpointTypes.values());

        for (const parameterizedBreakpointTypes of this._availableParameterizedBreakpointTypes.values()) {
            availableBreakpointTypes.push(...parameterizedBreakpointTypes);
        }

        return availableBreakpointTypes.map(breakpointType => {
            const res: DAPExtension.BreakpointType = {
                name: breakpointType.name,
                id: breakpointType.id,
                description: breakpointType.description
            };

            if (breakpointType.parameters.length == 0) return res;
            if (breakpointType.parameters[0].type == 'primitive') throw new Error('Object breakpoint parameter expected.');

            res.targetElementType = breakpointType.parameters[0].objectType;
            return res;
        });
    }

    public get enabledStandaloneBreakpointTypes(): LRP.BreakpointType[] {
        return Array.from(this._enabledStandaloneBreakpoints);
    }

    public get domainSpecificBreakpoints(): DAPExtension.DomainSpecificBreakpoint[] {
        return Array.from(this._domainSpecificBreakpoints.values()).map(b => ({
            sourceBreakpointId: b.id,
            enabledBreakpointTypeIds: b.enabledBreakpointTypes.map(bt => bt.id),
            targetElementTypes: b.targetElement.types
        }));
    }

    private retrieveDomainSpecificBreakpointFromSourceBreakpoint(sourceBreakpoint: DebugProtocol.SourceBreakpoint, previousDomainSpecificBreakpoints: Map<number, DomainSpecificBreakpoint>): DomainSpecificBreakpoint | undefined {
        return Array.from(previousDomainSpecificBreakpoints.values()).find(b => b.sourceBreakpoint.line === sourceBreakpoint.line && b.sourceBreakpoint.column === sourceBreakpoint.column);
    }

    private hasPossibleBreakpointType(element: LRP.ModelElement): boolean {
        for (const type of element.types) {
            if (this._availableParameterizedBreakpointTypes.has(type)) return true;
        }

        return false;
    }

    private findParameterizedBreakpointType(breakpointTypeId: string): LRP.BreakpointType | undefined {
        for (const parameterizedBreakpointTypes of this._availableParameterizedBreakpointTypes.values()) {
            const matchingBreakpointType: LRP.BreakpointType | undefined = Array.from(parameterizedBreakpointTypes).find(bt => bt.id === breakpointTypeId);
            if (matchingBreakpointType !== undefined) return matchingBreakpointType;
        }

        return undefined;
    }

    private findDefaultEnabledBreakpointTypes(element: LRP.ModelElement): LRP.BreakpointType[] {
        const res: LRP.BreakpointType[] = [];

        for (const type of element.types) {
            const breakpointTypes: Set<LRP.BreakpointType> | undefined = this._availableParameterizedBreakpointTypes.get(type);
            if (breakpointTypes === undefined) continue;

            for (const breakpointType of breakpointTypes) {
                if (this.defaultParameterizedBreakpointTypes.has(breakpointType)) res.push(breakpointType);
            }
        }

        return res;
    }
}

/**
 * Contains information about an activated breakpoint.
 */
export interface ActivatedBreakpoint {
    /** Message to be displayed to the user. */
    message: string;
}

/**
 * Allows quick retrieval of model elements.
 */
class ASTElementRegistry {
    /** Map of IDs to their associated AST element. */
    private elements: Map<string, LRP.ModelElement>;

    /** Map of AST element IDS to the ID of their parent element. */
    private parents: Map<string, string>;

    /** Map of lines to the AST elements they contain. */
    private locations: Map<number, LRP.ModelElement[]>;

    constructor(astRoot: LRP.ModelElement) {
        this.elements = new Map();
        this.parents = new Map();
        this.locations = new Map();
        this.registerElement(astRoot);
    }

    /**
     * Retrieves the ID of the model element containing a specific model element.
     * 
     * @param childId ID of the child model element.
     * @returns The ID of the parent model element.
     */
    public getParent(childId: string): string | undefined {
        return this.parents.get(childId);
    }

    /**
     * Retrieves a model element from its ID.
     * 
     * @param elemenId ID of the model element to retrieve.
     * @returns The model element.
     */
    public getElement(elemenId: string): LRP.ModelElement | undefined {
        return this.elements.get(elemenId);
    }

    /**
     * Retrieves a model element at a specific position in a textual source file.
     * 
     * @param line Line of the element in the source file.
     * @param column Column of the element in the source file.
     * @returns The model element at the given position, or undefined if there is none. 
     */
    public getElementFromPosition(line: number, column: number): LRP.ModelElement | undefined {
        for (let i = line; i >= 0; i--) {
            const lineElements: LRP.ModelElement[] | undefined = this.locations.get(i);
            if (!lineElements) continue;

            const elem: LRP.ModelElement | undefined = lineElements.find(elem => this.isPositionContained(elem, line, column));
            if (elem) return elem;
        }

        return undefined;
    }

    /**
     * Register a new model element from the AST.
     * 
     * @param element Element to register.
     */
    private registerElement(element: LRP.ModelElement): void {
        this.elements.set(element.id, element);

        if (element.location) {
            if (!this.locations.has(element.location.line)) this.locations.set(element.location.line, []);

            this.locations.get(element.location.line)?.push(element);
        }

        for (const child of Object.values(element.children)) {
            if (!Array.isArray(child)) {
                this.parents.set(child.id, element.id);
                this.registerElement(child);
            } else {
                for (const subelement of child) {
                    this.parents.set(subelement.id, element.id);
                    this.registerElement(subelement);
                }
            }
        }
    }

    /**
     * Checks whether a position is contained in the location of a model element.
     * 
     * @param element Model element containing the location against which the position will be checked.
     * @param line Line of the position.
     * @param column Column of the position.
     * @returns True if the position is contained, false otherwise.
     */
    private isPositionContained(element: LRP.ModelElement, line: number, column: number): boolean {
        if (element.location!.line == line)
            return element.location!.endLine == line ? element.location!.column <= column && element.location!.endColumn >= column : element.location!.column <= column;

        if (element.location!.endLine == line)
            return element.location!.endColumn >= column;

        return element.location!.line <= line && element.location!.endLine >= line;
    }
}

type DomainSpecificBreakpoint = {
    id: number;
    sourceBreakpoint: DebugProtocol.SourceBreakpoint;
    enabledBreakpointTypes: LRP.BreakpointType[];
    targetElement: LRP.ModelElement;
}