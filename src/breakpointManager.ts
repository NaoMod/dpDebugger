
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

    /** Available breakpoint types defined by the language runtime. */
    readonly _availableBreakpointTypes: LRP.BreakpointType[];

    /** Map from AST elements' types to the currently enabled breakpoints targeting this type of AST element. */
    private enabledElementBreakpointTypes: Map<string, LRP.BreakpointType[]>;

    /** AST elements with at least one breakpoint targeting them. */
    private elementsWithBreakpoints: Set<LRP.ModelElement>;

    /** Currently enabled breakpoints not targeting any AST element. */
    private enabledStandaloneBreakpointTypes: Set<LRP.BreakpointType>;

    /** Previously activated breakpoints targeting an AST element. */
    private activatedElementBreakpoints: Set<LRP.ModelElement>;

    /** Previously activated breakpoints not targeting any AST element. */
    private activatedStandaloneBreakpoints: Set<LRP.BreakpointType>;

    /** Line offset of the IDE. */
    private lineOffset: number;

    /** Column offset of the IDE. */
    private columnOffset: number;

    constructor(private sourceFile: string, private lrProxy: LanguageRuntimeProxy, astRoot: LRP.ModelElement, availableBreakpointTypes: LRP.BreakpointType[]) {
        this.elementsWithBreakpoints = new Set();
        this.astElementRegistry = new ASTElementRegistry(astRoot);
        this.activatedElementBreakpoints = new Set();
        this.activatedStandaloneBreakpoints = new Set();

        this.lineOffset = 0;
        this.columnOffset = 0;

        this._availableBreakpointTypes = [];

        this.enabledElementBreakpointTypes = new Map();
        this.enabledStandaloneBreakpointTypes = new Set();

        for (const breakpointType of availableBreakpointTypes) {
            if (breakpointType.parameters.length == 0) {
                this._availableBreakpointTypes.push(breakpointType);
                continue;
            }

            if (breakpointType.parameters.length > 1 || breakpointType.parameters[0].type == 'primitive' || breakpointType.parameters[0].isMultivalued) continue;

            const targetElementType: string = breakpointType.parameters[0].objectType;

            if (!this.enabledElementBreakpointTypes.has(targetElementType)) this.enabledElementBreakpointTypes.set(targetElementType, []);
            this._availableBreakpointTypes.push(breakpointType);
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
        for (const enabledStandaloneBreakpointType of this.enabledStandaloneBreakpointTypes) {
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

        for (const element of this.elementsWithBreakpoints) {
            if (this.activatedElementBreakpoints.has(element)) continue;

            const breakpointTypes: LRP.BreakpointType[] = element.types.reduce((acc, type) => {
                const b: LRP.BreakpointType[] | undefined = this.enabledElementBreakpointTypes.get(type);
                return b !== undefined ? [...acc, ...b] : acc;
            }, []);

            if (breakpointTypes.length == 0) continue;

            for (const breakpointType of breakpointTypes) {
                const args: LRP.CheckBreakpointArguments = {
                    sourceFile: this.sourceFile,
                    typeId: breakpointType.id,
                    bindings: {
                        [breakpointType.parameters[0].name]: element.id
                    },
                    stepId: stepId
                };

                const checkBreakpointResponse: LRP.CheckBreakpointResponse = await this.lrProxy.checkBreakpoint(args);

                if (checkBreakpointResponse.isActivated) {
                    this.activatedElementBreakpoints.add(element);
                    return {
                        message: checkBreakpointResponse.message
                    };
                }
            }
        }

        this.activatedStandaloneBreakpoints.clear();
        this.activatedElementBreakpoints.clear();
        return undefined;
    }

    /**
     * Sets multiple breakpoints.
     * Previously set breakpoints are removed.
     * 
     * @param breakpoints Source breakpoints to be set.
     * @returns Information about the result of setting each breakpoint.
     */
    public setBreakpoints(breakpoints: DebugProtocol.SourceBreakpoint[]): DebugProtocol.Breakpoint[] {
        this.elementsWithBreakpoints.clear();
        const setBreakpoints: DebugProtocol.Breakpoint[] = [];

        for (const newBreakpoint of breakpoints) {
            if (!newBreakpoint.column) {
                setBreakpoints.push(new Breakpoint(false));
                continue;
            }

            const element: LRP.ModelElement | undefined = this.astElementRegistry.getElementFromPosition(newBreakpoint.line + this.lineOffset, newBreakpoint.column + this.columnOffset);
            if (!element) {
                setBreakpoints.push(new Breakpoint(false));
                continue;
            }

            if (!element.location) {
                setBreakpoints.push(new Breakpoint(false));
                continue;
            }

            const hasPossibleBreakpointType: boolean = this._availableBreakpointTypes.find(breakpointType => breakpointType.parameters.length == 1 && breakpointType.parameters[0].type === 'object' && element.types.includes(breakpointType.parameters[0].objectType)) !== undefined;
            if (!hasPossibleBreakpointType) {
                setBreakpoints.push(new Breakpoint(false));
                continue;
            }

            if (this.elementsWithBreakpoints.has(element)) {
                setBreakpoints.push(new Breakpoint(false));
                continue;
            }

            this.elementsWithBreakpoints.add(element);
            setBreakpoints.push(new Breakpoint(true));
        }

        for (const activatedBreakpoint of this.activatedElementBreakpoints) {
            if (!this.elementsWithBreakpoints.has(activatedBreakpoint)) this.activatedElementBreakpoints.delete(activatedBreakpoint);
        }
        return setBreakpoints;
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

    /**
     * Enables multiple breakpoint types.
     * Previously enabled breakpoint types are disabled.
     * 
     * @param breakpointTypeIds IDS of the breakpoint types to enable.
     */
    public enableBreakpointTypes(breakpointTypeIds: string[]): void {
        this.enabledElementBreakpointTypes.clear();
        this.enabledStandaloneBreakpointTypes.clear();

        for (const breakpointTypeId of breakpointTypeIds) {
            const breakpointType: LRP.BreakpointType | undefined = this._availableBreakpointTypes.find(breakpointType => breakpointType.id == breakpointTypeId);

            if (!breakpointType) continue;

            if (breakpointType.parameters.length == 0) {
                this.enabledStandaloneBreakpointTypes.add(breakpointType);
                continue;
            }

            if (breakpointType.parameters[0].type == 'primitive') throw new Error('Object breakpoint parameter expected.');

            const targetElementType: string = breakpointType.parameters[0].objectType;

            if (!this.enabledElementBreakpointTypes.has(targetElementType)) this.enabledElementBreakpointTypes.set(targetElementType, []);
            this.enabledElementBreakpointTypes.get(targetElementType)!.push(breakpointType);
        }
    }

    /** cDAP-compatible available breakpoint types. */
    public get availableBreakpointTypes(): DAPExtension.BreakpointType[] {
        return this._availableBreakpointTypes.map(breakpointType => {
            const res: DAPExtension.BreakpointType = {
                name: breakpointType.name,
                id: breakpointType.id,
                description: breakpointType.description,
                isEnabled: this.isBreakpointTypeEnabled(breakpointType)
            };

            if (breakpointType.parameters.length == 0) return res;
            if (breakpointType.parameters[0].type == 'primitive') throw new Error('Object breakpoint parameter expected.');

            res.targetElementTypeId = breakpointType.parameters[0].objectType;
            return res;
        });
    }

    /**
     * Checks whether a breakpoint type is currently enabled.
     * 
     * @param breakpointType Breakpoint type to check for.
     * @returns True if the breakpoint type is currently enabled, false otherwise.
     */
    private isBreakpointTypeEnabled(breakpointType: LRP.BreakpointType): boolean {
        if (!this._availableBreakpointTypes.includes(breakpointType)) return false;
        if (breakpointType.parameters.length == 0) return this.enabledStandaloneBreakpointTypes.has(breakpointType);

        if (breakpointType.parameters[0].type == 'primitive') throw new Error('Object breakpoint parameter expected.');

        const enabledBreakpointTypesForTargetType: LRP.BreakpointType[] | undefined = this.enabledElementBreakpointTypes.get(breakpointType.parameters[0].objectType);
        return enabledBreakpointTypesForTargetType !== undefined && enabledBreakpointTypesForTargetType.includes(breakpointType);
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