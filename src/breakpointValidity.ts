import * as DAPExtension from "./DAPExtension";
import * as LRDP from "./lrdp";

export function isValidBreakpoint(breakpoint: DAPExtension.DomainSpecificBreakpoint, breakpointType: LRDP.BreakpointType): boolean {
    const entries: [string, unknown][] = Object.entries(breakpoint.entries);
    if (entries.length !== breakpointType.parameters.length) return false;

    for (const parameter of breakpointType.parameters) {
        const entry: [string, unknown] | undefined = entries.find(e => e[0] === parameter.name);
        if (entry === undefined || !isValidEntry(entry, parameter)) return false;
    }

    return true;
}

function isValidEntry(entry: [string, unknown], parameter: LRDP.BreakpointParameter): boolean {
    return parameter.isMultivalued ? handleMultivaluedEntry(entry, parameter) : handleSinglevaluedEntry(entry, parameter);
}

function handleMultivaluedEntry(entry: [string, unknown], parameter: LRDP.BreakpointParameter): boolean {
    if (!Array.isArray(entry[1])) return false;

    if (parameter.type === 'element') return entry[1].every((element): element is string => typeof element === "string");

    switch (parameter.primitiveType) {
        case "boolean":
            return entry[1].every((element): element is boolean => typeof element === "boolean");

        case "number":
            return entry[1].every((element): element is number => typeof element === "number");

        case "string":
            return entry[1].every((element): element is string => typeof element === "string");
    }
}

function handleSinglevaluedEntry(entry: [string, unknown], parameter: LRDP.BreakpointParameter): boolean {
    if (parameter.type === 'element') return typeof entry[1] === "string";

    switch (parameter.primitiveType) {
        case "boolean":
            return typeof entry[1] === "boolean";

        case "number":
            return typeof entry[1] === "number";

        case "string":
            return typeof entry[1] === "string";
    }
}