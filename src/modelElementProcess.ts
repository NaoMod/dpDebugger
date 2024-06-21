import * as LRP from "./lrp";

/**
 * Processes a model element and its descendants to retrieve a {@link ProcessedModel}.
 * 
 * @param modelRoot Root element to process.
 * @returns The processed model.
 */
export function processModel(modelRoot: LRP.ModelElement): ProcessedModel {
    return {
        root: modelRoot,
        idToElement: buildIdRegistry(modelRoot),
        typeToElements: buildTypeRegistry(modelRoot),
        multivaluedRefs: findMultivaluedRefs(modelRoot)
    };
}

/**
 * Adds a model element and its descendants to the registry of all model elements.
 * 
 * @param element Element from which to add model elements. All model elements recursively contained by the 
 * root will be added to the registry.
 * @returns The ID registry built from the model root.
 */
function buildIdRegistry(element: LRP.ModelElement): Map<string, LRP.ModelElement> {
    let res: Map<string, LRP.ModelElement> = new Map();
    if (element === null) return res;

    res.set(element.id, element);

    for (const child of Object.values(element.children)) {
        if (Array.isArray(child)) {
            for (const grandchild of child) {
                res = new Map([...res, ...buildIdRegistry(grandchild)]);
            }
        } else {
            res = new Map([...res, ...buildIdRegistry(child)]);
        }
    }

    return res;
}

/**
 * Adds a model element and its descendants to the type registry.
 * 
 * @param element Element from which to add model elements. All model elements recursively contained by the 
 * root will be added to the registry.
 * @returns The type registry built from the model root.
 */
function buildTypeRegistry(element: LRP.ModelElement): Map<string, LRP.ModelElement[]> {
    let res: Map<string, LRP.ModelElement[]> = new Map();
    if (element === null) return res;

    for (const type of element.types) {
        res.set(type, [element]);
    }

    for (const child of Object.values(element.children)) {
        if (Array.isArray(child)) {
            for (const grandchild of child) {
                const typeRegistry: Map<string, LRP.ModelElement[]> = buildTypeRegistry(grandchild);
                for (const entry of typeRegistry.entries()) {
                    const registeredElements: LRP.ModelElement[] | undefined = res.get(entry[0]);
                    const newValue: LRP.ModelElement[] = registeredElements === undefined ? entry[1] : [...registeredElements, ...entry[1]];
                    res.set(entry[0], newValue);
                }
            }
        } else {
            const typeRegistry: Map<string, LRP.ModelElement[]> = buildTypeRegistry(child);
            for (const entry of typeRegistry.entries()) {
                const registeredElements: LRP.ModelElement[] | undefined = res.get(entry[0]);
                const newValue: LRP.ModelElement[] = registeredElements === undefined ? entry[1] : [...registeredElements, ...entry[1]];
                res.set(entry[0], newValue);
            }
        }
    }

    return res;
}

/**
 * Finds the multivalued refs contained by a model element and its descendants.
 * 
 * @param element Element from which to search for multivalued references.
 * @returns The set of multivalued references.
 */
function findMultivaluedRefs(element: LRP.ModelElement): Set<any[]> {
    let res: Set<any[]> = new Set();
    if (element == null) return res;

    for (const ref of Object.values(element.refs)) {
        if (Array.isArray(ref)) {
            res.add(ref);
        }
    }

    for (const child of Object.values(element.children)) {
        if (Array.isArray(child)) {
            for (const grandchild of child) {
                res = new Set([...res, ...findMultivaluedRefs(grandchild)]);
            }
        } else {
            res = new Set([...res, ...findMultivaluedRefs(child)]);
        }
    }

    return res;
}

/** Stores information retrieved after the processing of a root model element. */
export type ProcessedModel = {
    root: LRP.ModelElement;
    idToElement: Map<string, LRP.ModelElement>;
    typeToElements: Map<string, LRP.ModelElement[]>;
    multivaluedRefs: Set<any[]>;
};