import * as LRP from "./lrp";

export class StepManager {
    private _enabledStep?: LRP.Step;
    public availableSteps: LRP.Step[];
    public parentStepId?: string;
    public locations: Map<LRP.Step, LRP.Location | null>;
    
    constructor(availableSteps: LRP.Step[], parentStepId?: string) {
        this.availableSteps = availableSteps;
        this._enabledStep = availableSteps.length > 0 ? availableSteps[0] : undefined;
        this.parentStepId = parentStepId;
        this.locations = new Map();
    }

    public update(availableSteps: LRP.Step[], parentStepId?: string): void {
        this.availableSteps = availableSteps;
        this._enabledStep = availableSteps.length > 0 ? availableSteps[0] : undefined;
        this.parentStepId = parentStepId;
        this.locations.clear();
    }

    public enableStep(stepId: string) {
        const step: LRP.Step | undefined = this.availableSteps.find(step => step.id === stepId);

        if (step != undefined) this._enabledStep = step;
    }

    public get enabledStep(): LRP.Step | undefined {
        return this._enabledStep;
    }
}