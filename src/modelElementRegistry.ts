import * as LRDP from "./lrdp";

export class ModelElementTypeRegistry {
    private typeToAstElements?: Map<string, LRDP.ModelElement[]>;
    private typeToRuntimeStateElements?: Map<string, LRDP.ModelElement[]>;

    public registerAstElements(typeToAstElements: Map<string, LRDP.ModelElement[]>): void {
        this.typeToAstElements = typeToAstElements;
    }

    public registerRuntimeStateElements(typeToRuntimeStateElements: Map<string, LRDP.ModelElement[]>): void {
        this.typeToRuntimeStateElements = typeToRuntimeStateElements;
    }

    public getModelElementsFromType(type: string): LRDP.ModelElement[] {
        const fromAst: LRDP.ModelElement[] | undefined = this.typeToAstElements?.get(type);
        const fromRuntimeState: LRDP.ModelElement[] | undefined = this.typeToRuntimeStateElements?.get(type);

        const res: LRDP.ModelElement[] = [];
        if (fromAst !== undefined) res.push(...fromAst);
        if (fromRuntimeState !== undefined) res.push(...fromRuntimeState);

        return res;
    }
}