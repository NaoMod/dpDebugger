import * as LRP from "./lrp";

export class StepManager {
    private _enabledSteppingMode: LRP.SteppingMode;
    private _enabledStep?: LRP.Step;

    public availableSteps: LRP.Step[];
    public locations: Map<LRP.Step, LRP.Location | null>;
    
    constructor(private _availableSteppingModes: LRP.SteppingMode[]) {
        if (_availableSteppingModes.length == 0) throw new Error("No stepping mode available.");
        
        this._enabledSteppingMode = _availableSteppingModes[0];
        this._enabledStep = undefined;
        this.availableSteps = [];
        this.locations = new Map();
    }

    public enableSteppingMode(steppingModeId: string): void {
        const steppingMode: LRP.SteppingMode | undefined = this.availableSteppingModes.find(steppingMode => steppingMode.id == steppingModeId);

        if (!steppingMode) throw new Error(`No stepping mode with ID ${steppingModeId}.`);

        this._enabledSteppingMode = steppingMode;
    }

    public enableStep(stepId?: string) {
        this._enabledStep = stepId ? this.availableSteps?.find(step => step.id === stepId) : undefined;
    }

    public get enabledSteppingMode(): LRP.SteppingMode {
        return this._enabledSteppingMode;
    }

    public get availableSteppingModes(): LRP.SteppingMode[] {
        return this._availableSteppingModes;
    }

    public get enabledStep(): LRP.Step {
        return this._enabledStep ? this._enabledStep : this.availableSteps[0];
    }
}