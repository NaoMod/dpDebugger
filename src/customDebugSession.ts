import { Breakpoint, DebugSession, InitializedEvent, Response, Scope, Source, StackFrame, StoppedEvent, TerminatedEvent, Thread } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import { CustomDebugRuntime, InitializationParams } from "./customDebugRuntime";
import { CustomRequestHandler, CustomRequestResult } from "./customRequestHandler";
import * as LRDP from "./lrdp";
import { AST_ROOT_VARIABLES_REFERENCE, RUNTIME_STATE_ROOT_VARIABLES_REFERENCE } from "./variableHandler";


export interface CustomLaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    /** Source file for which to launch execution. */
    sourceFile: string;

    /** Port on which the language runtime associated to the source file is listening. */
    languageRuntimePort: number;

    /** True if the program should pause before executing the first step. */
    pauseOnStart?: boolean;

    /** True if the program should pause after executing the last step, instead of terminating the debug session. */
    pauseOnEnd?: boolean;

    /** Additional arguments that may be required for specific languages. */
    additionalArgs?: any;
}


/**
 * Handles DAP requests for a specific source file.
 * 
 * Custom error codes:
 * - 100: not implemented
 * - 200: debug session not initialized
 * - 201: debug session already initialized
 */
export class CustomDebugSession extends DebugSession {

    // Hardcoded ID for the default thread
    static readonly threadID: number = 1;

    private isInitialized: boolean = false;
    private runtime: CustomDebugRuntime;
    private initializeArgs: DebugProtocol.InitializeRequestArguments;
    private customRequestHandler: CustomRequestHandler;

    /**
     * 
     * @param request 
     */
    protected dispatchRequest(request: DebugProtocol.Request): void {
        const response = new Response(request);

        // Check that the server is initialized
        if (!this.isInitialized && request.command !== 'initialize') {
            this.sendErrorResponse(response, {
                id: 200, format: '{_exception}', variables: {
                    _exception: 'The debug adapter is not yet initialized.'
                }
            });

            return;
        }

        super.dispatchRequest(request);
    }

    /**
     * The initialize request is sent as the first request from the client to the debug adapter in order to configure it with client capabilities and to retrieve capabilities from the debug adapter.
     * Until the debug adapter has responded with an initialize response, the client must not send any additional requests or events to the debug adapter.
     * In addition the debug adapter is not allowed to send any requests or events to the client until it has responded with an initialize response.
     * The initialize request may only be sent once.
     * 
     * @param response 
     * @param args 
     */
    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        if (this.isInitialized) {
            this.sendErrorResponse(response, {
                id: 201, format: '{_exception}', variables: {
                    _exception: 'The debug adapter is already initialized.'
                }
            });
            return;
        }

        this.initializeArgs = args;

        response.body = {};

        // This debug adapter does not support delayed loading of stack frames.
        /* This should be true as it is currently supported by this debugger,
        but for some reason VSCode is messing up with it so it is set as false for the moment. */
        response.body.supportsDelayedStackTraceLoading = false;

