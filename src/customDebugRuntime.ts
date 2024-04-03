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
    public terminatedEventSent: boolean;
    private _sourceFile: string;
    private noDebug: boolean;

    readonly lrProxy: LanguageRuntimeProxy;

    private _breakpointManager: CDAPBreakpointManager;
    private _stepManager: StepManager;
    private variableHandler: VariableHandler;

    private _isExecutionDone: boolean;

    private _isInitDone: boolean;

    private pauseRequired: boolean;
    private pausedOnCurrentStep: boolean;

    constructor(private debugSession: CustomDebugSession, languageRuntimePort: number, private pauseOnEnd: boolean, private skipRedundantPauses: boolean) {
        this.lrProxy = new LanguageRuntimeProxy(languageRuntimePort);
        this._isInitDone = false;
        this.pausedOnCurrentStep = true;
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

        await this.lrProxy.initializeExecution({ sourceFile: sourceFile, bindings: { ...additionalArgs } });

        const getBreakpointTypes: LRP.GetBreakpointTypesResponse = await this.lrProxy.getBreakpointTypes();
        this._breakpointManager = new CDAPBreakpointManager(sourceFile, this.lrProxy, parseResponse.astRoot, getBreakpointTypes.breakpointTypes);
        this.variableHandler = new VariableHandler(parseResponse.astRoot);

        const getAvailableStepsResponse: LRP.GetAvailableStepsResponse = await this.lrProxy.getAvailableSteps({ sourceFile: sourceFile });

        this._stepManager = new StepManager(getAvailableStepsResponse.availableSteps);
        this._isExecutionDone = this._stepManager.availableSteps.length == 0;
        this.pauseRequired = false;
        this.pausedOnCurrentStep = true;
        this.terminatedEventSent = false;

        this._isInitDone = true;
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
        if (this._isExecutionDone) {
            if (!this.terminatedEventSent) {
                this.debugSession.sendTerminatedEvent();
                return;
            } else {
                throw new Error('Execution is already done.');
            }
        }

        this.pauseRequired = false;
        await this._run(this.noDebug);
    }

    /**
     * Asks for the execution of the next atomic step to the language.
     * 
     * Should only be called after {@link initExecution} has been called.
     */
    public async nextStep() {
        if (!this._sourceFile) throw new Error('No sources loaded.');
        if (this._isExecutionDone) {
            if (!this.terminatedEventSent) {
                this.debugSession.sendTerminatedEvent();
                return;
            } else {
                throw new Error('Execution is already done.');
            }
        }
        if (this._stepManager.enabledStep == undefined) throw new Error('No step enabled.');

        this.pauseRequired = false;

        const targetStep: LRP.Step = this._stepManager.enabledStep;
        let completedSteps: string[] = [];

        while (!this._isExecutionDone) {
            if (this.pauseRequired) {
                this.stop('pause');
                return;
            }

            if (completedSteps.includes(targetStep.id)) {
                this.stop('step');
                return;
            }

            let currentStep: LRP.Step | undefined = this._stepManager.enabledStep;
            if (currentStep == undefined) throw new Error('No step currently enabled.');

            // Find and execute next atomic step
            try {
                const atomicStep: LRP.Step = await this.findNextAtomicStep(currentStep, false);
                completedSteps = await this.executeAtomicStep(atomicStep, false);
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

            // Check non-determinism on next top-level composite step
            if (this._stepManager.availableSteps.length > 1) {
                this.stop('choice');
                return;
            }
        }

        if (this.pauseOnEnd) {
            this.stop('end');
            return;
        }

        this.terminatedEventSent = true;
        this.debugSession.sendTerminatedEvent();
    }

    public async stepIn() {
        if (!this._sourceFile) throw new Error('No sources loaded.');
        if (this._isExecutionDone) {
            if (!this.terminatedEventSent) {
                this.debugSession.sendTerminatedEvent();
                return;
            } else {
                throw new Error('Execution is already done.');
            }
        }
        if (this._stepManager.enabledStep == undefined) throw new Error('No step currently enabled.');

        const enabledStep: LRP.Step = this._stepManager.enabledStep;

        try {
            if (enabledStep.isComposite) {
                await this.enterCompositeStep(enabledStep, false);
            } else {
                await this.executeAtomicStep(enabledStep, false);
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

        this.terminatedEventSent = true;
        this.debugSession.sendTerminatedEvent();
    }

    public async stepOut() {
        if (!this._sourceFile) throw new Error('No sources loaded.');
        if (this._isExecutionDone) {
            if (!this.terminatedEventSent) {
                this.debugSession.sendTerminatedEvent();
                return;
            } else {
                throw new Error('Execution is already done.');
            }
        }

        this.pauseRequired = false;

        if (this._stepManager.stack.length === 0) {
            await this._run(false);
            return;
        }

        const parentStepId: string = this._stepManager.stack[this._stepManager.stack.length].id;
        let completedSteps: string[] = [];

        while (!this._isExecutionDone) {
            if (this.pauseRequired) {
                this.stop('pause');
                return;
            }

            if (completedSteps.includes(parentStepId)) {
                this.stop('step');
                return;
            }

            let currentStep: LRP.Step | undefined = this._stepManager.enabledStep;
            if (currentStep == undefined) throw new Error('No step currently enabled.');

            // Find and execute next atomic step
            try {
                const atomicStep: LRP.Step = await this.findNextAtomicStep(currentStep, false);
                completedSteps = await this.executeAtomicStep(atomicStep, false);
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

            // Check non-determinism on next top-level composite step
            if (this._stepManager.availableSteps.length > 1) {
                this.stop('choice');
                return;
            }
        }

        if (this.pauseOnEnd) {
            this.stop('end');
            return;
        }

        this.terminatedEventSent = true;
        this.debugSession.sendTerminatedEvent();
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

    public async getEnabledStepLocation(): Promise<LRP.Location | null> {
        if (this._isExecutionDone) return null;
        if (this._stepManager.enabledStep == undefined) throw new Error('No step currently enabled.');

        let location: LRP.Location | null | undefined = this._stepManager.availableStepsLocations.get(this._stepManager.enabledStep);

        if (location !== undefined) return location;

        const response: LRP.GetStepLocationResponse = await this.lrProxy.getStepLocation({
            sourceFile: this._sourceFile,
            stepId: this._stepManager.enabledStep.id
        });

        this._stepManager.availableStepsLocations.set(this._stepManager.enabledStep, response.location ? response.location : null);

        return response.location !== undefined ? response.location : null;
    }

    public pause(): void {
        this.pauseRequired = true;
    }

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

    public get stack(): LRP.Step[] {
        return this._stepManager.stack;
    }

    public get stackLocations(): Map<LRP.Step, LRP.Location | null> {
        return this._stepManager.stackLocations;
    }




    /** ------ PRIVATE ------ */

    private async _run(noDebug: boolean) {
        while (!this._isExecutionDone) {
            if (this.pauseRequired) {
                this.stop('pause');
                return;
            }

            const currentStep: LRP.Step | undefined = this._stepManager.enabledStep;
            if (currentStep == undefined) throw new Error('No step currently enabled.');

            // Find and execute next atomic step
            try {
                const atomicStep: LRP.Step = await this.findNextAtomicStep(currentStep, noDebug);
                await this.executeAtomicStep(atomicStep, noDebug);
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

            // Check non-determinism on next top-level composite step
            if (this._stepManager.availableSteps.length > 1) {
                this.stop('choice');
                return;
            }
        }

        if (this.pauseOnEnd) {
            this.stop('end');
            return;
        }

        this.terminatedEventSent = true;
        this.debugSession.sendTerminatedEvent();
    }

    private async findNextAtomicStep(step: LRP.Step, noDebug: boolean): Promise<LRP.Step> {
        let currentStep: LRP.Step | undefined = step;

        while (currentStep.isComposite) {
            await this.enterCompositeStep(currentStep, noDebug);
            if (this._stepManager.availableSteps.length > 1) throw new NonDeterminismError();

            currentStep = this._stepManager.enabledStep;
            if (currentStep == undefined) throw new Error('No step currently enabled.')
        }

        return currentStep;
    }

    private async enterCompositeStep(step: LRP.Step, noDebug: boolean): Promise<void> {
        if (!noDebug && (!this.pausedOnCurrentStep || !this.skipRedundantPauses)) {
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
    }

    private async executeAtomicStep(step: LRP.Step, noDebug: boolean): Promise<string[]> {
        if (!noDebug && (!this.pausedOnCurrentStep || !this.skipRedundantPauses)) {
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
        this._isExecutionDone = this._stepManager.availableSteps.length == 0;

        return response.completedSteps;
    }

    private async updateAvailableSteps(completedSteps: string[]): Promise<void> {
        const stepsArgs: LRP.GetAvailableStepsArguments = {
            sourceFile: this._sourceFile
        }

        const response = await this.lrProxy.getAvailableSteps(stepsArgs);
        this._stepManager.update(response.availableSteps, completedSteps);
        this._isExecutionDone = response.availableSteps.length == 0;

        if (!this._isExecutionDone) this.getEnabledStepLocation();
    }

    private stop(reason: string, message?: string | undefined): void {
        this.pausedOnCurrentStep = true;
        this.debugSession.sendStoppedEvent(reason, message);
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