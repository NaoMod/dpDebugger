import * as LRP from "./lrp";

export class StepManager {
    private _enabledSteppingMode?: LRP.SteppingMode;
    private _enabledStep?: LRP.Step;

    public availableSteps?: LRP.Step[];
    public locations: Map<LRP.Step, LRP.Location | null>;
    
    constructor(private _availableSteppingModes: LRP.SteppingMode[]) {
        this._enabledSteppingMode = _availableSteppingModes.length > 0 ? _availableSteppingModes[0] : undefined;
        this._enabledStep = undefined;
        this.availableSteps = undefined;
        this.locations = new Map();
    }

    public enableSteppingMode(steppingModeId: string): void {
        const steppingMode: LRP.SteppingMode | undefined = this.availableSteppingModes.find(steppingMode => steppingMode.id == steppingModeId);

        if (!steppingMode) throw new Error(`No stepping mode with ID ${steppingModeId}.`);

        this._enabledSteppingMode = steppingMode;
    }

    public enableStep(stepId?: string) {
        this._enabledStep = this.availableSteps?.find(step => step.id === stepId);
    }

    public get enabledSteppingModeId(): string {
        if (!this._enabledSteppingMode) throw new Error('No stepping mode configured.');

        return this._enabledSteppingMode.id;
    }

    public get enabledSteppingMode(): LRP.SteppingMode | undefined {
        return this._enabledSteppingMode;
    }

    public get availableSteppingModes(): LRP.SteppingMode[] {
        return this._availableSteppingModes;
    }

    public get enabledStep(): LRP.Step {
        return this._enabledStep ? this._enabledStep : this.availableSteps![0];
    }
}