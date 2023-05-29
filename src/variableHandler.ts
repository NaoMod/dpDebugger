import { Variable } from "@vscode/debugadapter";
import { ModelElement } from "./lrp";

export const AST_ROOT_VARIABLES_REFERENCE: number = 1;
export const RUNTIME_STATE_ROOT_VARIABLES_REFERENCE: number = 2;


/**
 * Handles the storage and retrieval of model elements (both for the AST and runtime state)
 * as {@link Variable} used by DAP. For more info about this, see the documentation about DAP variables: 
 * {@link https://microsoft.github.io/debug-adapter-protocol/specification#Types_Variable}.
 */
export class VariableHandler {

    private astRoot: ModelElement;
    private runtimeStateRoot: ModelElement;

    private idToAstElement: Map<string, ModelElement>;
    private idToRuntimeStateElement: Map<string, ModelElement>;

    private variableReferenceRegistry: VariableReferenceRegistry;

    private currentReference: number;

    constructor(astRoot: ModelElement, runtimeStateRoot: ModelElement) {
        this.astRoot = astRoot;
        this.runtimeStateRoot = runtimeStateRoot;

        this.idToAstElement = this.buildRegistry(astRoot);
        this.idToRuntimeStateElement = this.buildRegistry(runtimeStateRoot);

        this.variableReferenceRegistry = new VariableReferenceRegistry();
        this.variableReferenceRegistry.set(astRoot, AST_ROOT_VARIABLES_REFERENCE);
        this.variableReferenceRegistry.set(runtimeStateRoot, RUNTIME_STATE_ROOT_VARIABLES_REFERENCE);

        this.currentReference = 3;
    }


    /**
     * Retrieves the variables associated to a given reference.
     * If a variable contains other variables (i.e., is not a basic type), the reference for
     * the direct children variables are returned instead of the children variables themselves.
     * 
     * Should only be called after {@link initExecution} has been called.
     * 
     * @param variablesReference The reference of the variables.
     * @returns The list of variables associated to the given reference.
     */
    public getVariables(variablesReference: number): Variable[] {
        const object: any = this.variableReferenceRegistry.getObject(variablesReference);

        if (object === undefined) throw new Error('Variable reference ' + variablesReference + ' not found.');

        if (Array.isArray(object)) return this.getVariablesForArray(object);

        if (this.isModelElement(object)) return this.getVariablesForModelElement(object);

        throw new Error('Object with variables reference ' + variablesReference + ' is neither an array or a ModelElement.');
    }

    /**
     * Updates the current runtime state.
     * 
     * @param runtimeStateRoot The new runtime state.
     */
    public updateRuntime(runtimeStateRoot: ModelElement): void {
        this.runtimeStateRoot = runtimeStateRoot;

        this.idToRuntimeStateElement = this.buildRegistry(runtimeStateRoot);

        this.variableReferenceRegistry.clear();
        this.variableReferenceRegistry.set(this.astRoot, AST_ROOT_VARIABLES_REFERENCE);
        this.variableReferenceRegistry.set(this.runtimeStateRoot, RUNTIME_STATE_ROOT_VARIABLES_REFERENCE);

        this.currentReference = 3;
    }

    /**
     * Retrieves the variables contained in a model element.
     * 
     * @param element The model element for which to retrieve variables.
     * @returns The variables corresponding to the attributes, references and children of the model element.
     */
    private getVariablesForModelElement(element: ModelElement): Variable[] {
        const variables: Variable[] = [];

        for (const attribute of Object.entries(element.attributes)) {
            variables.push(this.createVariable(attribute[0], attribute[1]));
        }

        for (const ref of Object.entries(element.refs)) {
            variables.push(this.createVariableFromRef(ref[0], ref[1]));
        }

        for (const child of Object.entries(element.children)) {
            variables.push(this.createVariable(child[0], child[1]));
        }

        return variables;
    }

    /**
     * Retrieves the variables contained in an array.
     * 
     * @param array The array for which to retrieve variables.
     * @returns The variables corresponding to the elements contained in the array.
     */
    private getVariablesForArray(array: any[]): Variable[] {
        const variables: Variable[] = [];

        for (let i = 0; i < array.length; i++) {
            variables.push(this.createVariable(i.toString(), array[i]));
        }

        return variables;
    }

    /**
     * Adds model elements to the registry of all model elements.
     * 
     * @param modelRoot The root from which to add model elements. All model elements recursively contained by the 
     * root will be added to the registry.
     * @returns The registry built from the model root.
     */
    private buildRegistry(modelRoot: ModelElement): Map<string, ModelElement> {
        const res: Map<string, ModelElement> = new Map();
        this.addElements(modelRoot, res);

        return res;
    }

