import { Client, RequestParamsLike } from "jayson";
import * as LRP from "./lrp";

/**
 * Proxy for a JSON-RPC server.
 */
class Proxy {
    private client: Client;

    constructor(port: number) {
        this.client = Client.tcp({ port: port });
    }

    /**
     * Sends a JSON-RPC call and returns the result returned by the remote method.
     * 
     * @param method The remote method's name.
     * @param params The remote method's arguments.
     * @returns The result returned by the remote method.
     */
    protected async request(method: string, params: RequestParamsLike): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            this.client.request(method, params, (err, error, result: any) => {
                if (error) throw new Error(error?.message);
                if (err) throw new Error(err?.message);

                resolve(result);
            })
        })
    }

    /**
     * Sends a JSON-RPC call, but doesn't return its result.
     * 
     * @param method The remote method's name.
     * @param args The remote method's arguments.
     * @returns True if the message was emitted, false otherwise.
     */
    protected emit(method: string, args: any[]): boolean {
        return this.client.emit(method, args);
    }
}


/**
 * Proxy for a language runtime implementing LRP.
 */
export class LanguageRuntimeProxy extends Proxy {
    /**
     * Asks the language runtime to parse a program and store its AST.
     * 
     * @param args The arguments of the request.
     * @returns The LRP response to the request.
     */
    public async parse(args: LRP.ParseArguments): Promise<LRP.ParseResponse> {
        return this.request('parse', [args]);
    }

    /**
     * Asks the language runtime to create a new runtime state for a given source file and store it.
     * The AST for the given source file must have been previously constructed through the {@link parse} service.
     * 
     * @param args The arguments of the request.
     * @returns The LRP response to the request.
     */
    public async initExecution(args: LRP.InitArguments): Promise<LRP.InitResponse> {
        return this.request('initExecution', [args]);
    }

    /**
     * Asks the language runtime to perform an execution step in the runtime state associated to a given source file.
     * The possible steps are ecposed by the language runtime through the {@link getAvailableSteps} service.
     * 
     * @param args The arguments of the request.
     * @returns The LRP response to the request.
     */
    public async executeStep(args: LRP.StepArguments): Promise<LRP.StepResponse> {
        return this.request('executeStep', [args]);
    }

    /**
     * Asks the language runtime to return the current runtime state for a given source file.
     * 
     * @param args The arguments of the request.
     * @returns The LRP response to the request.
     */
    public async getRuntimeState(args: LRP.GetRuntimeStateArguments): Promise<LRP.GetRuntimeStateResponse> {
        return this.request('getRuntimeState', [args]);
    }

    /**
     * Asks the language runtime to return the available breakpoint types it defines.
     * 
     * @returns The LRP response to the request.
     */
    public async getBreakpointTypes(): Promise<LRP.GetBreakpointTypesResponse> {
        return this.request('getBreakpointTypes', []);
    }

    /**
     * Asks the language runtime to check whether a breakpoint of a certain type is verified with the given arguments.
     * 
     * @param args The arguments of the request.
     * @returns The LRP response to the request.
     */
    public async checkBreakpoint(args: LRP.CheckBreakpointArguments): Promise<LRP.CheckBreakpointResponse> {
        return this.request('checkBreakpoint', [args]);
    }

    public async getSteppingModes(): Promise<LRP.GetSteppingModesResponse> {
        return this.request('getSteppingModes', []);
    }

    public async getAvailableSteps(args: LRP.GetAvailableStepsArguments): Promise<LRP.GetAvailableStepsResponse> {
        return this.request('getAvailableSteps', [args]);
    }

    public async getStepLocation(args: LRP.GetStepLocationArguments): Promise<LRP.GetStepLocationResponse> {
        return this.request('getStepLocation', [args]);
    }
}