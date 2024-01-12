import * as LRP from "./lrp";

export class StepManager {
    private _enabledStep?: LRP.Step;

    public availableSteps: LRP.Step[];
    public parentStepId?: string;
    public locations: Map<LRP.Step, LRP.Location | null>;
    
    constructor() {
        this._enabledStep = undefined;
        this.availableSteps = [];
        this.parentStepId = undefined;
        this.locations = new Map();
    }

    public enableStep(stepId?: string) {
        this._enabledStep = stepId ? this.availableSteps?.find(step => step.id === stepId) : undefined;
    }

    public get enabledStep(): LRP.Step {
        return this._enabledStep ? this._enabledStep : this.availableSteps[0];
    }
}