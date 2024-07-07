import { InvalidatedEvent } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import * as DAPExtension from "./DAPExtension";
import { CustomDebugRuntime } from "./customDebugRuntime";
import * as LRP from "./lrp";

// TODO: switch type checking methods to instanceof?
export class CustomRequestHandler {

    constructor(private runtime: CustomDebugRuntime) { }

    public handle(command: string, response: DebugProtocol.Response, args: any): CustomRequestResult {
        switch (command) {
            case 'getBreakpointTypes':
                return this.getBreakpointTypes(response, args);

            case 'setDomainSpecificBreakpoints':
                return this.setDomainSpecificBreakpoints(response, args);

            case 'getAvailableSteps':
                return this.getAvailableSteps(response, args);

            case 'selectStep':
                return this.selectStep(response, args);

            case 'getModelElementsReferences':
                return this.getModelElementsReferences(response, args);

            case 'getModelElementReferenceFromSource':
                return this.getModelElementReferenceFromSource(response, args);

            default:
                return {
                    status: "error",
                    error: {
                        id: 100, format: '{_exception}', variables: {
                            _exception: `Unknwon custom method ${command}.`
                        }
                    }
                }
        }
    }

    private getBreakpointTypes(response: DebugProtocol.Response, args: any): CustomRequestResult {
        if (!this.isGetBreakpointTypesArguments(args)) return this.createMalformedArgumentsError('getBreakpointTypes', args);

        const res: DAPExtension.GetBreakpointTypesResponse = {
            breakpointTypes: this.runtime.breakpointManager.availableBreakpointTypes
        };

        response.body = res;
        return { status: "success", response: response };
    }

    private setDomainSpecificBreakpoints(response: DebugProtocol.Response, args: any): CustomRequestResult {
        if (!this.isSetDomainSpecificBreakpointsArguments(args)) return this.createMalformedArgumentsError('setDomainSpecificBreakpoints', args);



        const res: DAPExtension.SetDomainSpecificBreakpointsResponse = {
            breakpoints: this.runtime.breakpointManager.setDomainSpecificBreakpoints(args.breakpoints).map(b => ({ verified: b }))
        };

        response.body = res;
        return { status: "success", response: response };
    }

    private getAvailableSteps(response: DebugProtocol.Response, args: any): CustomRequestResult {
        if (!this.isGetAvailableStepsArguments(args)) return this.createMalformedArgumentsError('getAvailableSteps', args);

        const res: DAPExtension.GetAvailableStepsResponse = {
            availableSteps: this.runtime.getAvailableSteps()
        };

        response.body = res;
        return { status: "success", response: response };
    }

    private selectStep(response: DebugProtocol.Response, args: any): CustomRequestResult {
        if (!this.isSelectStepArguments(args)) return this.createMalformedArgumentsError('selectStep', args);

        this.runtime.selectStep(args.stepId);
        return { status: "success", response: response, event: new InvalidatedEvent(['stacks']) };
    }

    private getModelElementsReferences(response: DebugProtocol.Response, args: any): CustomRequestResult {
        if (!this.isGetModelElementsReferencesArguments(args)) return this.createMalformedArgumentsError('getModelElementsReferences', args);

        const res: DAPExtension.GetModelElementsReferencesResponse = {
            elements: this.runtime.getModelElementsFromType(args.type).map(e => ({ id: e.id, types: e.types, label: e.label ?? e.id }))
        }

        response.body = res;

        return { status: "success", response: response };
    }

    private getModelElementReferenceFromSource(response: DebugProtocol.Response, args: any): CustomRequestResult {
        if (!this.isGetModelElementReferenceFromSourceArguments(args)) return this.createMalformedArgumentsError('getModelElementReferenceFromSource', args);

        const element: LRP.ModelElement | undefined = this.runtime.getModelElementFromSource(args.line, args.column);
        const res: DAPExtension.GetModelElementReferenceFromSourceResponse = {
            element: element !== undefined ? { id: element.id, types: element.types, label: element.label ?? element.id } : undefined
        }

        response.body = res;

        return { status: "success", response: response };
    }

