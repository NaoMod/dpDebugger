import { StoppedEvent, TerminatedEvent, Variable } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import * as DAPExtension from "./DAPExtension";
import { ActivatedBreakpoint, CDAPBreakpointManager } from "./breakpointManager";
import { CustomDebugSession } from "./customDebugSession";
import { LanguageRuntimeProxy } from "./lrProxy";
import * as LRP from "./lrp";
import { StepManager } from "./stepManager";
import { VariableHandler } from "./variableHandler";

/**
 * Handles debugging operations for a source file.
 */
export class CustomDebugRuntime {
    private _sourceFile: string;
    private noDebug: boolean;

    readonly lrProxy: LanguageRuntimeProxy;

    private _breakpointManager: CDAPBreakpointManager;
    private _stepManager: StepManager;
    private variableHandler: VariableHandler;

    private _isExecutionDone: boolean;

    private _activatedBreakpoint: ActivatedBreakpoint | undefined;

    private _languageRuntimeCapabilities: LRP.LanguageRuntimeCapabilities;

    private _isInitDone: boolean;

    constructor(private debugSession: CustomDebugSession, languageRuntimePort: number) {
        this.lrProxy = new LanguageRuntimeProxy(languageRuntimePort);
        this._isInitDone = false;
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
        this._languageRuntimeCapabilities = (await this.lrProxy.initialize()).capabilities;

        const parseResponse: LRP.ParseResponse = await this.lrProxy.parse({ sourceFile: sourceFile });
        const initResponse: LRP.InitResponse = await this.lrProxy.initExecution({ sourceFile: sourceFile, ...additionalArgs });
        const getBreakpointTypes: LRP.GetBreakpointTypesResponse = await this.lrProxy.getBreakpointTypes();
        const getSteppingModesResponse: LRP.GetSteppingModesResponse = await this.lrProxy.getSteppingModes();

        this._breakpointManager = new CDAPBreakpointManager(sourceFile, this.lrProxy, parseResponse.astRoot, getBreakpointTypes.breakpointTypes);
        this._stepManager = new StepManager(getSteppingModesResponse.steppingModes);
        this.variableHandler = new VariableHandler(parseResponse.astRoot);
        this._isExecutionDone = initResponse.isExecutionDone;

        this._isInitDone = true;
    }


    /**
     * Runs the program associated to the source file specified in {@link initExecution}.
     * If debug is enabled, the execution stops when a breakpoint is activated or a pause event is 
     * activated by the user. Otherwise, the program runs normally.
     * 
     * Should only be called after {@link initExecution} has been called.
     * 
     * @param continueUntilChoice Whether the execution should stop when a choice is possible.
     * @param threadId ID of the thread for which to resume execution. If not provided, all threads resume execution.
     * If the langauge runtime doesn't support threads, then this parameter sould either not be provided, or be equal to the mock thread ID
     * {@link CustomDebugSession.threadID}.
     */
    public async run(continueUntilChoice: boolean, threadId?: number) {
        if (!this._sourceFile) throw new Error('No sources loaded.');
        if (threadId && !this._languageRuntimeCapabilities.supportsThreads && threadId != CustomDebugSession.threadID) throw new Error('Unexpected thread ID.')

        while (!this._isExecutionDone) {
            if (!this.noDebug) {
                if (await this.checkBreakpoints()) {
                    this.updateAvailableSteps();

                    const stoppedEvent: DebugProtocol.StoppedEvent = new StoppedEvent('breakpoint', threadId ? threadId : CustomDebugSession.threadID);
                    stoppedEvent.body.description = this._activatedBreakpoint!.message
                    this.debugSession.sendEvent(stoppedEvent);

                    return;
                }
            }

            const args: LRP.StepArguments = {
                sourceFile: this._sourceFile
            };

            if (threadId) args.threadId = threadId;

            this._isExecutionDone = (await this.lrProxy.executeStep(args)).isExecutionDone;

            if (continueUntilChoice) {
                await this.updateAvailableSteps();

                if (this._stepManager.availableSteps && this._stepManager.availableSteps.length > 1) {
                    this.debugSession.sendEvent(new StoppedEvent('choice', threadId ? threadId : CustomDebugSession.threadID));
                    return;
                }
            }
        }

        this.debugSession.sendEvent(new TerminatedEvent());
    }

