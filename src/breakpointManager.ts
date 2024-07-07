import { Breakpoint } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import * as DAPExtension from "./DAPExtension";
import { ASTElementLocator } from "./astElementLocator";
import { isValidBreakpoint } from "./breakpointValidity";
import { LanguageRuntimeProxy } from "./lrProxy";
import * as LRP from "./lrp";

/**
 * Manages breakpoints set through cDAP.
 */
export class CDAPBreakpointManager {

    private sourceFile: string;

    private lrProxy: LanguageRuntimeProxy;

    /** Registry of all AST elements. */
    private astElementLocator: ASTElementLocator;

    private _availableBreakpointTypes: Map<string, LRP.BreakpointType>;

    private _domainSpecificBreakpoints: DAPExtension.DomainSpecificBreakpoint[];

    constructor(sourceFile: string, astElementLocator: ASTElementLocator, availableBreakpointTypes: LRP.BreakpointType[], lrProxy: LanguageRuntimeProxy) {
        this.sourceFile = sourceFile;
        this.astElementLocator = astElementLocator;
        this.lrProxy = lrProxy;
        this._domainSpecificBreakpoints = [];
        this._availableBreakpointTypes = new Map();

        for (const breakpointType of availableBreakpointTypes) {
            this._availableBreakpointTypes.set(breakpointType.id, breakpointType);
        }
    }

    /**
     * Checks if any breakpoint is activated based on the current state of the program and information on the next step
     * performed by the language (either composite or atomic).
     * 
     * @param stepId ID of the step on which to check breakpoints.  
     * @returns The breakpoint that activated first, or undefined if no breakpoint was activated.
     */
    public async checkBreakpoints(stepId: string): Promise<ActivatedBreakpoint[]> {
        const activatedBreakpoints: ActivatedBreakpoint[] = [];

        for (const breakpoint of this._domainSpecificBreakpoints) {
            const args: LRP.CheckBreakpointArguments = {
                sourceFile: this.sourceFile,
                typeId: breakpoint.breakpointTypeId,
                entries: breakpoint.entries,
                stepId: stepId
            };

            const checkBreakpointResponse: LRP.CheckBreakpointResponse = await this.lrProxy.checkBreakpoint(args);

            if (checkBreakpointResponse.isActivated) activatedBreakpoints.push({ message: checkBreakpointResponse.message });
        }

        return activatedBreakpoints;
    }

    /**
     * Sets multiple domain-specific breakpoints from source breakpoints.
     * Previously set breakpoints are removed.
     * 
     * @param sourceBreakpoints Source breakpoints to be set.
     * @returns Information about the result of setting each breakpoint.
     */
    public setBreakpoints(sourceBreakpoints: DebugProtocol.SourceBreakpoint[]): DebugProtocol.Breakpoint[] {
        const setBreakpoints: DebugProtocol.Breakpoint[] = [];
        let currentId: number = 0;

        for (const sourceBreakpoint of sourceBreakpoints) {
            if (sourceBreakpoint.column === undefined) {
                setBreakpoints.push(new Breakpoint(false));
                continue;
            }

            const element: LRP.ModelElement | undefined = this.astElementLocator.getElementFromPosition(sourceBreakpoint.line, sourceBreakpoint.column);
            if (element === undefined || element.location === undefined) {
                setBreakpoints.push(new Breakpoint(false));
                continue;
            }

            const hasPossibleBreakpointType: boolean = this.availableBreakpointTypes.some(bt => bt.parameters.length > 0 && bt.parameters[0].type === "element" && element.types.includes(bt.parameters[0].elementType));
            if (!hasPossibleBreakpointType) {
                setBreakpoints.push(new Breakpoint(false));
                continue;
            }

            setBreakpoints.push({ id: currentId, verified: true });
            currentId++;
        }

        return setBreakpoints;
    }

    public setDomainSpecificBreakpoints(breakpoints: DAPExtension.DomainSpecificBreakpoint[]): boolean[] {
        const res: boolean[] = [];
        const newDomainSpecificBreakpoints: DAPExtension.DomainSpecificBreakpoint[] = [];

        for (const breakpoint of breakpoints) {
            const breakpointType: LRP.BreakpointType | undefined = this._availableBreakpointTypes.get(breakpoint.breakpointTypeId);
            if (breakpointType === undefined || !isValidBreakpoint(breakpoint, breakpointType)) {
                res.push(false);
                continue;
            }

            res.push(true);
            newDomainSpecificBreakpoints.push(breakpoint);
        }

        this._domainSpecificBreakpoints = newDomainSpecificBreakpoints;
        return res;
    }

    /** cDAP-compatible representation of available breakpoint types. */
    public get availableBreakpointTypes(): DAPExtension.BreakpointType[] {
        return [...this._availableBreakpointTypes.values()];
    }

    public get domainSpecificBreakpoints(): DAPExtension.DomainSpecificBreakpoint[] {
        return this._domainSpecificBreakpoints;
    }
}

/**
 * Contains information about an activated breakpoint.
 */
export interface ActivatedBreakpoint {
    /** Message to be displayed to the user. */
    message: string;
}