    /**
     * Checks whether an object is an instance of {@link DAPExtension.GetBreakpointTypesArguments}.
     * 
     * @param args Object to check.
     * @returns True if the object is an instance of {@link DAPExtension.GetBreakpointTypesArguments}, false otherwise.
     */
    private isGetBreakpointTypesArguments(args: any): args is DAPExtension.GetBreakpointTypesArguments {
        return Object.entries(args).length == 1 && this.isArguments(args);
    }

    /**
     * Checks whether an object is an instance of {@link DAPExtension.SetDomainSpecificBreakpointsArguments}.
     * 
     * @param args Object to check.
     * @returns True if the object is an instance of {@link DAPExtension.SetDomainSpecificBreakpointsArguments}, false otherwise.
     */
    private isSetDomainSpecificBreakpointsArguments(args: any): args is DAPExtension.SetDomainSpecificBreakpointsArguments {
        const properties: string[] = ['sourceFile', 'breakpoints'];
        return Object.entries(args).length == 2 && this.hasProperties(args, properties);
    }

    /**
     * Checks whether an object is an instance of {@link DAPExtension.GetAvailableStepsArguments}.
     * 
     * @param args Object to check.
     * @returns True if the object is an instance of {@link DAPExtension.GetAvailableStepsArguments}, false otherwise.
     */
    private isGetAvailableStepsArguments(args: any): args is DAPExtension.GetAvailableStepsArguments {
        return Object.entries(args).length == 1 && this.isArguments(args);
    }

    /**
     * Checks whether an object is an instance of {@link DAPExtension.SelectStepArguments}.
     * 
     * @param args Object to check.
     * @returns True if the object is an instance of {@link DAPExtension.SelectStepArguments}, false otherwise.
     */
    private isSelectStepArguments(args: any): args is DAPExtension.SelectStepArguments {
        const properties: string[] = ['sourceFile', 'stepId'];
        return Object.entries(args).length == 2 && this.hasProperties(args, properties);
    }

    /**
     * Checks whether an object is an instance of {@link DAPExtension.GetModelElementsReferencesArguments}.
     * 
     * @param args Object to check.
     * @returns True if the object is an instance of {@link DAPExtension.GetModelElementsReferencesArguments}, false otherwise.
     */
    private isGetModelElementsReferencesArguments(args: any): args is DAPExtension.GetModelElementsReferencesArguments {
        const properties: string[] = ['sourceFile', 'type'];
        return Object.entries(args).length == 2 && this.hasProperties(args, properties);
    }

    /**
     * Checks whether an object is an instance of {@link DAPExtension.GetModelElementReferenceFromSourceArguments}.
     * 
     * @param args Object to check.
     * @returns True if the object is an instance of {@link DAPExtension.GetModelElementReferenceFromSourceArguments}, false otherwise.
     */
    private isGetModelElementReferenceFromSourceArguments(args: any): args is DAPExtension.GetModelElementReferenceFromSourceArguments {
        const properties: string[] = ['sourceFile', 'line', 'column'];
        return Object.entries(args).length == 3 && this.hasProperties(args, properties);
    }

    /**
     * Checks whether an object is a valid request argument.
     * 
     * @param args Object to check.
     * @returns True if the object is a valid request argument, false otherwise.
     */
    private isArguments(args: any): boolean {
        const properties: string[] = ['sourceFile'];
        return this.hasProperties(args, properties);
    }

    private hasProperties(object: any, properties: string[]): boolean {
        for (const property of properties) {
            if (!(property in object)) return false;
        }

        return true;
    }

    private createMalformedArgumentsError(command: string, args: any): CustomRequestError {
        return {
            status: "error",
            error: {
                id: 100, format: '{_exception}\n{_args}', variables: {
                    _exception: `Malformed arguments for custom method ${command}.`,
                    _args: `Received arguments:\n ${JSON.stringify(args, null, 2)}`
                }
            }
        }
    }
}

export type CustomRequestResult = CustomRequestSuccess | CustomRequestError;

export type CustomRequestSuccess = {
    status: 'success';
    response?: DebugProtocol.Response;
    event?: DebugProtocol.Event;
}

export type CustomRequestError = {
    status: 'error';
    error: DebugProtocol.Message;
}