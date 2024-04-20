import { Variable } from "@vscode/debugadapter";
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
    /** Source file for which this debug runtime is responsible. */
    private _sourceFile: string;

    /** True if a pause must be triggered before terminating the execution.*/
    private pauseOnEnd: boolean;

    /** True if multiple pauses on the  same runtime state must be skipped. */
    private skipRedundantPauses: boolean;

    /** Debugging session which started this debug runtime. */
    private debugSession: CustomDebugSession;

    /** Proxy to communicate with the language runtime for the source file being debugged. */
    readonly lrProxy: LanguageRuntimeProxy;

    /** Facility responsible for breakpoint management for this debug runtime. */
    private _breakpointManager: CDAPBreakpointManager;

    /** Facility responsible for step management for this debug runtime. */
    private _stepManager: StepManager;

    /** Facility responsible for variable management for this debug runtime. */
    private variableHandler: VariableHandler;

    /** True if the initializationof the execution of the source file is done. */
    private _isInitDone: boolean;

    /** True if the execution of the source file is done. */
    private _isExecutionDone: boolean;

    /** True if a terminated event was sent to the IDE. */
    private _terminatedEventSent: boolean;

    /** True if a pause is required by the IDE */
    private pauseRequired: boolean;

    /** True if the execution is currently paused. */
    private pausedOnCurrentStep: boolean;

    /** True if the execution is currently paused at the start. */
    private pausedOnStart: boolean;

    constructor(debugSession: CustomDebugSession, languageRuntimePort: number, pauseOnEnd: boolean, skipRedundantPauses: boolean) {
        this.pauseOnEnd = pauseOnEnd;
        this.skipRedundantPauses = skipRedundantPauses;
        this.debugSession = debugSession;
        this.lrProxy = new LanguageRuntimeProxy(languageRuntimePort);
        this._isInitDone = false;
        this.pausedOnCurrentStep = true;
        this.pausedOnStart = false;
    }

    /**
     * Initializes the execution for a given source file.
     * 
     * @param sourceFile Source file for which to initialize an execution.
     * @param pauseOnStart True if a pause must be triggered after the initialization, false otherwise.
     * @param additionalArgs Additional arguments necessary to initialize the execution.
     */
    public async initializeExecution(sourceFile: string, pauseOnStart: boolean, additionalArgs?: any): Promise<void> {
        if (this._sourceFile) throw new Error("Sources already loaded. This should only be called once after instanciation.");

        this._sourceFile = sourceFile;

        const parseResponse: LRP.ParseResponse = await this.lrProxy.parse({ sourceFile: sourceFile });
        await this.lrProxy.initializeExecution({ sourceFile: sourceFile, bindings: { ...additionalArgs } });

        const getBreakpointTypes: LRP.GetBreakpointTypesResponse = await this.lrProxy.getBreakpointTypes();
        this._breakpointManager = new CDAPBreakpointManager(sourceFile, this.lrProxy, parseResponse.astRoot, getBreakpointTypes.breakpointTypes);
        this.variableHandler = new VariableHandler(parseResponse.astRoot);

        const getAvailableStepsResponse: LRP.GetAvailableStepsResponse = await this.lrProxy.getAvailableSteps({ sourceFile: sourceFile });

        this._stepManager = new StepManager(getAvailableStepsResponse.availableSteps);
        this._isExecutionDone = this._stepManager.availableSteps.length == 0;
        this.pauseRequired = false;
        this._isInitDone = true;

        if (pauseOnStart) {
            this.pausedOnStart = true;
            this._terminatedEventSent = false;
            this.stop('start');
            return;
        }

        this.pausedOnStart = false;

        if (this._isExecutionDone) {
            this.pausedOnCurrentStep = true;

            if (this.pauseOnEnd) {
                this._terminatedEventSent = false;
                this.stop('end');
            } else {
                this._terminatedEventSent = true;
                this.debugSession.sendTerminatedEvent();
            }

            return;
        }

        this.pausedOnCurrentStep = false;
        this._terminatedEventSent = false;
    }


    /**
     * Runs the program associated to the source file specified in {@link initializeExecution}.
     * The execution pauses when a non-deterministic situation is reached, a breakpoint is activated, 
     * a pause is required by the IDE or the execution is completed (if pauseOnEnd is true, 
     * otherwise the execution is terminated).
     * 
     * Should only be called after {@link initializeExecution} has been called.
     */
    public async run(): Promise<void> {
        if (!this._sourceFile) throw new Error('No sources loaded.');
        if (this.checkExecutionDone()) return;

        this.pauseRequired = false;
        await this._run();
    }

    /**
     * Executes the currently enabled step.
     * The execution pauses when the step is completed, a non-deterministic situation is reached,
     * a breakpoint is activated, a pause is required by the IDE or the execution
     * is completed (if pauseOnEnd is true, otherwise the execution is terminated).
     * 
     * Should only be called after {@link initializeExecution} has been called.
     * 
     * @throws {NoEnabledStepError} If no step is enabled.
     */
    public async nextStep(): Promise<void> {
        if (!this._sourceFile) throw new Error('No sources loaded.');
        if (this.checkExecutionDone()) return;
        if (this._stepManager.enabledStep == undefined) throw new NoEnabledStepError();

        this.pauseRequired = false;

        const targetStep: LRP.Step = this._stepManager.enabledStep;
        let completedSteps: string[] = [];

        while (!this._isExecutionDone && !completedSteps.includes(targetStep.id)) {
            if (this.pauseRequired) {
                this.stop('pause');
                return;
            }

            // Check non-determinism on next top-level composite step
            if (!this.pausedOnCurrentStep && this._stepManager.availableSteps.length > 1) {
                this.stop('choice');
                return;
            }

            let currentStep: LRP.Step | undefined = this._stepManager.enabledStep;
            if (currentStep == undefined) throw new NoEnabledStepError();

            // Find and execute next atomic step
            try {
                const atomicStep: LRP.Step = await this.findNextAtomicStep(currentStep);
                completedSteps = await this.executeAtomicStep(atomicStep);
            } catch (error: unknown) {
                if (error instanceof NonDeterminismError) {
                    this.stop('choice');
                    return;
                }
                else if (error instanceof ActivatedBreakpointError) {
                    this.stop('breakpoint', error.breakpoint.message);
                    return;
                }
            }
        }

        if (!this._isExecutionDone) {
            this.stop('step');
            return;
        }

        if (this.pauseOnEnd) {
            this.stop('end');
            return;
        }

        this._terminatedEventSent = true;
        this.debugSession.sendTerminatedEvent();
    }

    /**
     * Steps into the currently enabled step. If this step is atomic, execute it instead.
     * The execution pauses when the step is stepped into (or executed in the case of an atomic step),
     * a breakpoint is activatedor the execution is completed (if pauseOnEnd is true,
     * otherwise the execution is terminated).
     * 
     * Should only be called after {@link initializeExecution} has been called.
     * 
     * @throws {NoEnabledStepError} No step is enabled.
     */
    public async stepIn(): Promise<void> {
        if (!this._sourceFile) throw new Error('No sources loaded.');
        if (this.checkExecutionDone()) return;
        if (this._stepManager.enabledStep == undefined) throw new NoEnabledStepError();

        const enabledStep: LRP.Step = this._stepManager.enabledStep;

        try {
            if (enabledStep.isComposite) {
                await this.enterCompositeStep(enabledStep);
            } else {
                await this.executeAtomicStep(enabledStep);
            }
        } catch (error: unknown) {
            if (error instanceof ActivatedBreakpointError) {
                this.stop('breakpoint', error.breakpoint.message);
                return;
            }
        }

        if (!this._isExecutionDone) {
            this.stop('step');
            return;
        }

        if (this.pauseOnEnd) {
            this.stop('end');
            return;
        }

        this._terminatedEventSent = true;
        this.debugSession.sendTerminatedEvent();
    }

    /**
     * Completes the execution of the last composite step that was stepped into.
     * If no composite step is currently stepped into, the execution is resumed.
     * The execution pauses when the composite step is completed, a non-deterministic situation is reached,
     * a breakpoint is activated, a pause is required by the IDE or the execution
     * is completed (if pauseOnEnd is true, otherwise the execution is terminated).
     * 
     * Should only be called after {@link initializeExecution} has been called.
     * 
     * @throws {NoEnabledStepError} If no step is enabled.
     */
    public async stepOut(): Promise<void> {
        if (!this._sourceFile) throw new Error('No sources loaded.');
        if (this.checkExecutionDone()) return;

        this.pauseRequired = false;

        if (this._stepManager.stack.length === 0) {
            await this._run();
            return;
        }

        const parentStepId: string = this._stepManager.stack[this._stepManager.stack.length - 1].id;
        let completedSteps: string[] = [];

        while (!this._isExecutionDone && !completedSteps.includes(parentStepId)) {
            if (this.pauseRequired) {
                this.stop('pause');
                return;
            }

            // Check non-determinism on next top-level composite step
            if (!this.pausedOnCurrentStep && this._stepManager.availableSteps.length > 1) {
                this.stop('choice');
                return;
            }

            let currentStep: LRP.Step | undefined = this._stepManager.enabledStep;
            if (currentStep == undefined) throw new NoEnabledStepError();

            // Find and execute next atomic step
            try {
                const atomicStep: LRP.Step = await this.findNextAtomicStep(currentStep);
                completedSteps = await this.executeAtomicStep(atomicStep);
            } catch (error: unknown) {
                if (error instanceof NonDeterminismError) {
                    this.stop('choice');
                    return;
                }
                else if (error instanceof ActivatedBreakpointError) {
                    this.stop('breakpoint', error.breakpoint.message);
                    return;
                }
            }
        }

        if (!this._isExecutionDone) {
            this.stop('step');
            return;
        }

        if (this.pauseOnEnd) {
            this.stop('end');
            return;
        }

        this._terminatedEventSent = true;
        this.debugSession.sendTerminatedEvent();
    }

    /**
     * Retrieves the variables associated to a given reference.
     * If a variable contains other variables (i.e., is not a basic type), the reference for
     * the direct children variables are returned instead of the children variables themselves.
     * 
     * Should only be called after {@link initializeExecution} has been called.
     * 
     * @param variablesReference Reference of the variables.
     * @returns The list of variables associated to the given reference.
     */
    public getVariables(variablesReference: number): Variable[] {
        if (!this._sourceFile) throw new Error('No sources loaded.');
        return this.variableHandler.getVariables(variablesReference);
    }

    /**
     * Updates the current runtime state.
     * 
     * Should only be called after {@link initializeExecution} has been called.
     */
    public async updateRuntimeState(): Promise<void> {
        const getRuntimeStateResponse: LRP.GetRuntimeStateResponse = await this.lrProxy.getRuntimeState({ sourceFile: this._sourceFile });
        this.variableHandler.updateRuntime(getRuntimeStateResponse.runtimeStateRoot);
    }

    /**
     * Retrieves the currently available steps. Listed steps are dependant on
     * the runtime state and composite steps currently stepped into.
     * 
     * @returns The list of available steps.
     */
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

    /**
     * Retrieves the location of the currently enabled step.
     * 
     * @returns The location of the currently enabled step, or null if it has no location.
     * @throws {NoEnabledStepError} If no step is enabled.
     */
    public async getEnabledStepLocation(): Promise<LRP.Location | null> {
        if (this._isExecutionDone) return null;
        if (this._stepManager.enabledStep == undefined) throw new NoEnabledStepError();

        let location: LRP.Location | null | undefined = this._stepManager.availableStepsLocations.get(this._stepManager.enabledStep);

        if (location !== undefined) return location;

        const response: LRP.GetStepLocationResponse = await this.lrProxy.getStepLocation({
            sourceFile: this._sourceFile,
            stepId: this._stepManager.enabledStep.id
        });

        this._stepManager.availableStepsLocations.set(this._stepManager.enabledStep, response.location ? response.location : null);

        return response.location !== undefined ? response.location : null;
    }

    /**
     * Requires the pause of the execution.
     */
    public pause(): void {
        this.pauseRequired = true;
    }

    /**
     * Enables a step from the currently available steps.
     * 
     * @param stepId ID of the step to enable.
     */
    public enableStep(stepId: string): void {
        this._stepManager.enableStep(stepId);
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

    public get terminatedEventSent(): boolean {
        return this._terminatedEventSent;
    }

    public get stack(): LRP.Step[] {
        return this._stepManager.stack;
    }

    public get stackLocations(): Map<LRP.Step, LRP.Location | null> {
        return this._stepManager.stackLocations;
    }


    /** ------ PRIVATE ------ */

    /**
     * Resumes the execution.
     * Called either by {@link run} or {@link stepOut}.
     * 
     * @throws {NoEnabledStepError} If no step is enabled.
     */
    private async _run(): Promise<void> {
        while (!this._isExecutionDone) {
            if (this.pauseRequired) {
                this.stop('pause');
                return;
            }

            // Check non-determinism on next top-level composite step
            if (!this.pausedOnCurrentStep && this._stepManager.availableSteps.length > 1) {
                this.stop('choice');
                return;
            }

            const currentStep: LRP.Step | undefined = this._stepManager.enabledStep;
            if (currentStep == undefined) throw new NoEnabledStepError();

            // Find and execute next atomic step
            try {
                const atomicStep: LRP.Step = await this.findNextAtomicStep(currentStep);
                await this.executeAtomicStep(atomicStep);
            } catch (error: unknown) {
                if (error instanceof NonDeterminismError) {
                    this.stop('choice');
                    return;
                }
                else if (error instanceof ActivatedBreakpointError) {
                    this.stop('breakpoint', error.breakpoint.message);
                    return;
                }
            }
        }

        if (this.pauseOnEnd) {
            this.stop('end');
            return;
        }

        this._terminatedEventSent = true;
        this.debugSession.sendTerminatedEvent();
    }

    /**
     * Finds the next atomic step that can be executed by enter composite steps
     * until an atomic step is reached.
     * 
     * @param step First step to consider.
     * @returns The next atomic step.
     * @throws {NonDeterminismError} If a non-deterministic situation occurs before an atomic step is reached.
     * @throws {NoEnabledStepError} If no step is automatically enabled.
     */
    private async findNextAtomicStep(step: LRP.Step): Promise<LRP.Step> {
        let currentStep: LRP.Step | undefined = step;

        while (currentStep.isComposite) {
            await this.enterCompositeStep(currentStep);
            if (this._stepManager.availableSteps.length > 1) throw new NonDeterminismError();

            currentStep = this._stepManager.enabledStep;
            if (currentStep == undefined) throw new NoEnabledStepError();
        }

        return currentStep;
    }

    /**
     * Enters a single composite step.
     * Checks breakpoints beforehand and updates available steps afterwards.
     * 
     * @param step Step to enter.
     * @throws {StepNotCompositeError} If the step is not composite.
     */
    private async enterCompositeStep(step: LRP.Step): Promise<void> {
        if (!step.isComposite) throw new StepNotCompositeError(step);

        if (!this.pausedOnCurrentStep || !this.skipRedundantPauses) {
            // Check breakpoints for composite step
            const activatedBreakpoint: ActivatedBreakpoint | undefined = await this._breakpointManager.checkBreakpoints(step.id);
            if (activatedBreakpoint !== undefined) throw new ActivatedBreakpointError(activatedBreakpoint);
        }

        const enterCompositeStepArguments: LRP.EnterCompositeStepArguments = {
            sourceFile: this._sourceFile,
            stepId: step.id
        }

        await this.lrProxy.enterCompositeStep(enterCompositeStepArguments);
        await this.updateAvailableSteps([]);
        this.pausedOnCurrentStep = false;
        this.pausedOnStart = false;
    }

    /**
     * Executes a single atomic step.
     * Checks breakpoints beforehand, and both invalidates the runtime state
     * and updates available steps afterwards.
     * 
     * @param step Step to execute.
     * @returns The list of IDs of steps that were completed.
     * @throws {StepNotAtomicError} If the step is not atomic.
     */
    private async executeAtomicStep(step: LRP.Step): Promise<string[]> {
        if (step.isComposite) throw new StepNotAtomicError(step);

        if (!this.pausedOnCurrentStep || !this.skipRedundantPauses) {
            // Check breakpoints for atomic step
            const activatedBreakpoint: ActivatedBreakpoint | undefined = await this._breakpointManager.checkBreakpoints(step.id);
            if (activatedBreakpoint !== undefined) throw new ActivatedBreakpointError(activatedBreakpoint);
        }

        const executeAtomicStepArguments: LRP.ExecuteAtomicStepArguments = {
            sourceFile: this._sourceFile,
            stepId: step.id
        };

        const response = await this.lrProxy.executeAtomicStep(executeAtomicStepArguments);
        this.variableHandler.invalidateRuntime();
        await this.updateAvailableSteps(response.completedSteps);
        this.pausedOnCurrentStep = false;
        this.pausedOnStart = false;
        this._isExecutionDone = this._stepManager.availableSteps.length == 0;

        return response.completedSteps;
    }

    /**
     * Updates the list of available steps and the stack of composite steps
     * currently stepped into.
     * 
     * @param completedSteps List of IDs of steps that were completed after performing the last atomic step.
     */
    private async updateAvailableSteps(completedSteps: string[]): Promise<void> {
        const stepsArgs: LRP.GetAvailableStepsArguments = {
            sourceFile: this._sourceFile
        }

        const response = await this.lrProxy.getAvailableSteps(stepsArgs);
        this._stepManager.update(response.availableSteps, completedSteps);
        this._isExecutionDone = response.availableSteps.length == 0;

        if (!this._isExecutionDone) this.getEnabledStepLocation();
    }

    /**
     * Sends a {@link DebugProtocol.StoppedEvent} to the IDE.
     * 
     * @param reason Reason for the stopped event.
     * @param message Message to be displayed to the end-user.
     */
    private stop(reason: string, message?: string | undefined): void {
        this.pausedOnCurrentStep = true;
        this.debugSession.sendStoppedEvent(reason, message);
    }

    /**
     * Checks whether the execution of the program is done.
     * If the execution is done and it is paused on start, sends a DAP stopped event to the IDE.
     * If the execution is done no DAP termination event has been sent to the IDE, sends it.
     * 
     * @returns True if the execution is done, false otherwise.
     * @throws {TerminationEventSentError} If the execution is done and a termination event was already sent.
     */
    private checkExecutionDone(): boolean {
        if (!this.isExecutionDone) return false;

        if (this.pausedOnStart && !this.skipRedundantPauses) {
            this.pausedOnStart = false;
            this.stop('end');
            return true;
        }

        if (!this._terminatedEventSent) {
            this.debugSession.sendTerminatedEvent();
            return true;
        }

        throw new TerminationEventSentError();
    }
}

