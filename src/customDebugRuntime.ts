import { TerminatedEvent, Variable } from "@vscode/debugadapter";
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
    public terminatedEventSent: boolean;
    private _sourceFile: string;
    private noDebug: boolean;

    readonly lrProxy: LanguageRuntimeProxy;

    private _breakpointManager: CDAPBreakpointManager;
    private _stepManager: StepManager;
    private variableHandler: VariableHandler;

    private _isExecutionDone: boolean;

    private _isInitDone: boolean;

    constructor(private debugSession: CustomDebugSession, languageRuntimePort: number, private pauseOnEnd: boolean) {
        this.lrProxy = new LanguageRuntimeProxy(languageRuntimePort);
        this._isInitDone = false;
        this.terminatedEventSent = false;
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
    public async run(continueUntilChoice: boolean) {
        if (!this._sourceFile) throw new Error('No sources loaded.');
        if (this._isExecutionDone) throw new Error('Execution is already done.');

        await this._run(continueUntilChoice, this.noDebug);
    }

    /**
     * Asks for the execution of the next atomic step to the language.
     * 
     * Should only be called after {@link initExecution} has been called.
     */
    public async nextStep() {
        if (!this._sourceFile) throw new Error('No sources loaded.');
        if (this._isExecutionDone) throw new Error('Execution is already done.');

        await this.completeStep(this._stepManager.enabledStep.id, this._stepManager.enabledStep.id);
    }

    public async stepIn() {
        if (!this._sourceFile) throw new Error('No sources loaded.');
        if (this._isExecutionDone) throw new Error('Execution is already done.');

        const enabledStep: LRP.Step = this._stepManager.enabledStep;
        if (enabledStep.isComposite) {
            await this.updateAvailableSteps(enabledStep.id);
        } else {
            if (await this.checkBreakpoints(enabledStep.id)) return;
            await this.nextAtomicStep(enabledStep.id);
            await this.updateAvailableSteps();
        }
    }

    public async stepOut() {
        if (!this._sourceFile) throw new Error('No sources loaded.');
        if (this._isExecutionDone) throw new Error('Execution is already done.');

        if (!this._stepManager.parentStepId) {
            await this._run(false, false);
            return;
        }

        await this.completeStep(this._stepManager.parentStepId, this._stepManager.enabledStep.id);
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
                isEnabled: this._stepManager.enabledSteppingMode.id == mode.id
            };
        });
    }

    public getAvailableSteps(): DAPExtension.Step[] {
        return this._stepManager.availableSteps.map((step, i) => {
            return {
                id: step.id,
                name: step.name,
                description: step.description ? step.description : '',
                isEnabled: this._stepManager.enabledStep ? this._stepManager.enabledStep === step : i == 0
            };
        });
    }

    public async updateAvailableSteps(stepId?: string): Promise<void> {
        const stepsArgs: LRP.GetAvailableStepsArguments = {
            sourceFile: this._sourceFile,
            steppingModeId: this._stepManager.enabledSteppingMode.id
        }

        if (stepId) stepsArgs.compositeStepId = stepId;

        const response = await this.lrProxy.getAvailableSteps(stepsArgs);
        this._stepManager.availableSteps = response.availableSteps;
        this._stepManager.parentStepId = response.parentStepId;
        this._stepManager.enableStep();
        this._stepManager.locations.clear();
    }

    public enableStep(stepId?: string) {
        this._stepManager.enableStep(stepId);
    }

    public async getCurrentLocation(): Promise<LRP.Location | undefined> {
        if (this._isExecutionDone) return undefined;
        const location: LRP.Location | null | undefined = this._stepManager.locations.get(this._stepManager.enabledStep);

        if (location === null) return undefined;
        if (location) return location;

        const response: LRP.GetStepLocationResponse = await this.lrProxy.getStepLocation({
            sourceFile: this._sourceFile,
            stepId: this._stepManager.enabledStep.id
        });

        this._stepManager.locations.set(this._stepManager.enabledStep, response.location ? response.location : null);

        return response.location ? response.location : undefined;
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

    public get isInitDone(): boolean {
        return this._isInitDone;
    }

    private async _run(continueUntilChoice: boolean, noDebug: boolean) {
        let isFirstStep: boolean = true;
        while (!this._isExecutionDone) {
            if (!noDebug) {
                const isBreakpointActivated: boolean = isFirstStep ? await this.checkBreakpoints(this._stepManager.enabledStep.id) : await this.checkBreakpoints();
                if (isBreakpointActivated) {
                    if (!isFirstStep) await this.updateAvailableSteps();
                    return;
                }
            }

            await this.nextAtomicStep(isFirstStep ? this._stepManager.enabledStep.id : undefined)

            isFirstStep = false;
            if (await this.mustStopBecauseChoice(continueUntilChoice)) return;
        }

        if (this.pauseOnEnd) {
            this.updateAvailableSteps();
            this.debugSession.sendStoppedEvent('end');
        } else {
            this.terminatedEventSent = true;
            this.debugSession.sendEvent(new TerminatedEvent());
        }
    }

    private async mustStopBecauseChoice(continueUntilChoice: boolean): Promise<boolean> {
        if (!continueUntilChoice) return false;

        await this.updateAvailableSteps();
        if (this._stepManager.availableSteps && this._stepManager.availableSteps.length > 1) {
            this.debugSession.sendStoppedEvent('choice');
            return true;
        }

        return false;
    }

    private async completeStep(stepId: string, selectedStepId?: string) {
        if (await this.checkBreakpoints(selectedStepId)) return;

        let completedSteps: string[] = await this.nextAtomicStep(selectedStepId);

        while (!this._isExecutionDone && !completedSteps.includes(stepId)) {
            if (await this.checkBreakpoints()) {
                await this.updateAvailableSteps();
                return;
            };
            completedSteps = await this.nextAtomicStep();
        }

        await this.updateAvailableSteps();
    }

    /**
     * Performs as single atomic step. Won't check breakpoints.
     * 
     * @param stepId Id of the user-selected step, if any.
     * @returns Ids of steps that have been completed after the execution of this atomic step.
     */
    private async nextAtomicStep(stepId?: string): Promise<string[]> {
        const args: LRP.StepArguments = {
            sourceFile: this._sourceFile
        };

        if (stepId) args.stepId = stepId;

        let stepResponse: LRP.StepResponse = await this.lrProxy.executeStep(args);
        this._isExecutionDone = stepResponse.isExecutionDone;
        this.variableHandler.invalidateRuntime();

        return stepResponse.completedSteps;
    }

    /**
     * Checks whether a domain-specific breakpoint is activated on the current runtime state.
     * 
     * Should only be called after {@link initExecution} has been called.
     * 
     * @returns True if a breakpoint was activated, false otherwise.
     */
    private async checkBreakpoints(stepId?: string): Promise<boolean> {
        const activatedBreakpoint: ActivatedBreakpoint | undefined = await this._breakpointManager.checkBreakpoints(stepId);
        if (!activatedBreakpoint) return false;

        this.debugSession.sendStoppedEvent('breakpoint', activatedBreakpoint.message);
        return true;
    }

    
}