        // This default debug adapter does not support conditional breakpoints.
        response.body.supportsConditionalBreakpoints = false;
        response.body.supportsSingleThreadExecutionRequests = false;
        /** The debug adapter does not support the 'breakpointLocations' request. */
        response.body.supportsBreakpointLocationsRequest = false;
        // This default debug adapter does not support hit conditional breakpoints.
        response.body.supportsHitConditionalBreakpoints = false;
        // This default debug adapter does not support function breakpoints.
        response.body.supportsFunctionBreakpoints = false;
        // This default debug adapter implements the 'configurationDone' request.
        response.body.supportsConfigurationDoneRequest = true;
        // This default debug adapter does not support hovers based on the 'evaluate' request.
        response.body.supportsEvaluateForHovers = false;
        // This default debug adapter does not support the 'stepBack' request.
        response.body.supportsStepBack = false;
        // This default debug adapter does not support the 'setVariable' request.
        response.body.supportsSetVariable = false;
        // This default debug adapter does not support the 'restartFrame' request.
        response.body.supportsRestartFrame = false;
        // This default debug adapter does not support the 'stepInTargets' request.
        response.body.supportsStepInTargetsRequest = false;
        // This default debug adapter does not support the 'gotoTargets' request.
        response.body.supportsGotoTargetsRequest = false;
        // This default debug adapter does not support the 'completions' request.
        response.body.supportsCompletionsRequest = false;
        // This default debug adapter does not support the 'restart' request.
        response.body.supportsRestartRequest = false;
        // This default debug adapter does not support the 'exceptionOptions' attribute on the 'setExceptionBreakpoints' request.
        response.body.supportsExceptionOptions = false;
        // This default debug adapter does not support the 'format' attribute on the 'variables', 'evaluate', and 'stackTrace' request.
        response.body.supportsValueFormattingOptions = false;
        // This debug adapter does not support the 'exceptionInfo' request.
        response.body.supportsExceptionInfoRequest = false;
        // This debug adapter does not support the 'TerminateDebuggee' attribute on the 'disconnect' request.
        response.body.supportTerminateDebuggee = false;
        // This debug adapter does not support the 'loadedSources' request.
        response.body.supportsLoadedSourcesRequest = false;
        // This debug adapter does not support the 'logMessage' attribute of the SourceBreakpoint.
        response.body.supportsLogPoints = false;
        // This debug adapter does not support the 'terminateThreads' request.
        response.body.supportsTerminateThreadsRequest = false;
        // This debug adapter does not support the 'setExpression' request.
        response.body.supportsSetExpression = false;
        // This debug adapter does not support the 'terminate' request.
        response.body.supportsTerminateRequest = false;
        // This debug adapter does not support data breakpoints.
        response.body.supportsDataBreakpoints = false;
        /** This debug adapter does not support the 'readMemory' request. */
        response.body.supportsReadMemoryRequest = false;
        /** The debug adapter does not support the 'disassemble' request. */
        response.body.supportsDisassembleRequest = false;
        /** The debug adapter does not support the 'cancel' request. */
        response.body.supportsCancelRequest = false;
        /** The debug adapter does not support the 'clipboard' context value in the 'evaluate' request. */
        response.body.supportsClipboardContext = false;
        /** The debug adapter does not support stepping granularities for the stepping requests. */
        response.body.supportsSteppingGranularity = false;
        /** The debug adapter does not support the 'setInstructionBreakpoints' request. */
        response.body.supportsInstructionBreakpoints = false;
        /** The debug adapter does not support 'filterOptions' on the 'setExceptionBreakpoints' request. */
        response.body.supportsExceptionFilterOptions = false;

