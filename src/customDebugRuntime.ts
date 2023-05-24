import { Variable } from "@vscode/debugadapter";
import { ActivatedBreakpoint, CDAPBreakpointManager } from "./breakpointManager";
import { CustomDebugSession } from "./customDebugSession";
import { GetBreakpointTypesResponse, GetRuntimeStateResponse, InitResponse, ParseResponse, StepResponse } from "./lrp";
import { LanguageRuntimeProxy } from "./lrProxy";

import { VariableHandler } from "./variableHandler";

/**
 * Handles debugging operations for a source file.
 */
export class CustomDebugRuntime {

    private _sourceFile: string;
    private noDebug: boolean;

    private lrProxy: LanguageRuntimeProxy;

    private _breakpointManager: CDAPBreakpointManager;
    private variableHandler: VariableHandler;

    private _isExecutionDone: boolean;

    private _activatedBreakpoint: ActivatedBreakpoint | undefined;

    constructor(private debugSession: CustomDebugSession, languageRuntimePort: number) {
        this.lrProxy = new LanguageRuntimeProxy(languageRuntimePort);
    }

    /**
     * Initializes the execution for a given source file.
     * 
     * @param sourceFile The source file for which to initialize an execution.
     * @param noDebug True if the debug operations should be disabled, false otherwise.
     * @param additionalArgs Additional arguments necessary to initialize the execution.
     */
    public async initExecution(sourceFile: string, noDebug: boolean, additionalArgs?: any) {
        if (this._sourceFile) throw new Error("Sources already loaded. This should only be called once after instanciation.");

        this._sourceFile = sourceFile;
        this.noDebug = noDebug;

        const parseResponse: ParseResponse = await this.lrProxy.parse({ sourceFile: sourceFile });
        const initResponse: InitResponse = await this.lrProxy.initExecution({ sourceFile: sourceFile, ...additionalArgs });
        const getBreakpointTypes: GetBreakpointTypesResponse = await this.lrProxy.getBreakpointTypes();
        const getRuntimeStateResponse: GetRuntimeStateResponse = await this.lrProxy.getRuntimeState({ sourceFile: sourceFile });

        this._breakpointManager = new CDAPBreakpointManager(sourceFile, this.lrProxy, parseResponse.astRoot, getBreakpointTypes.breakpointTypes);
        this.variableHandler = new VariableHandler(parseResponse.astRoot, getRuntimeStateResponse.runtimeStateRoot);
        this._isExecutionDone = initResponse.isExecutionDone;
    }


    /**
     * Runs the program associated to the source file specified in {@link initExecution}.
     * If debug is enabled, the execution stops when a breakpoint is activated or a pause event is 
     * activated by the user. Otherwise, the program runs normally.
     * 
     * Should only be called after {@link initExecution} has been called.
     */
    public async run() {
        if (!this._sourceFile) throw new Error('No sources loaded.');

        while (!this._isExecutionDone) {
            if (!this.noDebug) {
                if (await this.checkBreakpoints()) {
                    // seq and type don't matter, they're changed inside sendEvent()
                    this.debugSession.sendEvent({
                        event: 'stopped',
                        seq: 1,
                        type: 'event',
                        body: {
                            reason: 'breakpoint',
                            description: this._activatedBreakpoint!.message,
                            threadId: CustomDebugSession.threadID
                        }
                    });

                    return;
                }
            }

            this._isExecutionDone = (await this.lrProxy.nextStep({ sourceFile: this._sourceFile })).isExecutionDone;
        }

        // seq and type don't matter, they're changed inside sendEvent()
        this.debugSession.sendEvent({
            event: 'terminated', seq: 1, type: 'event'
        });
    }

    /**
     * Asks for the execution of the next atomic step to the language.
     * 
     * Should only be called after {@link initExecution} has been called.
     */
    public async nextStep() {
        if (!this._sourceFile) throw new Error('No sources loaded.');
        if (this._isExecutionDone) throw new Error('Execution is already done.');

        const stepResponse: StepResponse = await this.lrProxy.nextStep({ sourceFile: this._sourceFile });
        this._isExecutionDone = stepResponse.isExecutionDone;
        await this.updateRuntimeState();
    }

    /**
     * Checks whether a domain-specific breakpoint is activated on the current runtime state.
     * 
     * Should only be called after {@link initExecution} has been called.
     * 
     * @returns True if a breakpoint was activated, false otherwise.
     */
    private async checkBreakpoints(): Promise<boolean> {
        this._activatedBreakpoint = await this._breakpointManager.checkBreakpoints();

        if (this._activatedBreakpoint) {
            await this.updateRuntimeState();
            return true;
        }

        return false;
    }

    /**
     * Retrieves the variables associated to a given reference.
     * If a variable contains other variables (i.e., is not a basic type), the reference for
     * the direct children variables are returned instead of the children variables themselves.
     * 
     * Should only be called after {@link initExecution} has been called.
     * 
     * @param variablesReference The reference of the variables.
     * @returns The list of variables associated to the given reference.
     */
    public getVariables(variablesReference: number): Variable[] {
        if (!this._sourceFile) throw new Error('No sources loaded.');
        return this.variableHandler.getVariables(variablesReference);
    }

    /**
     * Updates the current runtime state as well as the next step.
     * 
     * Should only be called after {@link initExecution} has been called.
     */
    public async updateRuntimeState(): Promise<void> {
        const getRuntimeStateResponse: GetRuntimeStateResponse = await this.lrProxy.getRuntimeState({ sourceFile: this._sourceFile });
        this.variableHandler.updateRuntime(getRuntimeStateResponse.runtimeStateRoot);
    }

    public get sourceFile(): string {
        return this._sourceFile;
    }

    public get isExecutionDone(): boolean {
        return this._isExecutionDone;
    }

    public get breakpointManager(): CDAPBreakpointManager {
        return this._breakpointManager;
    }

    public get activatedBreakpoint(): ActivatedBreakpoint | undefined {
        return this._activatedBreakpoint;
    }
}