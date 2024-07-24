import { Variable } from "@vscode/debugadapter";
import * as LRDP from "./lrdp";
import { ProcessedModel } from "./modelElementProcess";

export const AST_ROOT_VARIABLES_REFERENCE: number = 1;
export const RUNTIME_STATE_ROOT_VARIABLES_REFERENCE: number = 2;

/**
 * Handles the storage and retrieval of model elements (both for the AST and runtime state)
 * as {@link Variable} used by DAP. For more info about this, see the documentation about DAP variables: 
 * {@link https://microsoft.github.io/debug-adapter-protocol/specification#Types_Variable}.
 */
export class VariableHandler {
    private processedAst: ProcessedModel;

    private processedRuntimeState?: ProcessedModel;

    /** Registry of current variables references. */
    private variableReferenceRegistry: VariableReferenceRegistry;

    /** Current reference to assign. */
    private currentReference: number;

    constructor(processedAst: ProcessedModel) {
        this.processedAst = processedAst;
        this.processedRuntimeState = undefined;

        this.variableReferenceRegistry = new VariableReferenceRegistry();
        this.variableReferenceRegistry.set(processedAst.root, AST_ROOT_VARIABLES_REFERENCE);

        this.currentReference = 2;
    }

    /**
     * Retrieves the variables associated to a given reference.
     * If a variable contains other variables (i.e., is not a basic type), the reference for
     * the direct children variables are returned instead of the children variables themselves.
     * 
     * Should only be called after {@link initExecution} has been called.
     * 
     * @param variablesReference Reference of the variables.
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
     * Invalidates the current runtime state.
     */
    public invalidateRuntime(): void {
        this.processedRuntimeState = undefined;
        this.variableReferenceRegistry.clear();
        this.variableReferenceRegistry.set(this.processedAst.root, AST_ROOT_VARIABLES_REFERENCE);
        this.currentReference = 2;
    }

    /**
     * Updates the current runtime state.
     * 
     * @param runtimeStateRoot New runtime state.
     */
    public updateRuntime(processedRuntimeState: ProcessedModel): void {
        this.processedRuntimeState = processedRuntimeState;
        this.variableReferenceRegistry.clear();
        this.variableReferenceRegistry.set(this.processedAst.root, AST_ROOT_VARIABLES_REFERENCE);
        this.variableReferenceRegistry.set(this.processedRuntimeState.root, RUNTIME_STATE_ROOT_VARIABLES_REFERENCE);

        this.currentReference = 3;
    }

    /**
     * Retrieves the variables contained in a model element.
     * 
     * @param element Model element for which to retrieve variables.
     * @returns The variables corresponding to the attributes, references and children of the model element.
     */
    private getVariablesForModelElement(element: LRDP.ModelElement): Variable[] {
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
     * @param array Array for which to retrieve variables.
     * @returns The variables corresponding to the elements contained in the array.
     */
    private getVariablesForArray(array: any[]): Variable[] {
        const variables: Variable[] = [];

        if (this.processedAst.multivaluedRefs.has(array) || this.processedRuntimeState?.multivaluedRefs.has(array)) {
            for (let i = 0; i < array.length; i++) {
                variables.push(this.createVariableFromRef(i.toString(), array[i]));
            }
        } else {
            for (let i = 0; i < array.length; i++) {
                variables.push(this.createVariable(i.toString(), array[i]));
            }
        }

        return variables;
    }

    /**
     * Creates a variable for an object.
     * 
     * @param name Name of the variable.
     * @param object Object for which to create the variable.
     * @returns The variable corresponding to the object.
     */
    private createVariable(name: string, object: any): Variable {
        if (object === null) return new Variable(name, JSON.stringify(object));

        if (Array.isArray(object)) return new Variable(name, 'Array[' + object.length + ']', this.getReference(object), object.length);

        if (this.isModelElement(object)) return new Variable(name, `[${object.types.join(', ')}]`, this.getReference(object));
        if (typeof object === 'object') throw new Error('Malformed model element.');

        return new Variable(name, JSON.stringify(object));
    }

    /**
     * Creates a variable for a reference.
     * 
     * @param name Name of the variable.
     * @param ref Reference for which to create the variable.
     * @returns The variable corresponding to the reference.
     */
    private createVariableFromRef(name: string, ref: string | string[]): Variable {
        if (ref === null) return new Variable(name, JSON.stringify(ref));

        if (Array.isArray(ref)) {
            if (ref.length == 0) return new Variable(name, 'Array[' + ref.length + ']');

            const reference: number = this.getReference(ref);
            return new Variable(name, 'Array[' + ref.length + ']', reference, ref.length);
        }

        let referencedObject: LRDP.ModelElement | undefined = this.processedAst.idToElement.get(ref);
        if (referencedObject === undefined) referencedObject = this.processedRuntimeState?.idToElement.get(ref);
        if (referencedObject === undefined) throw new Error('Reference ' + ref + ' is invalid.');

        return new Variable(name, `[${referencedObject.types.join(', ')}]`, this.getReference(referencedObject));

    }

    /**
     * Retrieves the reference associated to an object.
     * 
     * @param object Object for which to retrieve the reference.
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
     * @param object Object to check.
     * @returns True if the object is a model element, false otherwise.
     */
    private isModelElement(object: any): object is LRDP.ModelElement {
        if (object['id'] === undefined) return false;
        if (object['types'] === undefined) return false;
        if (object['attributes'] === undefined) return false;
        if (object['refs'] === undefined) return false;
        if (object['children'] === undefined) return false;

        return true;
    }
}


/**
 * Stores the variables reference for model elements and arrays.
 */
class VariableReferenceRegistry {
    /** Map from references to their associated element or literal value. */
    private referenceToObject: Map<number, any>;

    /** Map of elements or literal values to their reference. */
    private objectToReference: Map<any, number>;

    constructor() {
        this.referenceToObject = new Map();
        this.objectToReference = new Map();
    }

    /**
     * Associates a variables reference to an object (either a model element or an array).
     * 
     * @param object Object to give a variables reference to.
     * @param reference Variables reference to give to the object.
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
     * @param reference Variables reference of the object to return.
     * @returns The object with the given variables reference.
     */
    public getObject(reference: number): any | undefined {
        return this.referenceToObject.get(reference);
    }

    /**
     * Retrieves the variables reference of the given object.
     * 
     * @param object Object for which to return a variables reference.
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