import * as LRP from "./lrp";

/**
 * Manages execution steps provided by the language runtime.
 */
export class StepManager {
    /** Currently selected step. */
    private _selectedStep?: LRP.Step;

    /** Currently available steps. */
    public availableSteps: LRP.Step[];

    /** Stack of composite steps currently stepped into. */
    public stack: LRP.Step[];

    /** Retrieved locations of currently available steps. */
    public availableStepsLocations: Map<LRP.Step, LRP.Location | null>;

    /** Locations of composite steps present in the stack. */
    public stackLocations: Map<LRP.Step, LRP.Location | null>;

    constructor(availableSteps: LRP.Step[]) {
        this.availableSteps = availableSteps;
        this._selectedStep = availableSteps.length > 0 ? availableSteps[0] : undefined;
        this.stack = [];
        this.availableStepsLocations = new Map();
        this.stackLocations = new Map();
    }

    /**
     * Updates the currently available steps, as well as the stack.
     * If there is at least one available step, enables the first step in the list.
     * Must be called everytime a composite step is entered or an atomic step is executed.
     * 
     * @param availableSteps Newly available steps.
     * @param completedSteps Completed steps since the last update.
     */
    public update(availableSteps: LRP.Step[], completedSteps: string[]): void {
        if (this._selectedStep === undefined) throw new Error('No step is selected.');

        // entered composite step
        if (completedSteps.length == 0) {
            const selectedStepLocation: LRP.Location | null | undefined = this.availableStepsLocations.get(this._selectedStep);
            if (selectedStepLocation === undefined) throw new Error('No location for selected step.');

            this.stack.push(this._selectedStep);
            this.stackLocations.set(this._selectedStep, selectedStepLocation);
        }
        // executed atomic step
        else {
            this.removeCompletedStepsFromStack(completedSteps);
        }

        this.availableSteps = availableSteps;
        this._selectedStep = availableSteps.length > 0 ? availableSteps[0] : undefined;
        this.availableStepsLocations.clear();
    }

    /**
     * Selects a step from the currently available ones.
     * 
     * @param stepId ID of the step to select.
     */
    public selectStep(stepId: string): void {
        const step: LRP.Step | undefined = this.availableSteps.find(step => step.id === stepId);

        if (step != undefined) this._selectedStep = step;
    }

    /** Currently selected step. */
    public get selectedStep(): LRP.Step | undefined {
        return this._selectedStep;
    }

    /**
     * Removes completed composite steps from the stack.
     * 
     * @param completedSteps Completed steps since the last update.
     */
    private removeCompletedStepsFromStack(completedSteps: string[]): void {
        let completedStepsCopy: string[] = [...completedSteps];
        while (this.stack.length > 0) {
            const matchIndex: number = completedStepsCopy.findIndex(stepId => stepId === this.stack[this.stack.length - 1].id);
            if (matchIndex === -1) break;

            this.availableStepsLocations.delete(this.stack[this.stack.length - 1]);
            this.stack.pop();
            completedStepsCopy.splice(matchIndex, 1);
        }
    }
}