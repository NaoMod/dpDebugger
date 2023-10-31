import * as DAPExtension from "./DAPExtension";
import { Step, SteppingMode } from "./lrp";

export class StepManager {
    private _enabledSteppingMode?: SteppingMode;
    private _enabledStep?: Step;

    public availableSteps: Step[];
    
    constructor(private _availableSteppingModes: SteppingMode[]) {
        this._enabledSteppingMode = _availableSteppingModes.length > 0 ? _availableSteppingModes[0] : undefined;
        this._enabledStep = undefined;
    }

    public enableSteppingMode(steppingModeId: string): void {
        const steppingMode: SteppingMode | undefined = this.availableSteppingModes.find(steppingMode => steppingMode.id == steppingModeId);

        if (!steppingMode) throw new Error(`No stepping mode with ID ${steppingModeId}.`);

        this._enabledSteppingMode = steppingMode;
    }

    public enableStep(stepId?: string) {
        this._enabledStep = this.availableSteps.find(step => step.id === stepId);
    }

    public get enabledSteppingModeId(): string {
        if (!this._enabledSteppingMode) throw new Error('No stepping mode configured.');

        return this._enabledSteppingMode.id;
    }

    public get enabledSteppingMode(): SteppingMode | undefined {
        return this._enabledSteppingMode;
    }

    public get availableSteppingModes(): DAPExtension.SteppingMode[] {
        return this._availableSteppingModes.map(mode => {
            return {
                id: mode.id,
                name: mode.name,
                description: mode.description,
                isEnabled: (this.enabledSteppingMode != undefined) && (this.enabledSteppingMode.id == mode.id)
            };
        });
    }

    public get enabledStep(): Step | undefined {
        return this._enabledStep;
    }
}