    /**
     * Add a single model element to a registry of all model elements.
     * 
     * @param currentElement The model element to add to the registry.
     * @param registry The registry of model elements.
     */
    private addElements(currentElement: ModelElement, registry: Map<string, ModelElement>): void {
        if (currentElement === null) return;
        
        registry.set(currentElement.id, currentElement);

        for (const child of Object.values(currentElement.children)) {
            if (Array.isArray(child)) {
                for (const grandchild of child) {
                    this.addElements(grandchild, registry);
                }
            } else {
                this.addElements(child, registry);
            }
        }
    }

    /**
     * Creates a variable for an object.
     * 
     * @param name The name of the variable.
     * @param object The object for which to create the variable.
     * @returns The variable corresponding to the object.
     */
    private createVariable(name: string, object: any): Variable {
        if (object === null) return new Variable(name, JSON.stringify(object));

        if (Array.isArray(object)) return new Variable(name, 'Array[' + object.length + ']', this.getReference(object), object.length);

        if (this.isModelElement(object)) return new Variable(name, object.type, this.getReference(object));
        if (typeof object === 'object') throw new Error('Malformed model element.');

        return new Variable(name, JSON.stringify(object));
    }

    /**
     * Creates a variable for a reference.
     * 
     * @param name The name of the variable.
     * @param ref The reference for which to create the variable.
     * @returns The variable corresponding to the reference.
     */
    private createVariableFromRef(name: string, ref: string | string[]): Variable {
        if (ref === null) return new Variable(name, JSON.stringify(ref));

        if (Array.isArray(ref)) {
            if (ref.length == 0) return new Variable(name, 'Array[' + ref.length + ']');

            return new Variable(name, 'Array[' + ref.length + ']', this.getReference(ref), ref.length);
        }

        let referencedObject: ModelElement | undefined = this.idToAstElement.get(ref);
        if (referencedObject === undefined) referencedObject = this.idToRuntimeStateElement.get(ref);
        if (referencedObject === undefined) throw new Error('Reference ' + ref + ' is invalid.');

        return new Variable(name, referencedObject.type, this.getReference(referencedObject));

    }

    /**
     * Retrieves the reference associated to an object.
     * 
     * @param object The object for which to retrieve the reference.
     * @returns The reference associated to the object.
     */
    private getReference(object: any): number {
        let reference: number | undefined = this.variableReferenceRegistry.getReference(object);
        if (reference === undefined) {
            reference = this.currentReference;
            this.variableReferenceRegistry.set(object, reference);
            this.currentReference++;
        }

        return reference;
    }

    /**
     * Checks whether an object is a model element.
     * 
     * @param object The object to check.
     * @returns True if the object is a model element, false otherwise.
     */
    private isModelElement(object: any): object is ModelElement {
        // best way to go through keys of ModelElement interface since the keyof keyword is not available
        // will break when ModelElement is changed
        class ModelElementImpl implements ModelElement {
            id: string;
            type: string;
            children: { [key: string]: ModelElement | ModelElement[]; };
            refs: { [key: string]: string | string[]; };
            attributes: { [key: string]: any; };
        }

        for (const key of Object.keys(new ModelElementImpl())) {
            if (!Object.keys(object).includes(key)) return false;
        }

        return true;
    }
}


/**
 * Stores the variables reference for model elements and arrays.
 */
class VariableReferenceRegistry {

    private referenceToObject: Map<number, any>;
    private objectToReference: Map<any, number>;

    constructor() {
        this.referenceToObject = new Map();
        this.objectToReference = new Map();
    }

    /**
     * Associates a variables reference to an object (either a model element or an array).
     * 
     * @param object The object to give a variables reference to.
     * @param reference The variables reference to give to the object.
     * @returns True if the variables reference was successfully associated to the object, false otherwise.
     */
    public set(object: any, reference: number): boolean {
        if (this.referenceToObject.has(reference) || this.objectToReference.has(object)) return false;

        this.referenceToObject.set(reference, object);
        this.objectToReference.set(object, reference);

        return true;
    }

    /**
     * Retrieves the object with the given variables reference.
     * 
     * @param reference The variables reference of the object to return.
     * @returns The object with the given variables reference.
     */
    public getObject(reference: number): any | undefined {
        return this.referenceToObject.get(reference);
    }

    /**
     * Retrieves the variables reference of the given object.
     * 
     * @param object The object for which to return a variables reference.
     * @returns Th variables reference of the object, or undefined if it has no variables reference.
     */
    public getReference(object: any): number | undefined {
        return this.objectToReference.get(object);
    }

    /**
     * Clears the stored variables references.
     */
    public clear(): void {
        this.objectToReference.clear();
        this.referenceToObject.clear();
    }
}