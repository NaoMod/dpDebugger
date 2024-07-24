import { Client, RequestParamsLike } from "jayson";
import * as LRDP from "./lrdp";

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
     * @param method Remote method's name.
     * @param params Remote method's arguments.
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
     * @param method Remote method's name.
     * @param args Remote method's arguments.
     * @returns True if the message was emitted, false otherwise.
     */
    protected emit(method: string, args: any[]): boolean {
        return this.client.emit(method, args);
    }
}


/**
 * Proxy for a language runtime implementing LRDP.
 */
export class LanguageRuntimeProxy extends Proxy {
    /**
     * Asks the language runtime to parse a program and store its AST.
     * 
     * @param args Arguments of the request.
     * @returns The LRDP response to the request.
     */
    public async parse(args: LRDP.ParseArguments): Promise<LRDP.ParseResponse> {
        return this.request('parse', [args]);
    }

    /**
     * Asks the language runtime to create a new runtime state for the given source file and store it.
     * The AST for the given source file must have been previously constructed through the {@link parse} service.
     * 
     * @param args Arguments of the request.
     * @returns The LRDP response to the request.
     */
    public async initializeExecution(args: LRDP.InitializeExecutionArguments): Promise<LRDP.InitializeExecutionResponse> {
        return this.request('initializeExecution', [args]);
    }

    /**
     * Asks the language runtime to return the current runtime state for the given source file.
     * 
     * @param args Arguments of the request.
     * @returns The LRDP response to the request.
     */
    public async getRuntimeState(args: LRDP.GetRuntimeStateArguments): Promise<LRDP.GetRuntimeStateResponse> {
        return this.request('getRuntimeState', [args]);
    }

    /**
     * Asks the language runtime to return the available breakpoint types it defines.
     * 
     * @returns The LRDP response to the request.
     */
    public async getBreakpointTypes(): Promise<LRDP.GetBreakpointTypesResponse> {
        return this.request('getBreakpointTypes', []);
    }

    /**
     * Asks the language runtime to check whether a breakpoint of a certain type is verified with the given arguments,
     * in the runtime state associated to the given source file.
     * 
     * @param args Arguments of the request.
     * @returns The LRDP response to the request.
     */
    public async checkBreakpoint(args: LRDP.CheckBreakpointArguments): Promise<LRDP.CheckBreakpointResponse> {
        return this.request('checkBreakpoint', [args]);
    }

    /**
     * Asks the language runtime to return the currently available steps.
     * 
     * @param args Arguments of the request.
     * @returns The LRDP response to the request.
     */
    public async getAvailableSteps(args: LRDP.GetAvailableStepsArguments): Promise<LRDP.GetAvailableStepsResponse> {
        return this.request('getAvailableSteps', [args]);
    }

    /**
     * Asks the language runtime to enter a composite step in the runtime state associated to the given source file.
     * The possible steps are exposed by the language runtime through the {@link getAvailableSteps} service.
     * 
     * @param args Arguments of the request.
     * @returns The LRDP response to the request.
     */
    public async enterCompositeStep(args: LRDP.EnterCompositeStepArguments): Promise<LRDP.EnterCompositeStepResponse> {
        return this.request('enterCompositeStep', [args]);
    }

    /**
     * Asks the language runtime to perform a single atomic step in the runtime state associated to the given source file.
     * The possible steps are exposed by the language runtime through the {@link getAvailableSteps} service.
     * 
     * @param args Arguments of the request.
     * @returns The LRDP response to the request.
     */
    public async executeAtomicStep(args: LRDP.ExecuteAtomicStepArguments): Promise<LRDP.ExecuteAtomicStepResponse> {
        return this.request('executeAtomicStep', [args]);
    }

    /**
     * Asks the language runtime to return the location of a step in the runtime state associated to the given source file.
     * The possible steps are exposed by the language runtime through the {@link getAvailableSteps} service.
     * 
     * @param args Arguments of the request.
     * @returns The LRDP response to the request.
     */
    public async getStepLocation(args: LRDP.GetStepLocationArguments): Promise<LRDP.GetStepLocationResponse> {
        return this.request('getStepLocation', [args]);
    }
}