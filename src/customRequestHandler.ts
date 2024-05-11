import { InvalidatedEvent } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import * as DAPExtension from "./DAPExtension";
import { CustomDebugRuntime } from "./customDebugRuntime";

export class CustomRequestHandler {

    constructor(private runtime: CustomDebugRuntime) { }

    public handle(command: string, response: DebugProtocol.Response, args: any): CustomRequestResult {
        switch (command) {
            case 'getBreakpointTypes':
                return this.getBreakpointTypes(response, args);

            case 'getEnabledStandaloneBreakpointTypes':
                return this.getEnabledStandaloneBreakpointTypes(response, args);

            case 'enableStandaloneBreakpointTypes':
                return this.enableStandaloneBreakpointTypes(response, args);

            case 'getDomainSpecificBreakpoints':
                return this.getDomainSpecificBreakpoints(response, args);

            case 'setDomainSpecificBreakpoints':
                return this.setDomainSpecificBreakpoints(response, args);

            case 'getAvailableSteps':
                return this.getAvailableSteps(response, args);

            case 'enableStep':
                return this.enableStep(response, args);

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

    private getEnabledStandaloneBreakpointTypes(response: DebugProtocol.Response, args: any): CustomRequestResult {
        if (!this.isGetEnabledStandaloneBreakpointTypesArguments(args)) return this.createMalformedArgumentsError('getEnabledStandaloneBreakpointTypes', args);

        const res: DAPExtension.GetEnabledStandaloneBreakpointTypesResponse = {
            enabledStandaloneBreakpointTypesIds: this.runtime.breakpointManager.enabledStandaloneBreakpointTypes.map(bt => bt.id)
        }

        response.body = res;
        return { status: "success", response: response };
    };

    private enableStandaloneBreakpointTypes(response: DebugProtocol.Response, args: any): CustomRequestResult {
        if (!this.isEnableStandaloneBreakpointTypesArguments(args)) return this.createMalformedArgumentsError('enableStandaloneBreakpointTypes', args);

        this.runtime.breakpointManager.enableStandaloneBreakpointTypes(args.breakpointTypeIds);

        return { status: 'success', response: response };
    }

    private getDomainSpecificBreakpoints(response: DebugProtocol.Response, args: any): CustomRequestResult {
        if (!this.isGetDomainSpecificBreakpointsArguments(args)) return this.createMalformedArgumentsError('getDomainSpecificBreakpoints', args);

        const res: DAPExtension.GetDomainSpecificBreakpointsResponse = { breakpoints: this.runtime.breakpointManager.domainSpecificBreakpoints };

        response.body = res;
        return { status: "success", response: response };
    }

    private setDomainSpecificBreakpoints(response: DebugProtocol.Response, args: any): CustomRequestResult {
        if (!this.isSetDomainSpecificBreakpointsArguments(args)) return this.createMalformedArgumentsError('setDomainSpecificBreakpoints', args);

        this.runtime.breakpointManager.setDomainSpecificBreakpoints(args.breakpoints);

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

    private enableStep(response: DebugProtocol.Response, args: any): CustomRequestResult {
        if (!this.isEnableStepArguments(args)) return this.createMalformedArgumentsError('enableStep', args);

        this.runtime.enableStep(args.stepId);
        return { status: "success", event: new InvalidatedEvent(['stacks']) };
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
     * Checks whether an object is an instance of {@link DAPExtension.GetEnabledStandaloneBreakpointTypesArguments}.
     * 
     * @param args Object to check.
     * @returns True if the object is an instance of {@link DAPExtension.GetEnabledStandaloneBreakpointTypesArguments}, false otherwise.
     */
    private isGetEnabledStandaloneBreakpointTypesArguments(args: any): args is DAPExtension.GetEnabledStandaloneBreakpointTypesArguments {
        return Object.entries(args).length == 1 && this.isArguments(args);
    }

    /**
     * Checks whether an object is an instance of {@link DAPExtension.EnableStandaloneBreakpointTypesArguments}.
     * 
     * @param args Object to check.
     * @returns True if the object is an instance of {@link DAPExtension.EnableStandaloneBreakpointTypesArguments}, false otherwise.
     */
    private isEnableStandaloneBreakpointTypesArguments(args: any): args is DAPExtension.EnableStandaloneBreakpointTypesArguments {
        const properties: string[] = ['sourceFile', 'breakpointTypeIds'];
        return Object.entries(args).length == 2 && this.hasProperties(args, properties);
    }

    /**
     * Checks whether an object is an instance of {@link DAPExtension.GetDomainSpecificBreakpointsArguments}.
     * 
     * @param args Object to check.
     * @returns True if the object is an instance of {@link DAPExtension.GetDomainSpecificBreakpointsArguments}, false otherwise.
     */
    private isGetDomainSpecificBreakpointsArguments(args: any): args is DAPExtension.GetDomainSpecificBreakpointsArguments {
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
     * Checks whether an object is an instance of {@link DAPExtension.EnableStepArguments}.
     * 
     * @param args Object to check.
     * @returns True if the object is an instance of {@link DAPExtension.EnableStepArguments}, false otherwise.
     */
    private isEnableStepArguments(args: any): args is DAPExtension.EnableStepArguments {
        const properties: string[] = ['sourceFile', 'stepId'];
        return Object.entries(args).length == 2 && this.hasProperties(args, properties);
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