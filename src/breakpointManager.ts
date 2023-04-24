
import { DebugProtocol } from "@vscode/debugprotocol";
import { BreakpointType, CheckBreakpointResponse, Location, ModelElement } from "./lrp";
import { LanguageRuntimeProxy } from "./lrProxy";

import * as DAPExtension from "./DAPExtension";

export class CDAPBreakpointManager {

    private astElementRegistry: ASTElementRegistry;

    readonly _availableBreakpointTypes: BreakpointType[];
    private enabledBreakpointTypes: Map<string, BreakpointType[]>;
    private elementsWithBreakpoints: Set<ModelElement>;
    private activatedBreakpoints: Set<ModelElement>;

    private lineOffset: number;
    private columnOffset: number;

    constructor(private sourceFile: string, private lrProxy: LanguageRuntimeProxy, astRoot: ModelElement, availableBreakpointTypes: BreakpointType[]) {
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
    public async checkBreakpoints(): Promise<ActivatedBreakpoint | undefined> {
        for (const element of this.elementsWithBreakpoints) {
            if (this.activatedBreakpoints.has(element)) continue;

            const breakpointTypes: BreakpointType[] | undefined = this.enabledBreakpointTypes.get(element.type);
            if (!breakpointTypes) continue;

            for (const breakpointType of breakpointTypes) {
                const checkBreakpointResponse: CheckBreakpointResponse = await this.lrProxy.checkBreakpoint({
                    sourceFile: this.sourceFile,
                    typeId: breakpointType.id,
                    elementId: element.id
                });

                if (checkBreakpointResponse.isActivated) {
                    this.activatedBreakpoints.add(element);
                    return {
                        message: checkBreakpointResponse.message!,
                        location: {

                            line: element.location!.line + this.lineOffset,
                            endLine: element.location!.endLine + this.lineOffset,
                            column: element.location!.column + this.columnOffset,
                            endColumn: element.location!.endColumn + this.columnOffset + 1
                        }
                    };
                }
            }
        }

        this.activatedBreakpoints.clear();
        return undefined;
    }


    public setBreakpoints(breakpoints: DebugProtocol.SourceBreakpoint[]): DebugProtocol.Breakpoint[] {
        this.elementsWithBreakpoints.clear();
        const setBreakpoints: DebugProtocol.Breakpoint[] = [];

        for (const newBreakpoint of breakpoints) {
            if (!newBreakpoint.column) {
                setBreakpoints.push({ verified: false });
                continue;
            }

            const element: ModelElement | undefined = this.astElementRegistry.getElementFromPosition(newBreakpoint.line + this.lineOffset, newBreakpoint.column + this.columnOffset);
            if (!element) {
                setBreakpoints.push({ verified: false });
                continue;
            }

            if (!element.location) {
                setBreakpoints.push({ verified: false });
                continue;
            }

            const breakpointTypes: BreakpointType[] | undefined = this.enabledBreakpointTypes.get(element.type);
            if (!breakpointTypes) {
                setBreakpoints.push({ verified: false });
                continue;
            }

            if (this.elementsWithBreakpoints.has(element)) {
                setBreakpoints.push({ verified: false });
                continue;
            }

            this.elementsWithBreakpoints.add(element);
            setBreakpoints.push({
                verified: true
            });
        }

        for (const activatedBreakpoint of this.activatedBreakpoints) {
            if (!this.elementsWithBreakpoints.has(activatedBreakpoint)) this.activatedBreakpoints.delete(activatedBreakpoint);
        }
        return setBreakpoints;
    }

    public setFormat(linesStartAt1: boolean, columnsStartAt1: boolean): void {
        this.lineOffset = -!!(!linesStartAt1);
        this.columnOffset = -!!(!columnsStartAt1);
    }

    public enableBreakpointTypes(breakpointTypeIds: string[]): void {
        this.enabledBreakpointTypes.clear();

        for (const breakpointTypeId of breakpointTypeIds) {
            const breakpointType: BreakpointType | undefined = this._availableBreakpointTypes.find(breakpointType => breakpointType.id == breakpointTypeId);

            if (!breakpointType) continue;

            const targetType: string = breakpointType.parameters[0].objectType!;
            if (!this.enabledBreakpointTypes.has(targetType)) this.enabledBreakpointTypes.set(targetType, []);
            this.enabledBreakpointTypes.get(targetType)!.push(breakpointType);
        }
    }

    public get availableBreakpointTypes(): DAPExtension.BreakpointType[] {
        return this._availableBreakpointTypes.map(breakpointType => {
            return {
                name: breakpointType.name,
                id: breakpointType.id,
                targetElementTypeId: breakpointType.parameters[0].objectType!,
                description: breakpointType.description,
                isEnabled: this.isBreakpointTypeEnabled(breakpointType)
            }
        });
    }

    private isBreakpointTypeEnabled(breakpointType: BreakpointType): boolean {
        const enabledBreakpointTypesForTargetType: BreakpointType[] | undefined = this.enabledBreakpointTypes.get(breakpointType.parameters[0].objectType!);
        return enabledBreakpointTypesForTargetType !== undefined && enabledBreakpointTypesForTargetType.includes(breakpointType);
    }
}

export interface ActivatedBreakpoint {
    message: string;
    location: Location;
}

/**
 * Allows the quick retrieval of model elements.
 */
export class ASTElementRegistry {
    private elements: Map<string, ModelElement>;
    private parents: Map<string, string>; // child -> parent
    private locations: Map<number, ModelElement[]>; // line -> element[]

    constructor(astRoot: ModelElement) {
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
    public getElement(elemenId: string): ModelElement | undefined {
        return this.elements.get(elemenId);
    }

    public getElementFromPosition(line: number, column: number): ModelElement | undefined {
        const lineElements: ModelElement[] | undefined = this.locations.get(line);
        if (lineElements === undefined) return undefined;

        return lineElements.find(elem => this.isPositionContained(elem, line, column));
    }

    private registerElement(element: ModelElement) {
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

    private isPositionContained(element: ModelElement, line: number, column: number): boolean {
        return element.location!.line <= line && element.location!.endLine >= line && element.location!.column <= column && element.location!.endColumn >= column;
    }
}