        this.sendResponse(response);
        this.sendEvent(new InitializedEvent());
        this.isInitialized = true;
    }

    /**
     * The attach request is sent from the client to the debug adapter to attach to a debuggee that is already running.
     * Since attaching is debugger/runtime specific, the arguments for this request are not part of this specification.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected attachRequest(response: DebugProtocol.AttachResponse, args: DebugProtocol.AttachRequestArguments, request?: DebugProtocol.Request | undefined): void {
        this.sendErrorResponse(response, {
            id: 100, format: '{_exception}', variables: {
                _exception: 'Method attachRequest not implemented.'
            }
        });
    }

    /**
     * The disconnect request asks the debug adapter to disconnect from the debuggee (thus ending the debug session) and then to shut down itself (the debug adapter).
     * In addition, the debug adapter must terminate the debuggee if it was started with the launch request. If an attach request was used to connect to the debuggee, then the debug adapter must not terminate the debuggee.
     * This implicit behavior of when to terminate the debuggee can be overridden with the terminateDebuggee argument (which is only supported by a debug adapter if the corresponding capability supportTerminateDebuggee is true).
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request | undefined): void {
        super.disconnectRequest(response, args, request);
        if (!(this._isServer || this._isRunningInline())) {
            console.error(">> shutting down");
        }
    }

    /**
     * The request retrieves a list of all threads.
     * 
     * @param response 
     * @param request 
     */
    protected async threadsRequest(response: DebugProtocol.ThreadsResponse, request?: DebugProtocol.Request | undefined): Promise<void> {
        await this.runtime.waitForInitialization();

        // Mock thread
        response.body = {
            threads: [
                new Thread(CustomDebugSession.threadID, "Unique Thread")
            ]
        };

        await this.runtime.updateRuntimeState();
        this.sendResponse(response);
    }

    /**
     * This launch request is sent from the client to the debug adapter to start the debuggee with or without debugging (if noDebug is true).
     * Since launching is debugger/runtime specific, the arguments for this request are not part of this specification.
     * 
     * @param response 
     * @param args
     * @param request 
     */
    protected async launchRequest(response: DebugProtocol.LaunchResponse, args: CustomLaunchRequestArguments, request?: DebugProtocol.Request | undefined): Promise<void> {
        this.sendResponse(response);
        if (args.noDebug) throw new Error('Debugging must be enabled.');

        const initArgs: InitializationParams = {
            linesStartAt1: this.initializeArgs.linesStartAt1 == undefined ? true : this.initializeArgs.linesStartAt1,
            columnsStartAt1: this.initializeArgs.columnsStartAt1 == undefined ? true : this.initializeArgs.columnsStartAt1
        }

        this.runtime = new CustomDebugRuntime(this, args.sourceFile, args.languageRuntimePort, args.pauseOnEnd ? args.pauseOnEnd : false, initArgs);
        this.customRequestHandler = new CustomRequestHandler(this.runtime);

        await this.runtime.initializeExecution(args.pauseOnStart ? args.pauseOnStart : false, args.additionalArgs);
        
        if (!args.pauseOnStart && !this.runtime.isExecutionDone) this.runtime.run();
    }

    /**
     * The request retrieves the source code for a given source reference.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected sourceRequest(response: DebugProtocol.SourceResponse, args: DebugProtocol.SourceArguments, request?: DebugProtocol.Request | undefined): void {
        this.sendErrorResponse(response, {
            id: 100, format: '{_exception}', variables: {
                _exception: 'Method sourceRequest not implemented.'
            }
        });
    }

    /**
     * The request suspends the debuggee.
     * The debug adapter first sends the response and then a stopped event (with reason pause) after the thread has been paused successfully.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments, request?: DebugProtocol.Request | undefined): void {
        this.sendResponse(response);
        this.runtime.pause();
    }

    /**
     * The request executes one step (in the given granularity) for the specified thread and allows all other threads to run freely by resuming them.
     * If the debug adapter supports single thread execution (see capability supportsSingleThreadExecutionRequests), setting the singleThread argument to true prevents other suspended threads from resuming.
     * The debug adapter first sends the response and then a stopped event (with reason step) after the step has completed.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected async nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments, request?: DebugProtocol.Request | undefined): Promise<void> {
        this.sendResponse(response);
        this.runtime.nextStep();
    }

    /**
     * The request resumes execution of all threads. If the debug adapter supports single thread execution (see capability supportsSingleThreadExecutionRequests), setting the singleThread argument to true resumes only the specified thread. If not all threads were resumed, the allThreadsContinued attribute of the response should be set to false.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments, request?: DebugProtocol.Request | undefined): void {
        this.sendResponse(response);
        this.runtime.run();
    }

    /**
     * Sets multiple breakpoints for a single source and clears all previous breakpoints in that source.
     * To clear all breakpoint for a source, specify an empty array.
     * When a breakpoint is hit, a stopped event (with reason breakpoint) is generated.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments, request?: DebugProtocol.Request | undefined): Promise<void> {
        let breakpoints: DebugProtocol.Breakpoint[];

        if (args.source.path != this.runtime.sourceFile && args.source.name != this.runtime.sourceFile) {
            breakpoints = args.breakpoints ? args.breakpoints.map(() => new Breakpoint(false)) : [];
        } else {
            breakpoints = await this.runtime.setBreakpoints(args.breakpoints!);
        }

        response.body = {
            breakpoints: breakpoints
        }

        this.sendResponse(response);
    }

    /**
     * Evaluates the given expression in the context of the topmost stack frame.
     * The expression has access to any variables and arguments that are in scope.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments, request?: DebugProtocol.Request | undefined): void {
        this.sendErrorResponse(response, {
            id: 100, format: '{_exception}', variables: {
                _exception: 'Method not implemented.'
            }
        });
    }

    /**
     * The request resumes the given thread to step into a function/method and allows all other threads to run freely by resuming them.
     * If the debug adapter supports single thread execution (see capability supportsSingleThreadExecutionRequests), setting the singleThread argument to true prevents other suspended threads from resuming.
     * If the request cannot step into a target, stepIn behaves like the next request.
     * The debug adapter first sends the response and then a stopped event (with reason step) after the step has completed.
     * If there are multiple function/method calls (or other targets) on the source line, the argument targetId can be used to control into which target the stepIn should occur.
     * The list of possible targets for a given source line can be retrieved via the stepInTargets request.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected async stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments, request?: DebugProtocol.Request | undefined): Promise<void> {
        this.sendResponse(response);
        this.runtime.stepIn();
    }

    /**
     * The request resumes the given thread to step out (return) from a function/method and allows all other threads to run freely by resuming them.
     * If the debug adapter supports single thread execution (see capability supportsSingleThreadExecutionRequests), setting the singleThread argument to true prevents other suspended threads from resuming.
     * The debug adapter first sends the response and then a stopped event (with reason step) after the step has completed.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected async stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments, request?: DebugProtocol.Request | undefined): Promise<void> {
        this.sendResponse(response);
        this.runtime.stepOut();
    }

    /**
     * The request returns a stacktrace from the current execution state of a given thread.
     * A client can request all stack frames by omitting the startFrame and levels arguments. For performance-conscious clients and if the corresponding capability supportsDelayedStackTraceLoading is true, stack frames can be retrieved in a piecemeal way with the startFrame and levels arguments. The response of the stackTrace request may contain a totalFrames property that hints at the total number of frames in the stack. If a client needs this total number upfront, it can issue a request for a single (first) frame and depending on the value of totalFrames decide how to proceed. In any case a client should be prepared to receive fewer frames than requested, which is an indication that the end of the stack has been reached.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments, request?: DebugProtocol.Request | undefined): Promise<void> {
        const stack: LRDP.Step[] = this.runtime.stack;
        const stackLocations: Map<LRDP.Step, LRDP.Location | null> = this.runtime.stackLocations;
        const stackFrames: StackFrame[] = [];
        const startFrame: number = args.startFrame !== undefined ? args.startFrame : 0;
        const levels: number = args.levels !== undefined && args.levels <= stack.length ? args.levels : stack.length + 1;

        for (let i = startFrame; i < (startFrame + levels); i++) {
            if (i > stack.length) break;

            // Produce root frame
            if (i === stack.length) {
                const location: LRDP.Location | null | undefined = stack.length === 0 ? await this.runtime.getSelectedStepLocation() : stackLocations.get(stack[0]);
                if (location === undefined) throw new Error('Undefined location for stack step.');

                stackFrames.push({
                    id: stack.length,
                    name: 'Main',
                    source: new Source(this.runtime.sourceFile),
                    line: location !== null ? location.line : 0,
                    column: location !== null ? location.column : 0,
                    endLine: location !== null ? location.endLine : undefined,
                    endColumn: location !== null ? location.endColumn : undefined,
                    canRestart: false
                });

                continue;
            }

            // Produce frame for a composite step
            const location: LRDP.Location | null | undefined = i === 0 ? await this.runtime.getSelectedStepLocation() : stackLocations.get(stack[stack.length - i]);
            if (location === undefined) throw new Error('Undefined location for stack step.');

            stackFrames.push({
                id: startFrame + levels - i - 1,
                name: stack[stack.length - 1 - i].name,
                source: new Source(this.runtime.sourceFile),
                line: location !== null ? location.line : 0,
                column: location !== null ? location.column : 0,
                endLine: location !== null ? location.endLine : undefined,
                endColumn: location !== null ? location.endColumn : undefined,
                canRestart: false
            });
        }

        response.body = {
            stackFrames: stackFrames,
            totalFrames: stack.length + 1
        }

        this.sendResponse(response);
    }

    /**
     * The request returns the variable scopes for a given stackframe ID.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected async scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments, request?: DebugProtocol.Request | undefined): Promise<void> {
        response.body = {
            scopes: [
                new Scope('AST', AST_ROOT_VARIABLES_REFERENCE, false),
                new Scope('Runtime State', RUNTIME_STATE_ROOT_VARIABLES_REFERENCE, false)
            ]
        };

        this.sendResponse(response);
    }

    /**
     * 
     * Retrieves all child variables for the given variable reference.
     * A filter can be used to limit the fetched children to either named or indexed children.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request | undefined): Promise<void> {
        response.body = {
            variables: this.runtime.getVariables(args.variablesReference)
        };

        this.sendResponse(response);
    }

    /**
     * Handles dpDAP services that are not originally present in DAP.
     * 
     * @param command 
     * @param response 
     * @param args 
     * @param request 
     * @returns 
     */
    protected async customRequest(command: string, response: DebugProtocol.Response, args: any, request?: DebugProtocol.Request | undefined): Promise<void> {
        await this.runtime.waitForInitialization();

        const customRequestResponse: CustomRequestResult = this.customRequestHandler.handle(command, response, args);

        if (customRequestResponse.status === 'success') {
            if (customRequestResponse.event !== undefined) this.sendEvent(customRequestResponse.event);
            if (customRequestResponse.response !== undefined) this.sendResponse(customRequestResponse.response);
            return;
        }

        this.sendErrorResponse(response, customRequestResponse.error);
    }

    /**
     * Sends a {@link DebugProtocol.StoppedEvent} to the IDE.
     * 
     * @param reason Reason for the stopped event.
     * @param message Message to be displayed to the end-user.
     */
    public sendStoppedEvent(reason: string, message?: string): void {
        const stoppedEvent: DebugProtocol.StoppedEvent = new StoppedEvent(reason, CustomDebugSession.threadID);
        if (message) stoppedEvent.body.description = message;

        this.sendEvent(stoppedEvent);
    }

    /**
     * Sends a {@link DebugProtocol.TerminatedEvent} to the IDE.
     */
    public sendTerminatedEvent(): void {
        this.sendEvent(new TerminatedEvent());
    }
}