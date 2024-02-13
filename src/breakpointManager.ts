
import { Breakpoint } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import * as DAPExtension from "./DAPExtension";
import { LanguageRuntimeProxy } from "./lrProxy";
import * as LRP from "./lrp";

/**
 * Manages breakpoints set through cDAP.
 */
export class CDAPBreakpointManager {

    private astElementRegistry: ASTElementRegistry;

    readonly _availableBreakpointTypes: LRP.BreakpointType[];
    private enabledBreakpointTypes: Map<string, LRP.BreakpointType[]>;
    private elementsWithBreakpoints: Set<LRP.ModelElement>;
    private activatedBreakpoints: Set<LRP.ModelElement>;

    private lineOffset: number;
    private columnOffset: number;

    constructor(private sourceFile: string, private lrProxy: LanguageRuntimeProxy, astRoot: LRP.ModelElement, availableBreakpointTypes: LRP.BreakpointType[]) {
        this.elementsWithBreakpoints = new Set();
        this.astElementRegistry = new ASTElementRegistry(astRoot);
        this.activatedBreakpoints = new Set();

        this.lineOffset = 0;
        this.columnOffset = 0;

        this._availableBreakpointTypes = [];

        this.enabledBreakpointTypes = new Map();
        for (const breakpointType of availableBreakpointTypes) {
            if (breakpointType.parameters.length != 1) continue;
            const targetElementType: string | undefined = breakpointType.parameters[0].objectType;
            if (targetElementType === undefined) continue;

            if (!this.enabledBreakpointTypes.has(targetElementType)) this.enabledBreakpointTypes.set(targetElementType, []);
            this._availableBreakpointTypes.push(breakpointType);
        }
    }

    /**
     * Checks if any breakpoint is activated based on the current state of the program and information on the next step
     * executed by the language.
     * 
     * @returns The breakpoint that activated first, or undefined if no breakpoint was activated.
     */
    public async checkBreakpoints(stepId?: string): Promise<ActivatedBreakpoint | undefined> {
        for (const element of this.elementsWithBreakpoints) {
            if (this.activatedBreakpoints.has(element)) continue;

            const breakpointTypes: LRP.BreakpointType[] | undefined = this.enabledBreakpointTypes.get(element.type);
            if (!breakpointTypes) continue;

            for (const breakpointType of breakpointTypes) {
                const args: LRP.CheckBreakpointArguments = {
                    sourceFile: this.sourceFile,
                    typeId: breakpointType.id,
                    elementId: element.id
                };

                if (stepId) args.stepId = stepId;

                const checkBreakpointResponse: LRP.CheckBreakpointResponse = await this.lrProxy.checkBreakpoint(args);

                if (checkBreakpointResponse.isActivated) {
                    this.activatedBreakpoints.add(element);
                    return {
                        message: checkBreakpointResponse.message!
                    };
                }
            }
        }

        this.activatedBreakpoints.clear();
        return undefined;
    }

    /**
     * Sets multiple breakpoints.
     * Previsouly set breakpoints are removed.
     * 
     * @param breakpoints The breakpoints to be set.
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

            const hasPossibleBreakpointType: boolean = this._availableBreakpointTypes.find(breakpointType => breakpointType.parameters[0].objectType! === element.type) !== undefined;
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

        for (const activatedBreakpoint of this.activatedBreakpoints) {
            if (!this.elementsWithBreakpoints.has(activatedBreakpoint)) this.activatedBreakpoints.delete(activatedBreakpoint);
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
     * Previsouly enabled breakpoint types are disabled.
     * 
     * @param breakpointTypeIds 
     */
    public enableBreakpointTypes(breakpointTypeIds: string[]): void {
        this.enabledBreakpointTypes.clear();

        for (const breakpointTypeId of breakpointTypeIds) {
            const breakpointType: LRP.BreakpointType | undefined = this._availableBreakpointTypes.find(breakpointType => breakpointType.id == breakpointTypeId);

            if (!breakpointType) continue;

            const targetType: string = breakpointType.parameters[0].objectType!;
            if (!this.enabledBreakpointTypes.has(targetType)) this.enabledBreakpointTypes.set(targetType, []);
            this.enabledBreakpointTypes.get(targetType)!.push(breakpointType);
        }
    }

    /**
     * Fetches the currently available breakpoint types.
     */
    public get availableBreakpointTypes(): DAPExtension.BreakpointType[] {
        return this._availableBreakpointTypes
            .reduce<LRP.BreakpointType[]>((acc, breakpointType) => breakpointType.parameters.length == 0 || (breakpointType.parameters.length == 1 && breakpointType.parameters[0].objectType !== undefined) ? [...acc, breakpointType] : acc, [])
            .map(breakpointType => {
                const res: DAPExtension.BreakpointType = {
                    name: breakpointType.name,
                    id: breakpointType.id,
                    description: breakpointType.description,
                    isEnabled: this.isBreakpointTypeEnabled(breakpointType)
                };

                if (breakpointType.parameters.length == 0) return res;

                res.targetElementTypeId = breakpointType.parameters[0].objectType!;
                return res;
        });
    }

    /**
     * Checks whether a breakpoint type is currently enabled.
     * 
     * @param breakpointType The breakpoint type to check for.
     * @returns True if the breakpoint type is currently enabled, false otherwise.
     */
    private isBreakpointTypeEnabled(breakpointType: LRP.BreakpointType): boolean {
        const enabledBreakpointTypesForTargetType: LRP.BreakpointType[] | undefined = this.enabledBreakpointTypes.get(breakpointType.parameters[0].objectType!);
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
 * Allows the quick retrieval of model elements.
 */
export class ASTElementRegistry {
    private elements: Map<string, LRP.ModelElement>;
    private parents: Map<string, string>; // child -> parent
    private locations: Map<number, LRP.ModelElement[]>; // line -> element[]

    constructor(astRoot: LRP.ModelElement) {
        this.elements = new Map();
        this.parents = new Map();
        this.locations = new Map();
        this.registerElement(astRoot);
    }

    /**
     * Retrieves the ID of the model element containing a specific model element.
     * 
     * @param childId The ID of the child model element.
     * @returns The ID of the parent model element.
     */
    public getParent(childId: string): string | undefined {
        return this.parents.get(childId);
    }

    /**
     * Retrieves a model element from its ID.
     * 
     * @param elemenId The ID of the model element to retrieve.
     * @returns The model element.
     */
    public getElement(elemenId: string): LRP.ModelElement | undefined {
        return this.elements.get(elemenId);
    }

    /**
     * Retrieves a model element at a specific position in a textual source file.
     * 
     * @param line The line of the element in the source file.
     * @param column The column of the element in the source file.
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
     * @param element The element to register.
     */
    private registerElement(element: LRP.ModelElement) {
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
     * @param element The model element conatining the location against which the position will be checked.
     * @param line The line of the position.
     * @param column THe column of the position.
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