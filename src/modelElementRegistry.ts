import * as LRP from "./lrp";

export class ModelElementTypeRegistry {
    private typeToAstElements?: Map<string, LRP.ModelElement[]>;
    private typeToRuntimeStateElements?: Map<string, LRP.ModelElement[]>;

    public registerAstElements(typeToAstElements: Map<string, LRP.ModelElement[]>): void {
        this.typeToAstElements = typeToAstElements;
    }

    public registerRuntimeStateElements(typeToRuntimeStateElements: Map<string, LRP.ModelElement[]>): void {
        this.typeToRuntimeStateElements = typeToRuntimeStateElements;
    }

    public getModelElementsFromType(type: string): LRP.ModelElement[] {
        const fromAst: LRP.ModelElement[] | undefined = this.typeToAstElements?.get(type);
        const fromRuntimeState: LRP.ModelElement[] | undefined = this.typeToRuntimeStateElements?.get(type);

        const res: LRP.ModelElement[] = [];
        if (fromAst !== undefined) res.push(...fromAst);
        if (fromRuntimeState !== undefined) res.push(...fromRuntimeState);

        return res;
    }
}