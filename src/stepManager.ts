import * as LRP from "./lrp";

export class StepManager {
    private _enabledStep?: LRP.Step;
    public availableSteps: LRP.Step[];
    public stack: LRP.Step[];

    public availableStepsLocations: Map<LRP.Step, LRP.Location | null>;
    public stackLocations: Map<LRP.Step, LRP.Location | null>;

    constructor(availableSteps: LRP.Step[]) {
        this.availableSteps = availableSteps;
        this._enabledStep = availableSteps.length > 0 ? availableSteps[0] : undefined;
        this.stack = [];
        this.availableStepsLocations = new Map();
        this.stackLocations = new Map();
    }

    public update(availableSteps: LRP.Step[], completedSteps: string[]): void {
        if (this._enabledStep === undefined) throw new Error('No step is enabled.');

        // entered composite step
        if (completedSteps.length == 0) {
            const enabledStepLocation: LRP.Location | null | undefined = this.availableStepsLocations.get(this._enabledStep);
            if (enabledStepLocation === undefined) throw new Error('No location for enabled step.');

            this.stack.push(this._enabledStep);
            this.stackLocations.set(this._enabledStep, enabledStepLocation);
        } 
        // executed atomic step
        else {
            this.removeCompletedStepsFromStack(completedSteps);
        }

        this.availableSteps = availableSteps;
        this._enabledStep = availableSteps.length > 0 ? availableSteps[0] : undefined;
        this.availableStepsLocations.clear();
    }
    
    public enableStep(stepId: string) {
        const step: LRP.Step | undefined = this.availableSteps.find(step => step.id === stepId);
        
        if (step != undefined) this._enabledStep = step;
    }
    
    public get enabledStep(): LRP.Step | undefined {
        return this._enabledStep;
    }

    private removeCompletedStepsFromStack(completedSteps: string[]) {
        let completedStepsCopy: string[] = [...completedSteps];
        while (this.stack.length > 0) {
            const matchIndex: number = completedStepsCopy.findIndex(stepId => stepId === this.stack[this.stack.length - 1].id);
            if (matchIndex === -1) break;

            this.stack.pop();
            completedStepsCopy.splice(matchIndex, 1);
        }
    }
}