class NonDeterminismError implements Error {
    name: string;
    message: string;
    stack?: string | undefined;

    constructor() {
        this.name = 'NonDeterminismError';
        this.message = 'Multiple steps are available.'
    }
}

class ActivatedBreakpointError implements Error {
    name: string;
    message: string;
    stack?: string | undefined;

    breakpoint: ActivatedBreakpoint;

    constructor(breakpoint: ActivatedBreakpoint) {
        this.name = 'ActivatedBreakpointError';
        this.message = 'A breakpoint is activated.'
        this.breakpoint = breakpoint;
    }
}

class NoEnabledStepError implements Error {
    name: string;
    message: string;
    stack?: string | undefined;

    constructor() {
        this.name = 'NoEnabledStepError';
        this.message = 'No step currently enabled.'
    }
}

class TerminationEventSentError implements Error {
    name: string;
    message: string;
    stack?: string | undefined;

    constructor() {
        this.name = 'TerminationEventSentError';
        this.message = 'Termination event already sent.'
    }
}

class StepNotCompositeError implements Error {
    name: string;
    message: string;
    stack?: string | undefined;

    step: LRP.Step;

    constructor(step: LRP.Step) {
        this.name = 'StepNotCompositeError';
        this.message = `Step '${step.name}' is not composite.`
        this.step = step;
    }
}

class StepNotAtomicError implements Error {
    name: string;
    message: string;
    stack?: string | undefined;

    step: LRP.Step;

    constructor(step: LRP.Step) {
        this.name = 'StepNotAtomicError';
        this.message = `Step '${step.name}' is not atomic.`
        this.step = step;
    }
}