    /**
     * Asks for the execution of the next atomic step to the language.
     * 
     * Should only be called after {@link initExecution} has been called.
     * 
     * @param threadId ID of the thread in which to execute a step. If not provided, all threads perform a step.
     * If the langauge runtime doesn't support threads, then this parameter sould either not be provided, or be equal to the mock thread ID
     * {@link CustomDebugSession.threadID}.
     */
    public async nextStep(threadId?: number) {
        if (!this._sourceFile) throw new Error('No sources loaded.');
        if (this._isExecutionDone) throw new Error('Execution is already done.');
        if (threadId && !this._languageRuntimeCapabilities.supportsThreads && threadId != CustomDebugSession.threadID) throw new Error('Unexpected thread ID.')

        const args: LRP.StepArguments = {
            sourceFile: this._sourceFile
        };

        if (threadId) args.threadId = threadId;
        if (this._stepManager.enabledStep) args.stepId = this._stepManager.enabledStep.id;

        const stepResponse: LRP.StepResponse = await this.lrProxy.executeStep(args);
        this._activatedBreakpoint = undefined;
        this._isExecutionDone = stepResponse.isExecutionDone;

        this.variableHandler.invalidateRuntime();
    }

    public async stepIn(threadId?: number) {
        const enabledStep: LRP.Step = this._stepManager.enabledStep;
        if (!enabledStep.isComposite) {
            this.nextStep(threadId);
            return;
        }

        await this.updateAvailableSteps(enabledStep.id);
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
        return this._activatedBreakpoint != undefined;
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
     * Updates the current runtime state.
     * 
     * Should only be called after {@link initExecution} has been called.
     */
    public async updateRuntimeState(): Promise<void> {
        const getRuntimeStateResponse: LRP.GetRuntimeStateResponse = await this.lrProxy.getRuntimeState({ sourceFile: this._sourceFile });
        this.variableHandler.updateRuntime(getRuntimeStateResponse.runtimeStateRoot);
    }

    public enableSteppingMode(steppingModeId: string) {
        this._stepManager.enableSteppingMode(steppingModeId);
    }

    public getAvailableSteppingModes(): DAPExtension.SteppingMode[] {
        return this._stepManager.availableSteppingModes.map(mode => {
            return {
                id: mode.id,
                name: mode.name,
                description: mode.description,
                isEnabled: (this._stepManager.enabledSteppingMode != undefined) && (this._stepManager.enabledSteppingMode?.id == mode.id)
            };
        });
    }

    // TODO: handle stepIn / stepOut
    public async getAvailableSteps(): Promise<DAPExtension.Step[]> {
        return this._stepManager.availableSteps!.map((step, i) => {
            return {
                id: step.id,
                name: step.name,
                description: step.description ? step.description : '',
                isEnabled: this._stepManager.enabledStep ? this._stepManager.enabledStep === step : i == 0
            };
        });
    }

    public enableStep(stepId?: string) {
        this._stepManager.enableStep(stepId);
    }

    public getCurrentLocation(): LRP.Location | undefined {
        return this._stepManager.enabledStep.location;
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

    public get capabilities(): LRP.LanguageRuntimeCapabilities {
        return this._languageRuntimeCapabilities;
    }

    public get isInitDone(): boolean {
        return this._isInitDone;
    }

    public async updateAvailableSteps(stepId?: string): Promise<void> {
        const stepsArgs: LRP.GetAvailableStepsArguments = {
            sourceFile: this._sourceFile,
            steppingModeId: this._stepManager.enabledSteppingModeId
        }

        if (stepId) stepsArgs.compositeStepId = stepId;

        const response = await this.lrProxy.getAvailableSteps(stepsArgs);
        this._stepManager.availableSteps = response.availableSteps;
        this._stepManager.enableStep();
    }
}