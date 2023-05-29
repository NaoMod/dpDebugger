import { Client, RequestParamsLike } from "jayson";
import { CheckBreakpointArguments, CheckBreakpointResponse, GetBreakpointTypesResponse, GetRuntimeStateArguments, GetRuntimeStateResponse, InitArguments, InitResponse, ParseArguments, ParseResponse, StepArguments, StepResponse } from "./lrp";

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
     * Asks the language to parse a program and store its AST.
     * 
     * @param file The path of the file containing the program to parse.
     */
    public async parse(args: ParseArguments): Promise<ParseResponse> {
        return this.request('parse', [args]);
    }

    /**
     * Asks the language to initialize the execution of a program.
     * 
     * @param args The arguments for the initialization of the program execution.
     * @returns The response from the initialization.
     */
    public async initExecution(args: InitArguments): Promise<InitResponse> {
        return this.request('initExecution', [args]);
    }

    public async getBreakpointTypes(): Promise<GetBreakpointTypesResponse> {
        return this.request('getBreakpointTypes', []);
    }

    /**
     * Asks the language to execute the next atomic step.
     * 
     * @param file The path of the file containing the running program.
     * @returns The response from the atomic step execution.
     */
    public async nextStep(args: StepArguments): Promise<StepResponse> {
        return this.request('nextStep', [args]);
    }

    /**
     * Retrieves the current runtime state of a program from the language.
     * 
     * @param file The path of the file containing the running program.
     * @returns The current runtime state of the program.
     */
    public async getRuntimeState(args: GetRuntimeStateArguments): Promise<GetRuntimeStateResponse> {
        return this.request('getRuntimeState', [args]);
    }

    /**
     * Checks whether a breakpoint is activated.
     * 
     * @param args The arguments for the verification of the breakpoint.
     * @returns The response from the breakpoint verification.
     */
    public async checkBreakpoint(args: CheckBreakpointArguments): Promise<CheckBreakpointResponse> {
        return this.request('checkBreakpoint', [args]);
    }
}