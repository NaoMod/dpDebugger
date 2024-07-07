import { Variable } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import * as DAPExtension from "./DAPExtension";
import { ASTElementLocator } from "./astElementLocator";
import { ActivatedBreakpoint, CDAPBreakpointManager } from "./breakpointManager";
import { CustomDebugSession } from "./customDebugSession";
import { LanguageRuntimeProxy } from "./lrProxy";
import * as LRP from "./lrp";
import { ProcessedModel, processModel } from "./modelElementProcess";
import { ModelElementTypeRegistry } from "./modelElementRegistry";
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

    /** Debugging session which started this debug runtime. */
    private debugSession: CustomDebugSession;

    /** Proxy to communicate with the language runtime for the source file being debugged. */
    readonly lrProxy: LanguageRuntimeProxy;

    /** Facility responsible for breakpoint management for this debug runtime. */
    private _breakpointManager: CDAPBreakpointManager;

    /** Facility responsible for step management for this debug runtime. */
    private _stepManager: StepManager;

    private astElementLocator: ASTElementLocator;

    private modelElementTypeRegistry: ModelElementTypeRegistry;

    /** Facility responsible for variable management for this debug runtime. */
    private variableHandler: VariableHandler;

    /** Current status regarding the initialization of the runtime. */
    private initializationStatus: InitializationStatus;

    /**  */
    private initialBreakpointsRequest: InitialBreakpointsRequest | null;

    /** True if the execution of the source file is done. */
    private _isExecutionDone: boolean;

    /** True if a terminated event was sent to the IDE. */
    private _terminatedEventSent: boolean;

    /** True if a pause is required by the IDE */
    private pauseRequired: boolean;

    /** True if the execution is currently paused. */
    private pausedOnNonDeterminism: boolean;

    constructor(debugSession: CustomDebugSession, sourceFile: string, languageRuntimePort: number, pauseOnEnd: boolean, initArgs: InitializationParams) {
        this._sourceFile = sourceFile;
        //TODO: change initArguments name
        this.astElementLocator = new ASTElementLocator(initArgs.linesStartAt1, initArgs.columnsStartAt1);
        this.modelElementTypeRegistry = new ModelElementTypeRegistry();
        this.pauseOnEnd = pauseOnEnd;
        this.debugSession = debugSession;
        this.lrProxy = new LanguageRuntimeProxy(languageRuntimePort);
        this.initializationStatus = new InitializationStatus();
        this.pausedOnNonDeterminism = true;
        this.initialBreakpointsRequest = null;
    }

    /**
     * Initializes the execution for a given source file.
     * 
     * @param pauseOnStart True if a pause must be triggered after the initialization, false otherwise.
     * @param additionalArgs Additional arguments necessary to initialize the execution.
     */
    public async initializeExecution(pauseOnStart: boolean, additionalArgs?: any): Promise<boolean> {
        const parseResponse: LRP.ParseResponse = await this.lrProxy.parse({ sourceFile: this._sourceFile });
        await this.lrProxy.initializeExecution({ sourceFile: this._sourceFile, entries: { ...additionalArgs } });
        const processedAst: ProcessedModel = processModel(parseResponse.astRoot);

        const getBreakpointTypes: LRP.GetBreakpointTypesResponse = await this.lrProxy.getBreakpointTypes();

        this.astElementLocator.registerAst(processedAst.root);
        this.modelElementTypeRegistry.registerAstElements(processedAst.typeToElements);
        this.variableHandler = new VariableHandler(processedAst);

        this._breakpointManager = new CDAPBreakpointManager(this._sourceFile, this.astElementLocator, getBreakpointTypes.breakpointTypes, this.lrProxy);
        if (this.initialBreakpointsRequest !== null) this.initialBreakpointsRequest.resolve(this._breakpointManager);

        const getAvailableStepsResponse: LRP.GetAvailableStepsResponse = await this.lrProxy.getAvailableSteps({ sourceFile: this._sourceFile });

        this._stepManager = new StepManager(getAvailableStepsResponse.availableSteps);
        this._isExecutionDone = this._stepManager.availableSteps.length == 0;
        this.pauseRequired = false;
        this.initializationStatus.setTrue();

        // no step scenario
        if (this._isExecutionDone) {
            if (this.pauseOnEnd) {
                this.pausedOnNonDeterminism = false
                this._terminatedEventSent = false;
                this.stop('end');
            } else {
                this._terminatedEventSent = true;
                this.debugSession.sendTerminatedEvent();
            }

            return false;
        }

        // multiple steps scenario
        if (this._stepManager.availableSteps.length > 1) {
            this.pausedOnNonDeterminism = true;
            this._terminatedEventSent = false;
            pauseOnStart ? this.stop('start and choice') : this.stop('choice');;
            return false;
        }

        // single step scenario
        this.pausedOnNonDeterminism = false;
        this._terminatedEventSent = false;
        const step: LRP.Step | undefined = this._stepManager.selectedStep;
        if (step === undefined) throw new NoSelectedStepError();
        const activatedBreakpoints: ActivatedBreakpoint[] = await this._breakpointManager.checkBreakpoints(step.id);

        if (activatedBreakpoints.length > 0) {
            const breakpointsAggregatedMessage: string = activatedBreakpoints.map(b => b.message).join('\n');
            pauseOnStart ? this.stop('start and breakpoint', `Paused on start.\n ${breakpointsAggregatedMessage}`) : this.stop('breakpoint', breakpointsAggregatedMessage);
            return false;
        }

        if (pauseOnStart) {
            this.stop('start');
            return false;
        }

        return true;
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
     * Executes the currently selected step.
     * The execution pauses when the step is completed, a non-deterministic situation is reached,
     * a breakpoint is activated, a pause is required by the IDE or the execution
     * is completed (if pauseOnEnd is true, otherwise the execution is terminated).
     * 
     * Should only be called after {@link initializeExecution} has been called.
     * 
     * @throws {NoSelectedStepError} If no step is selected.
     */
    public async nextStep(): Promise<void> {
        if (!this._sourceFile) throw new Error('No sources loaded.');
        if (this.checkExecutionDone()) return;
        if (this._stepManager.selectedStep === undefined) throw new NoSelectedStepError();

        this.pauseRequired = false;

        const targetStep: LRP.Step = this._stepManager.selectedStep;
        await this._run(targetStep);
    }

    /**
     * Steps into the currently selected step. If this step is atomic, execute it instead.
     * The execution pauses when the step is stepped into (or executed in the case of an atomic step),
     * a breakpoint is activatedor the execution is completed (if pauseOnEnd is true,
     * otherwise the execution is terminated).
     * 
     * Should only be called after {@link initializeExecution} has been called.
     * 
     * @throws {NoSelectedStepError} No step is selected.
     */
    public async stepIn(): Promise<void> {
        if (!this._sourceFile) throw new Error('No sources loaded.');
        if (this.checkExecutionDone()) return;

        const selectedStep: LRP.Step | undefined = this._stepManager.selectedStep;
        if (selectedStep === undefined) throw new NoSelectedStepError();

        // Check breakpoints BEFORE step
        if (this.pausedOnNonDeterminism) {
            const activatedBreakpoints: ActivatedBreakpoint[] = this.pausedOnNonDeterminism ? await this._breakpointManager.checkBreakpoints(selectedStep.id) : [];
            if (activatedBreakpoints.length > 0) {
                this.stop('breakpoint', activatedBreakpoints.map(b => b.message).join('\n'));
                return;
            }
        }

        let pauseInformation: PauseInformation | undefined = undefined;
        if (selectedStep.isComposite) {
            pauseInformation = await this.enterCompositeStep(selectedStep);
        } else {
            pauseInformation = (await this.executeAtomicStep(selectedStep)).pauseInformation;
        }

        // Paused on something else than just step
        if (pauseInformation !== undefined) {
            pauseInformation.addReason('step');
            this.stop(pauseInformation.formatReasons(), pauseInformation.formatMessages());
            return;
        }

        // Paused just on step
        if (!this._isExecutionDone) {
            this.stop('step');
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
     * @throws {NoSelectedStepError} If no step is selected.
     */
    public async stepOut(): Promise<void> {
        if (!this._sourceFile) throw new Error('No sources loaded.');
        if (this.checkExecutionDone()) return;

        this.pauseRequired = false;

        if (this._stepManager.stack.length === 0) {
            await this._run();
            return;
        }

        const parentStep: LRP.Step = this._stepManager.stack[this._stepManager.stack.length - 1];
        await this._run(parentStep);
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
        const processedRuntimeState: ProcessedModel = processModel(getRuntimeStateResponse.runtimeStateRoot);
        this.modelElementTypeRegistry.registerRuntimeStateElements(processedRuntimeState.typeToElements);
        this.variableHandler.updateRuntime(processedRuntimeState);
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
                isSelected: this._stepManager.selectedStep ? this._stepManager.selectedStep === step : i == 0
            };
        });
    }

    /**
     * Retrieves the location of the currently selected step.
     * 
     * @returns The location of the currently selected step, or null if it has no location.
     * @throws {NoSelectedStepError} If no step is selected.
     */
    public async getSelectedStepLocation(): Promise<LRP.Location | null> {
        if (this._isExecutionDone) return null;
        if (this._stepManager.selectedStep == undefined) throw new NoSelectedStepError();

        let location: LRP.Location | null | undefined = this._stepManager.availableStepsLocations.get(this._stepManager.selectedStep);

        if (location !== undefined) return location;

        const response: LRP.GetStepLocationResponse = await this.lrProxy.getStepLocation({
            sourceFile: this._sourceFile,
            stepId: this._stepManager.selectedStep.id
        });

        this._stepManager.availableStepsLocations.set(this._stepManager.selectedStep, response.location ? response.location : null);

        return response.location !== undefined ? response.location : null;
    }

    /**
     * Requires the pause of the execution.
     */
    public pause(): void {
        this.pauseRequired = true;
    }

    /**
     * Selects a step from the currently available steps.
     * 
     * @param stepId ID of the step to select.
     */
    public selectStep(stepId: string): void {
        this._stepManager.selectStep(stepId);
    }

    /**
     * Waits for the initialization of the runtime to be completed.
     */
    public async waitForInitialization(): Promise<void> {
        return this.initializationStatus.wait();
    }

    /**
     * Sets multiple domain-specific breakpoints from source breakpoints.
     * Previously set breakpoints are removed.
     * 
     * @param breakpoints Source breakpoints applied to the source file.
     * @returns The validated breakpoints.
     */
    public async setBreakpoints(breakpoints: DebugProtocol.SourceBreakpoint[]): Promise<DebugProtocol.Breakpoint[]> {
        return new Promise<DebugProtocol.Breakpoint[]>(resolve => {
            if (this._breakpointManager !== undefined) {
                resolve(this._breakpointManager.setBreakpoints(breakpoints));
            } else {
                this.initialBreakpointsRequest = new InitialBreakpointsRequest(breakpoints, resolve);
            }
        });
    }

    public getModelElementsFromType(type: string): LRP.ModelElement[] {
        return this.modelElementTypeRegistry.getModelElementsFromType(type);
    }

    public getModelElementFromSource(line: number, column: number): LRP.ModelElement | undefined {
        return this.astElementLocator.getElementFromPosition(line, column);
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
     * @throws {NoSelectedStepError} If no step is selected.
     */
    private async _run(targetStep?: LRP.Step): Promise<void> {
        let completedSteps: string[] = [];

        while (!this._isExecutionDone && (targetStep === undefined || !completedSteps.includes(targetStep.id))) {
            let currentStep: LRP.Step | undefined = this._stepManager.selectedStep;
            if (currentStep == undefined) throw new NoSelectedStepError();

            // Check breakpoints BEFORE step
            if (this.pausedOnNonDeterminism) {
                const activatedBreakpoints: ActivatedBreakpoint[] = this.pausedOnNonDeterminism ? await this._breakpointManager.checkBreakpoints(currentStep.id) : [];
                if (activatedBreakpoints.length > 0) {
                    this.stop('breakpoint', activatedBreakpoints.map(b => b.message).join('\n'));
                    return;
                }
            }

            const nextAtomicStep: NextAtomicStepSearchResult = await this.findNextAtomicStep(currentStep);
            if (nextAtomicStep.status === 'failed' || nextAtomicStep.pauseInformation !== undefined) {
                this.stop(nextAtomicStep.pauseInformation!.formatReasons(), nextAtomicStep.pauseInformation!.formatMessages());
                return;
            }

            const atomicStepExecutionResult: AtomicStepExecutionResult = await this.executeAtomicStep(nextAtomicStep.step);
            if (atomicStepExecutionResult.pauseInformation !== undefined) {
                const pauseInformation: PauseInformation = atomicStepExecutionResult.pauseInformation;
                if (targetStep !== undefined && atomicStepExecutionResult.completedSteps.includes(targetStep.id)) pauseInformation.addReason('step');
                this.stop(pauseInformation.formatReasons(), pauseInformation.formatMessages());
                return;
            }

            completedSteps = atomicStepExecutionResult.completedSteps;
        }

        // Paused just on step
        if (targetStep !== undefined && !this._isExecutionDone) {
            this.stop('step');
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
     * @throws {NoSelectedStepError} If no step is automatically selected.
     */
    private async findNextAtomicStep(step: LRP.Step): Promise<NextAtomicStepSearchResult> {
        let currentStep: LRP.Step | undefined = step;

        while (currentStep.isComposite) {
            const pauseInformation: PauseInformation | undefined = await this.enterCompositeStep(currentStep);
            if (pauseInformation === undefined) {
                currentStep = this._stepManager.selectedStep;
                if (currentStep == undefined) throw new NoSelectedStepError();
                continue;
            }

            if (this._stepManager.availableSteps.length !== 1) return { status: "failed", pauseInformation: pauseInformation };

            currentStep = this._stepManager.selectedStep;
            if (currentStep == undefined) throw new NoSelectedStepError();
            return { status: "success", step: currentStep, pauseInformation: pauseInformation };
        }

        return { status: "success", step: currentStep };
    }

    /**
     * Enters a single composite step.
     * Checks breakpoints beforehand and updates available steps afterwards.
     * 
     * @param step Step to enter.
     * @throws {StepNotCompositeError} If the step is not composite.
     * @throws {ActivatedBreakpointError} If a breakpoint is activated before entering the step.
     */
    private async enterCompositeStep(step: LRP.Step): Promise<PauseInformation | undefined> {
        if (!step.isComposite) throw new StepNotCompositeError(step);

        const enterCompositeStepArguments: LRP.EnterCompositeStepArguments = {
            sourceFile: this._sourceFile,
            stepId: step.id
        }

        await this.lrProxy.enterCompositeStep(enterCompositeStepArguments);
        await this.updateAvailableSteps([]);
        return this.checkPause();
    }

    /**
     * Executes a single atomic step.
     * Checks breakpoints beforehand, and both invalidates the runtime state
     * and updates available steps afterwards.
     * 
     * @param step Step to execute.
     * @returns The list of IDs of steps that were completed.
     * @throws {StepNotAtomicError} If the step is not atomic.
     * @throws {ActivatedBreakpointError} If a breakpoint is activated before executing the step.
     */
    private async executeAtomicStep(step: LRP.Step): Promise<AtomicStepExecutionResult> {
        if (step.isComposite) throw new StepNotAtomicError(step);

        const executeAtomicStepArguments: LRP.ExecuteAtomicStepArguments = {
            sourceFile: this._sourceFile,
            stepId: step.id
        };

        const response = await this.lrProxy.executeAtomicStep(executeAtomicStepArguments);
        this.variableHandler.invalidateRuntime();
        await this.updateAvailableSteps(response.completedSteps);
        const pauseInformation: PauseInformation | undefined = await this.checkPause();

        return { completedSteps: response.completedSteps, pauseInformation: pauseInformation };
    }

    private async checkPause(): Promise<PauseInformation | undefined> {
        const pauseInformation: PauseInformation = new PauseInformation;
        if (this.pauseRequired) pauseInformation.addReason('pause');
        if (this._stepManager.availableSteps.length > 1) {
            this.pausedOnNonDeterminism = true;
            pauseInformation.addReason('choice');
            return pauseInformation;
        }

        this.pausedOnNonDeterminism = false;
        if (this._isExecutionDone && this.pauseOnEnd) pauseInformation.addReason('end');

        if (!this._isExecutionDone) {
            const step: LRP.Step | undefined = this._stepManager.selectedStep;
            if (step === undefined) throw new NoSelectedStepError();
    
            const activatedBreakpoints: ActivatedBreakpoint[] = await this._breakpointManager.checkBreakpoints(step.id);
            if (activatedBreakpoints.length > 0) {
                pauseInformation.addReason('breakpoint');
                pauseInformation.addMessages(...activatedBreakpoints.map(b => b.message));
            }
        }

        return pauseInformation.isPaused() ? pauseInformation : undefined;            
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

        if (!this._isExecutionDone) this.getSelectedStepLocation();
    }

    /**
     * Sends a {@link DebugProtocol.StoppedEvent} to the IDE.
     * 
     * @param reason Reason for the stopped event.
     * @param message Message to be displayed to the end-user.
     */
    private stop(reason: string, message?: string | undefined): void {
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

        if (!this._terminatedEventSent) {
            this.debugSession.sendTerminatedEvent();
            return true;
        }

        throw new TerminationEventSentError();
    }
}

class InitializationStatus {
    private done: boolean = false;
    private resolveFuncs: (() => void)[] = [];

    public setTrue(): void {
        this.done = true;
        this.resolveFuncs.forEach(resolve => resolve());
        this.resolveFuncs = [];
    }

    public async wait(): Promise<void> {
        return new Promise<void>(resolve => {
            if (this.done) {
                resolve();
            } else {
                this.resolveFuncs.push(resolve);
            }
        });
    }
}

class InitialBreakpointsRequest {
    constructor(private sourceBreakpoints: DebugProtocol.SourceBreakpoint[], private resolveFunc: ((x: DebugProtocol.Breakpoint[]) => void)) { }

    public resolve(breakpointManager: CDAPBreakpointManager): void {
        this.resolveFunc(breakpointManager.setBreakpoints(this.sourceBreakpoints));
    }
}

export type InitializationParams = {
    linesStartAt1: boolean;
    columnsStartAt1: boolean;
}

class PauseInformation {
    private reasons: string[] = [];
    private messages: string[] = [];

    public addReason(reason: string): void {
        this.reasons.push(reason);
    }

    public isPaused(): boolean {
        return this.reasons.length > 0;
    }

    public addMessages(...messages: string[]): void {
        this.messages.push(...messages);
    }

    public formatReasons(): string {
        return this.reasons.join(' and ');
    }

    public formatMessages(): string | undefined {
        if (this.messages.length === 0) return undefined;

        let aggregatedMessage: string = this.messages.join('\n');
        if (this.reasons.includes('pause')) aggregatedMessage = `Paused on pause.\n${aggregatedMessage}`;
        if (this.reasons.includes('step')) aggregatedMessage = `Paused on step.\n${aggregatedMessage}`;
        if (this.reasons.includes('choice')) aggregatedMessage = `Paused on choice.\n${aggregatedMessage}`;
        if (this.reasons.includes('end')) aggregatedMessage = `Paused on end.\n${aggregatedMessage}`;

        return aggregatedMessage;
    }
}

type NextAtomicStepSearchResult = SuccessfulNextAtomicStepSearchResult | FailedNextAtomicStepSearchResult;

type SuccessfulNextAtomicStepSearchResult = {
    status: 'success';
    step: LRP.Step;
    pauseInformation?: PauseInformation;
}

type FailedNextAtomicStepSearchResult = {
    status: 'failed';
    pauseInformation: PauseInformation;
}

type AtomicStepExecutionResult = {
    completedSteps: string[];
    pauseInformation?: PauseInformation;
}

class NoSelectedStepError implements Error {
    name: string;
    message: string;

    constructor() {
        this.name = 'NoSelectedStepError';
        this.message = 'No step currently selected.'
    }
}

class TerminationEventSentError implements Error {
    name: string;
    message: string;

    constructor() {
        this.name = 'TerminationEventSentError';
        this.message = 'Termination event already sent.'
    }
}

class StepNotCompositeError implements Error {
    name: string;
    message: string;
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
    step: LRP.Step;

    constructor(step: LRP.Step) {
        this.name = 'StepNotAtomicError';
        this.message = `Step '${step.name}' is not atomic.`
        this.step = step;
    }
}