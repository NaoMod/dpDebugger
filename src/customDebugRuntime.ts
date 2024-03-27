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

    constructor(private debugSession: CustomDebugSession, languageRuntimePort: number, private pauseOnEnd: boolean) {
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

        const parseResponse: LRP.ParseResponse = await this.lrProxy.parse({ sourceFile: sourceFile });

        await this.lrProxy.initializeExecution({ sourceFile: sourceFile, bindings: { ...additionalArgs } });

        const getBreakpointTypes: LRP.GetBreakpointTypesResponse = await this.lrProxy.getBreakpointTypes();
        this._breakpointManager = new CDAPBreakpointManager(sourceFile, this.lrProxy, parseResponse.astRoot, getBreakpointTypes.breakpointTypes);
        this.variableHandler = new VariableHandler(parseResponse.astRoot);

        const getAvailableStepsResponse: LRP.GetAvailableStepsResponse = await this.lrProxy.getAvailableSteps({ sourceFile: sourceFile });
        this._stepManager = new StepManager(getAvailableStepsResponse.availableSteps, getAvailableStepsResponse.parentStepId);
        this._isExecutionDone = this._stepManager.availableSteps.length == 0;
        this.pauseRequired = false;
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
                this.debugSession.sendStoppedEvent('pause');
                return;
            }

            if (completedSteps.includes(targetStep.id)) {
                this.debugSession.sendStoppedEvent('step');
                return;
            }

            let currentStep: LRP.Step | undefined = this._stepManager.enabledStep;
            if (currentStep == undefined) throw new Error('No step currently enabled.');

            // Find and execute next atomic step
            try {
                const atomicStep: LRP.Step = await this.findNextAtomicStep(currentStep);

                // Check breakpoints
                const activatedBreakpoint: ActivatedBreakpoint | undefined = await this._breakpointManager.checkBreakpoints(atomicStep.id);
                if (activatedBreakpoint !== undefined) {
                    this.debugSession.sendStoppedEvent('breakpoint', activatedBreakpoint.message);
                    return;
                }

                completedSteps = await this.executeAtomicStep(atomicStep);
            } catch (error: unknown) {
                if (error instanceof NonDeterminismError) {
                    this.debugSession.sendStoppedEvent('choice');
                    return;
                }
            }

            // Check non-determinism on next top-level composite step
            if (this._stepManager.availableSteps.length > 1) {
                this.debugSession.sendStoppedEvent('choice');
                return;
            }
        }

        if (this.pauseOnEnd) {
            this.debugSession.sendStoppedEvent('end');
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
        if (this._isExecutionDone) throw new Error('Execution is already done.');
        if (this._stepManager.enabledStep == undefined) throw new Error('No step currently enabled.');

        const enabledStep: LRP.Step = this._stepManager.enabledStep;
        if (enabledStep.isComposite) {
            await this.lrProxy.enterCompositeStep({ sourceFile: this._sourceFile, stepId: enabledStep.id });
            await this.updateAvailableSteps();
        } else {
            // Check breakpoints
            const activatedBreakpoint: ActivatedBreakpoint | undefined = await this._breakpointManager.checkBreakpoints(enabledStep.id);
            if (activatedBreakpoint !== undefined) {
                this.debugSession.sendStoppedEvent('breakpoint', activatedBreakpoint.message);
                return;
            }

            await this.executeAtomicStep(enabledStep);
        }

        if (!this._isExecutionDone) {
            this.debugSession.sendStoppedEvent('step');
            return;
        }

        if (this.pauseOnEnd) {
            this.debugSession.sendStoppedEvent('end');
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

        if (this._stepManager.parentStepId == undefined) {
            await this._run(false);
            return;
        }

        const parentStepId: string = this._stepManager.parentStepId;
        let completedSteps: string[] = [];

        while (!this._isExecutionDone) {
            if (this.pauseRequired) {
                this.debugSession.sendStoppedEvent('pause');
                return;
            }

            if (completedSteps.includes(parentStepId)) {
                this.debugSession.sendStoppedEvent('step');
                return;
            }

            let currentStep: LRP.Step | undefined = this._stepManager.enabledStep;
            if (currentStep == undefined) throw new Error('No step currently enabled.');



            // Find and execute next atomic step
            try {
                const atomicStep: LRP.Step = await this.findNextAtomicStep(currentStep);

                // Check breakpoints
                const activatedBreakpoint: ActivatedBreakpoint | undefined = await this._breakpointManager.checkBreakpoints(atomicStep.id);
                if (activatedBreakpoint !== undefined) {
                    this.debugSession.sendStoppedEvent('breakpoint', activatedBreakpoint.message);
                    return;
                }

                completedSteps = await this.executeAtomicStep(atomicStep);
            } catch (error: unknown) {
                if (error instanceof NonDeterminismError) {
                    this.debugSession.sendStoppedEvent('choice');
                    return;
                }
            }

            // Check non-determinism on next top-level composite step
            if (this._stepManager.availableSteps.length > 1) {
                this.debugSession.sendStoppedEvent('choice');
                return;
            }
        }

        if (this.pauseOnEnd) {
            this.debugSession.sendStoppedEvent('end');
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

    public async getCurrentLocation(): Promise<LRP.Location | undefined> {
        if (this._isExecutionDone) return undefined;
        if (this._stepManager.enabledStep == undefined) throw new Error('No step currently enabled.');

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





    /** ------ PRIVATE ------ */

    private async _run(noDebug: boolean) {
        while (!this._isExecutionDone) {
            if (this.pauseRequired) {
                this.debugSession.sendStoppedEvent('pause');
                return;
            }

            const currentStep: LRP.Step | undefined = this._stepManager.enabledStep;
            if (currentStep == undefined) throw new Error('No step currently enabled.');

            

            // Find and execute next atomic step
            try {
                const atomicStep: LRP.Step = await this.findNextAtomicStep(currentStep);

                if (!noDebug) {
                    // Check breakpoints
                    const activatedBreakpoint: ActivatedBreakpoint | undefined = await this._breakpointManager.checkBreakpoints(atomicStep.id);
                    if (activatedBreakpoint !== undefined) {
                        this.debugSession.sendStoppedEvent('breakpoint', activatedBreakpoint.message);
                        return;
                    }
                }

                await this.executeAtomicStep(atomicStep);
            } catch (error: unknown) {
                if (error instanceof NonDeterminismError) {
                    this.debugSession.sendStoppedEvent('choice');
                    return;
                }
            }

            // Check non-determinism on next top-level composite step
            if (this._stepManager.availableSteps.length > 1) {
                this.debugSession.sendStoppedEvent('choice');
                return;
            }
        }

        if (this.pauseOnEnd) {
            this.debugSession.sendStoppedEvent('end');
            return;
        }

        this.terminatedEventSent = true;
        this.debugSession.sendTerminatedEvent();
    }

    private async findNextAtomicStep(step: LRP.Step): Promise<LRP.Step> {
        let currentStep: LRP.Step | undefined = step;

        while (currentStep.isComposite) {
            const enterCompositeStepArguments: LRP.EnterCompositeStepArguments = {
                sourceFile: this._sourceFile,
                stepId: currentStep.id
            }

            await this.lrProxy.enterCompositeStep(enterCompositeStepArguments);
            await this.updateAvailableSteps();
            if (this._stepManager.availableSteps.length > 1) throw new NonDeterminismError();

            currentStep = this._stepManager.enabledStep;
            if (currentStep == undefined) throw new Error('No step currently enabled.')
        }

        return currentStep;
    }

    private async executeAtomicStep(step: LRP.Step): Promise<string[]> {
        const executeAtomicStepArguments: LRP.ExecuteAtomicStepArguments = {
            sourceFile: this._sourceFile,
            stepId: step.id
        };
        const response = await this.lrProxy.executeAtomicStep(executeAtomicStepArguments);
        this.variableHandler.invalidateRuntime();
        await this.updateAvailableSteps();
        this._isExecutionDone = this._stepManager.availableSteps.length == 0;

        return response.completedSteps;
    }

    private async updateAvailableSteps(): Promise<void> {
        const stepsArgs: LRP.GetAvailableStepsArguments = {
            sourceFile: this._sourceFile
        }

        const response = await this.lrProxy.getAvailableSteps(stepsArgs);
        this._stepManager.update(response.availableSteps, response.parentStepId);
        this._isExecutionDone = response.availableSteps.length == 0;
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