import * as LRP from "./lrp";

/**
 * Allows quick retrieval of model elements.
 */
export class ASTElementLocator {
    /** Map of lines to the AST elements they contain. */
    private locations: Map<number, LRP.ModelElement[]>;

    /** Line offset of the IDE. */
    private lineOffset: number;

    /** Column offset of the IDE. */
    private columnOffset: number;

    constructor(linesStartAt1: boolean, columnsStartAt1: boolean) {
        this.locations = new Map();
        this.lineOffset = -!!(!linesStartAt1);
        this.columnOffset = -!!(!columnsStartAt1);
    }

    public registerAst(astRoot: LRP.ModelElement): void {
        this.locations = this.registerLocations(astRoot, new Map());
    }

    /**
     * Retrieves a model element at a specific position in a textual source file.
     * 
     * @param line Line of the element in the source file.
     * @param column Column of the element in the source file.
     * @returns The model element at the given position, or undefined if there is none. 
     */
    public getElementFromPosition(line: number, column: number): LRP.ModelElement | undefined {
        for (let i = line + this.lineOffset; i >= 0; i--) {
            const lineElements: LRP.ModelElement[] | undefined = this.locations.get(i);
            if (!lineElements) continue;

            const elem: LRP.ModelElement | undefined = lineElements.find(elem => this.isPositionContained(elem, line + this.lineOffset, column + this.columnOffset));
            if (elem) return elem;
        }

        return undefined;
    }

    /**
     * Register a new model element from the AST.
     * 
     * @param element Element to register.
     */
    private registerLocations(element: LRP.ModelElement, locations: Map<number, LRP.ModelElement[]>): Map<number, LRP.ModelElement[]> {
        let res: Map<number, LRP.ModelElement[]> = new Map(locations);

        if (element.location) {
            const lineElements: LRP.ModelElement[] | undefined = res.get(element.location.line);
            if (lineElements === undefined) {
                res.set(element.location.line, [element]);
            } else {
                lineElements.push(element);
            }
        }

        for (const child of Object.values(element.children)) {
            if (!Array.isArray(child)) {
                res = this.registerLocations(child, res);
            } else {
                for (const subelement of child) {
                    res = this.registerLocations(subelement, res);
                }
            }
        }

        return res;
    }

    /**
     * Checks whether a position is contained in the location of a model element.
     * 
     * @param element Model element containing the location against which the position will be checked.
     * @param line Line of the position.
     * @param column Column of the position.
     * @returns True if the position is contained, false otherwise.
     */
    private isPositionContained(element: LRP.ModelElement, line: number, column: number): boolean {
        if (element.location!.line == line)
            return element.location!.endLine == line ? element.location!.column <= column && element.location!.endColumn >= column : element.location!.column <= column;

        if (element.location!.endLine == line)
            return element.location!.endColumn >= column;

        return element.location!.line <= line && element.location!.endLine >= line;
    }
}